#!/usr/bin/env node
// Narrow HOST runtime (US-479 T-25, S7): entry preparation, journal/usage observation and
// reconciliation, metric publication. Runs OUTSIDE the Workflow sandbox (which has no Date/fs/exec
// or usage API) — on the host, via the coordinator's existing shell executor. Imports STATE/COMMENT/
// METRICS; introduces no new agent. One scoped deterministic local process, not a global watcher.
//
//   node <skill dir>/scripts/cycle-runtime.mjs entry --dir <abs> --repo <owner/name> --story <id> [--pr <n>] [--workflowVersion <v>]
//     → { capsule, telemetry }  — capsule per S1 (schema/workflow identity, canonical run
//       reference, PR/story/branch, expectedHead, scopeBaselineHash, last handoff identity, typed
//       next step) — a cache hint, never approval. `telemetry` names what this host can observe.
//
//   node <skill dir>/scripts/cycle-runtime.mjs observe --dir <abs> --journal <path> [--usage <path>]
//        --repository <owner/name> --story <id> --branch <b> [--pr <n>] [--runId <id>]
//        [--interval-ms 5000] [--grace-ms 30000] [--max-ticks <n>]
//     → tails ONLY the named sources on the interval, merges idempotently, reduces metrics,
//       writes metrics.json/metrics.md atomically, prints one concise progress line per tick.
//       Stops after a durable terminal result AND reconciliation of declared sources (or the grace
//       period elapses — finalize partial, allow a later `reconcile`), or on SIGINT/SIGTERM.
//
//   node <skill dir>/scripts/cycle-runtime.mjs reconcile --dir <abs> --journal <path> [--usage <path>] (same story flags)
//     → ONE tick, no loop — for a resumed/interrupted observe.
//
//   node <skill dir>/scripts/cycle-runtime.mjs finalize --dir <abs> --repo <owner/name> --pr <n> (same story flags)
//     → the final reduce+write, `completeness` reported honestly (never claims a source it never saw).
import { existsSync, statSync, openSync, readSync, closeSync, readFileSync, writeFileSync, renameSync, realpathSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reduceCycleMetrics, writeMetrics, mergeObservations, publishSummary } from './cycle-metrics.mjs'
import { listComments, findByMarker, upsert } from './pr-comment.mjs'

// ── journal tailing (S7): explicit sources only, complete JSONL records, tolerant of a partial
// last line, rotation/truncation detected by a shrunk size, replay is idempotent via the offset ──
export function tailJournalFile({ path, offset = 0 }) {
  if (!existsSync(path)) return { records: [], newOffset: offset, malformed: [], rotated: false }
  const stat = statSync(path)
  let readOffset = offset
  let rotated = false
  if (stat.size < readOffset) {
    readOffset = 0
    rotated = true
  }
  if (stat.size === readOffset) return { records: [], newOffset: readOffset, malformed: [], rotated }
  const fd = openSync(path, 'r')
  const len = stat.size - readOffset
  const buf = Buffer.alloc(len)
  readSync(fd, buf, 0, len, readOffset)
  closeSync(fd)
  const text = buf.toString('utf8')
  const endsWithNewline = text.endsWith('\n')
  const rawLines = text.split('\n')
  const completeLines = (endsWithNewline ? rawLines.slice(0, -1) : rawLines.slice(0, -1)).filter(l => l.length)
  const incompleteTail = endsWithNewline ? '' : rawLines[rawLines.length - 1]
  const incompleteBytes = Buffer.byteLength(incompleteTail, 'utf8')
  const records = []
  const malformed = []
  for (const line of completeLines) {
    try {
      records.push(JSON.parse(line))
    } catch {
      malformed.push(line)
    }
  }
  return { records, newOffset: readOffset + (len - incompleteBytes), malformed, rotated }
}

// ── observation mapping (S7) ─────────────────────────────────────────────────────────────────
// Archived journals expose {key, agentId, started, result} — never timestamps or token counts
// (that reality is stated in S7). `observedAt` is THIS observer's own clock — labeled as an
// observer arrival time, never mistaken for the provider's real execution time.
export function journalRecordToObservation(record, { runId, storyId, observedAt }) {
  if (!record || typeof record !== 'object' || !record.key) return { error: 'record-missing-key' }
  const executionId = record.executionId || `${runId}:${record.key}:${record.agentId ?? ''}`
  const base = { eventId: `${executionId}:${record.result === undefined || record.result === null ? 'started' : 'result'}`, executionId, runId, storyId, phase: record.phase ?? record.key, attempt: Number.isInteger(record.attempt) ? record.attempt : 1, sourceRef: 'journal', observedAt }
  if (record.result === undefined || record.result === null) return { ...base, kind: 'step-started' }
  if (record.terminal === true) return { ...base, kind: 'run-terminal' }
  const cancelled = record.result?.cancelled === true
  const failed = record.result === false || record.result?.status === 'error' || record.result?.failed === true
  return { ...base, kind: cancelled ? 'step-cancelled' : failed ? 'step-failed' : 'step-finished' }
}

export function usageRecordToObservation(record, { runId, storyId, observedAt }) {
  if (!record || typeof record !== 'object' || (!record.key && !record.executionId)) return { error: 'record-missing-key' }
  const executionId = record.executionId || `${runId}:${record.key}:${record.agentId ?? ''}`
  return { eventId: `${executionId}:usage`, executionId, runId, storyId, phase: record.phase ?? record.key ?? 'unknown', attempt: Number.isInteger(record.attempt) ? record.attempt : 1, kind: 'usage-observed', sourceRef: 'usage', observedAt, usage: record.usage ?? record }
}

// ── checkpoint: offsets + accumulated observations, atomic ──────────────────────────────────
const CHECKPOINT_NAME = '.runtime-checkpoint.json'
export function readCheckpoint(dir) {
  const p = join(dir, CHECKPOINT_NAME)
  if (!existsSync(p)) return { journalOffset: 0, usageOffset: 0, observations: [], revision: 0, terminalObservedAt: null }
  try {
    return { journalOffset: 0, usageOffset: 0, observations: [], revision: 0, terminalObservedAt: null, ...JSON.parse(readFileSync(p, 'utf8')) }
  } catch {
    return { journalOffset: 0, usageOffset: 0, observations: [], revision: 0, terminalObservedAt: null }
  }
}
export function writeCheckpoint(dir, checkpoint) {
  const p = join(dir, CHECKPOINT_NAME)
  const tmp = join(dir, `.tmp-checkpoint-${process.pid}-${Date.now()}.json`)
  writeFileSync(tmp, JSON.stringify(checkpoint))
  renameSync(tmp, p)
}

// ── stop condition (S7): terminal + reconciled, or the grace period, or an explicit cancel ──
export function shouldStop({ terminalObservedAt, usageReconciled, cancelled, graceMs = 30000, now }) {
  if (cancelled) return { stop: true, reason: 'cancelled' }
  if (!terminalObservedAt) return { stop: false }
  if (usageReconciled) return { stop: true, reason: 'terminal-reconciled' }
  if (now - terminalObservedAt >= graceMs) return { stop: true, reason: 'terminal-partial-usage' }
  return { stop: false }
}

// ── one tick: validate source -> merge idempotently -> reduce -> persist ────────────────────
export function runtimeTick({ dir, journalPath, usagePath, runId, storyId, repository, story, branch, pr, checkpoint, now }) {
  const errors = []
  const j = journalPath ? tailJournalFile({ path: journalPath, offset: checkpoint.journalOffset ?? 0 }) : { records: [], newOffset: checkpoint.journalOffset ?? 0, malformed: [], rotated: false }
  for (const line of j.malformed) errors.push({ error: 'malformed-journal-record', source: journalPath, line })
  const journalObs = j.records.map(r => journalRecordToObservation(r, { runId, storyId, observedAt: now })).filter(o => {
    if (o.error) errors.push({ error: o.error, source: journalPath })
    return !o.error
  })
  let usageObs = []
  let newUsageOffset = checkpoint.usageOffset ?? 0
  if (usagePath) {
    const u = tailJournalFile({ path: usagePath, offset: checkpoint.usageOffset ?? 0 })
    for (const line of u.malformed) errors.push({ error: 'malformed-usage-record', source: usagePath, line })
    usageObs = u.records.map(r => usageRecordToObservation(r, { runId, storyId, observedAt: now })).filter(o => {
      if (o.error) errors.push({ error: o.error, source: usagePath })
      return !o.error
    })
    newUsageOffset = u.newOffset
  }
  const priorObservations = checkpoint.observations ?? []
  const { observations: combined } = mergeObservations([...priorObservations, ...journalObs, ...usageObs])
  const view = reduceCycleMetrics({ dir, repository, story, branch, pr, runId, observations: combined, revision: (checkpoint.revision ?? 0) + 1, asOf: new Date(now).toISOString() })
  const writeResult = writeMetrics({ dir, view })
  const terminalObs = journalObs.find(o => o.kind === 'run-terminal')
  const newCheckpoint = { journalOffset: j.newOffset, usageOffset: newUsageOffset, observations: combined, revision: writeResult.written ? view.snapshot.revision : checkpoint.revision, terminalObservedAt: terminalObs ? now : (checkpoint.terminalObservedAt ?? null) }
  return { view, writeResult, checkpoint: newCheckpoint, errors, terminalObserved: !!terminalObs, journalRotated: j.rotated }
}

// ── entry (S1, S7): a cache hint the phase re-validates, never approval ─────────────────────
export function buildEntryCapsule({ dir, repo, story, pr, workflowVersion }) {
  const jsonFiles = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('.')) : []
  const telemetry = { fsAvailable: true, sourcesDeclared: 0, capability: existsSync(dir) ? 'known-state' : 'fresh' }
  if (!existsSync(dir) || !jsonFiles.length) return { capsule: null, telemetry }
  return { capsule: { workflowVersion, schemaVersion: null, run: null, story: String(story), pr: pr ? Number(pr) : undefined, note: 'unresolved — the dispatched phase runs cycle-state.mjs resolve for the authoritative next step; this capsule is informational only' }, telemetry }
}

// ── finalize (S8): last reduce+write, then the PR summary — deterministic, zero model tokens ──
// Readiness is claimed only AFTER the candidate summary is read back (S8): a ready view whose
// publish fails or cannot be confirmed is reported as `failed-publication` (reason
// `publication-pending`), never a fabricated `ready-for-merge` with no durable evidence.
export function finalizeMetrics({ dir, repository, story, branch, pr, runId, publish }) {
  const checkpoint = readCheckpoint(dir)
  const view = reduceCycleMetrics({ dir, repository, story, branch, pr, runId, observations: checkpoint.observations ?? [], revision: (checkpoint.revision ?? 0) + 1, asOf: new Date().toISOString() })
  view.snapshot.completeness = checkpoint.observations?.length ? 'complete' : 'partial'
  if (Number.isInteger(pr) && publish) {
    const marker = `<!-- pair:synthesis #${story} PR#${pr} -->`
    const outcome = publishSummary({ view, marker, pr, repo: repository, ...publish })
    view.publication = outcome.publication
    if (!outcome.published && view.outcome.delivery === 'ready-for-merge') {
      view.outcome.delivery = 'failed-publication'
      view.outcome.reason = 'publication-pending'
    }
  } else {
    view.publication = { ...view.publication, state: Number.isInteger(pr) ? view.publication.state : 'not-applicable' }
  }
  const writeResult = writeMetrics({ dir, view })
  return { view, writeResult }
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
function parseCli(argv) {
  const [cmd, ...rest] = argv
  const opts = {}
  for (let i = 0; i < rest.length; i += 2) {
    const k = rest[i]
    if (!k?.startsWith('--') || rest[i + 1] === undefined) throw new Error(`bad argument: ${k}`)
    opts[k.slice(2)] = rest[i + 1]
  }
  return { cmd, opts }
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function runObserveLoop({ dir, journalPath, usagePath, runId, storyId, repository, story, branch, pr, intervalMs = 5000, graceMs = 30000, maxTicks = Infinity, sleepFn = sleep, nowFn = () => Date.now(), onTick = () => {}, signal }) {
  let checkpoint = readCheckpoint(dir)
  let ticks = 0
  let cancelled = false
  const onSignal = () => {
    cancelled = true
  }
  if (signal) signal.addEventListener?.('abort', onSignal)
  try {
    for (;;) {
      const now = nowFn()
      const result = runtimeTick({ dir, journalPath, usagePath, runId, storyId, repository, story, branch, pr, checkpoint, now })
      checkpoint = result.checkpoint
      ticks++
      onTick(result)
      const usageReconciled = !usagePath || (checkpoint.observations ?? []).some(o => o.kind === 'usage-observed')
      const stop = shouldStop({ terminalObservedAt: checkpoint.terminalObservedAt, usageReconciled, cancelled, graceMs, now })
      writeCheckpoint(dir, checkpoint)
      if (stop.stop || ticks >= maxTicks) return { stopReason: stop.stop ? stop.reason : 'max-ticks', ticks, checkpoint }
      await sleepFn(intervalMs)
    }
  } finally {
    if (signal) signal.removeEventListener?.('abort', onSignal)
  }
}

async function main(argv) {
  const { cmd, opts } = parseCli(argv)
  const need = (...ks) => {
    for (const k of ks) if (opts[k] === undefined) throw new Error(`--${k} is required`)
  }
  if (cmd === 'entry') {
    need('dir', 'repo', 'story')
    return { out: buildEntryCapsule({ dir: opts.dir, repo: opts.repo, story: opts.story, pr: opts.pr, workflowVersion: opts.workflowVersion }), code: 0 }
  }
  if (cmd === 'reconcile') {
    need('dir', 'repository', 'story', 'branch')
    const checkpoint = readCheckpoint(opts.dir)
    const now = Date.now()
    const result = runtimeTick({ dir: opts.dir, journalPath: opts.journal, usagePath: opts.usage, runId: opts.runId, storyId: opts.story, repository: opts.repository, story: opts.story, branch: opts.branch, pr: opts.pr ? Number(opts.pr) : undefined, checkpoint, now })
    writeCheckpoint(opts.dir, result.checkpoint)
    return { out: { written: result.writeResult.written, errors: result.errors, terminalObserved: result.terminalObserved }, code: 0 }
  }
  if (cmd === 'observe') {
    need('dir', 'repository', 'story', 'branch')
    const res = await runObserveLoop({ dir: opts.dir, journalPath: opts.journal, usagePath: opts.usage, runId: opts.runId, storyId: opts.story, repository: opts.repository, story: opts.story, branch: opts.branch, pr: opts.pr ? Number(opts.pr) : undefined, intervalMs: opts['interval-ms'] ? Number(opts['interval-ms']) : 5000, graceMs: opts['grace-ms'] ? Number(opts['grace-ms']) : 30000, maxTicks: opts['max-ticks'] ? Number(opts['max-ticks']) : Infinity, onTick: r => process.stdout.write(`tick: revision=${r.view.snapshot.revision} terminal=${r.terminalObserved}\n`) })
    return { out: res, code: 0 }
  }
  if (cmd === 'finalize') {
    need('dir', 'repo', 'pr')
    const out = finalizeMetrics({ dir: opts.dir, repository: opts.repo, story: opts.story, branch: opts.branch, pr: Number(opts.pr), runId: opts.runId, publish: { listComments, findByMarker, upsert } })
    return { out: { completeness: out.view.snapshot.completeness, written: out.writeResult.written, publication: out.view.publication }, code: out.writeResult.written ? 0 : 1 }
  }
  throw new Error(`unknown command: ${cmd} (expected entry | observe | reconcile | finalize)`)
}

const isMain = () => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}
if (isMain()) {
  main(process.argv.slice(2))
    .then(({ out, code }) => {
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(code)
    })
    .catch(e => {
      process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
      process.exit(2)
    })
  process.on('SIGINT', () => process.exit(130))
  process.on('SIGTERM', () => process.exit(143))
}
