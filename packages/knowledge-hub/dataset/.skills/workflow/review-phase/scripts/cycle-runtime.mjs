#!/usr/bin/env node
// Narrow HOST runtime (US-479 T-25, S7): entry preparation, journal/usage observation and
// reconciliation, metric publication. Runs OUTSIDE the Workflow sandbox (which has no Date/fs/exec
// or usage API) — on the host, via the coordinator's existing shell executor. Imports STATE/COMMENT/
// METRICS; introduces no new agent. One scoped deterministic local process, not a global watcher.
//
//   node <skill dir>/scripts/cycle-runtime.mjs entry --dir <abs> --repo <owner/name> --story <id> --workflowVersion <v> [--pr <n>] [--policy <json>]
//     → { capsule, telemetry }  — capsule per S1 (schema/workflow identity, canonical run
//       reference, PR/story/branch, expectedHead, scopeBaselineHash, last handoff identity, typed
//       next step) — a cache hint, never approval. `telemetry` names what this host can observe.
//
//   node <skill dir>/scripts/cycle-runtime.mjs dispatch-stats --result <workflow result.json> --story <id>
//     → the four host admin counters {redirects, engineRecoveries, administrativeDispatches,
//       nestedDispatches} read out of the engine's OWN returned result — the launch recipe pipes
//       this straight into `--dispatchStats`. What the result does not carry stays null.
//
//   node <skill dir>/scripts/cycle-runtime.mjs usage-extract --transcripts <dir> --journal <path>
//        --out <usage.jsonl> --runId <id> [--story <id>]
//     → joins the host's per-agent transcripts to the journal on `agentId` and writes ONE
//       cumulative usage record per execution. Deterministic file reading only: no provider API,
//       no LLM, and no message CONTENT is read — usage, timing, model, effort and role metadata
//       only. `observe`/`reconcile`/`finalize` run it themselves when given `--transcripts`.
//
//   node <skill dir>/scripts/cycle-runtime.mjs observe --dir <abs> --journal <path> [--usage <path>]
//        [--transcripts <dir>]
//        --repository <owner/name> --story <id> --branch <b> [--pr <n>] [--runId <id>]
//        [--interval-ms 5000] [--grace-ms 30000] [--max-ticks <n>]
//        [--dispatchStats <json>] [--sharedCost <json>]
//     → tails ONLY the named sources on the interval, merges idempotently, reduces metrics,
//       writes metrics.json/metrics.md atomically, prints one concise progress line per tick.
//       Stops after a durable terminal result AND reconciliation of declared sources (or the grace
//       period elapses — finalize partial, allow a later `reconcile`), or on SIGINT/SIGTERM.
//       `--dispatchStats` (US-479 remediation, Finding 4 residual) is the host's OWN launch-recipe
//       counters ({redirects, engineRecoveries, administrativeDispatches, nestedDispatches}, any
//       integer subset) — this is data no journal/usage line encodes, so it can only ever come from
//       the host that actually dispatched; `--sharedCost` ({tokens, admittedIds}) is the shared-
//       batch allocation input. Both persist in the checkpoint: a later tick/finalize that omits
//       them keeps the last host-supplied values, never silently reverting to a fabricated zero.
//
//   node <skill dir>/scripts/cycle-runtime.mjs reconcile --dir <abs> --journal <path> [--usage <path>]
//        (same story flags, same --dispatchStats/--sharedCost)
//     → ONE tick, no loop — for a resumed/interrupted observe.
//
//   node <skill dir>/scripts/cycle-runtime.mjs finalize --dir <abs> --repo <owner/name> --pr <n>
//        (same story flags, same --dispatchStats/--sharedCost)
//     → the final reduce+write, `completeness` reported honestly (never claims a source it never saw).
import { existsSync, statSync, openSync, readSync, closeSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, renameSync, realpathSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reduceCycleMetrics, writeMetrics, mergeObservations, publishSummary } from './cycle-metrics.mjs'
import { listComments, findByMarker, upsert } from './pr-comment.mjs'
import { resolve as resolveCycleState, readHandoffs, SCHEMA_VERSION } from './cycle-state.mjs'

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
  const base = { eventId: `${executionId}:${record.result === undefined || record.result === null ? 'started' : 'result'}`, executionId, parentExecutionId: record.parentExecutionId, role: record.role, runId, storyId, phase: record.phase ?? record.key, attempt: Number.isInteger(record.attempt) ? record.attempt : 1, sourceRef: 'journal', observedAt }
  if (record.result === undefined || record.result === null) return { ...base, kind: 'step-started' }
  if (record.terminal === true) return { ...base, kind: 'run-terminal' }
  const cancelled = record.result?.cancelled === true
  const failed = record.result === false || record.result?.status === 'error' || record.result?.failed === true
  return { ...base, kind: cancelled ? 'step-cancelled' : failed ? 'step-failed' : 'step-finished' }
}

// US-479 remediation (Finding 3): a delta usage sample needs its OWN unique eventId (S7) to be
// deduped correctly on replay — a fixed `${executionId}:usage` id for every sample would make the
// reducer treat every later, genuinely NEW delta as a replay of the first and silently drop it.
// The raw record's own id is preserved when supplied; a cumulative (non-delta) sample is safe to
// fall back to the fixed id since `mergeObservations` replaces those unconditionally, never sums.
export function usageRecordToObservation(record, { runId, storyId, observedAt }) {
  if (!record || typeof record !== 'object' || (!record.key && !record.executionId)) return { error: 'record-missing-key' }
  const executionId = record.executionId || `${runId}:${record.key}:${record.agentId ?? ''}`
  const eventId = record.eventId || `${executionId}:usage`
  return { eventId, executionId, parentExecutionId: record.parentExecutionId, role: record.role, runId, storyId, phase: record.phase ?? record.key ?? 'unknown', attempt: Number.isInteger(record.attempt) ? record.attempt : 1, kind: 'usage-observed', sourceRef: 'usage', observedAt, models: record.models, efforts: record.efforts, attribution: record.attribution, messageSpan: record.messageSpan, usage: record.usage ?? record }
}

// ── usage adapter (US-479 B4, S7, AC-20/25): host transcripts -> usage records ──────────────
// The workflow journal records WHICH executions ran (`key` + `agentId`) and nothing about their
// cost: no tokens, no timestamps. The cost lives in the harness's per-agent transcripts, in a
// different shape. This is the missing PRODUCER for `--usage`: a deterministic file reader that
// joins the two on `agentId` — no network, no provider API, no LLM, and it never reads message
// CONTENT, only the usage/timing/model metadata each `assistant` record carries.
//
// The provider's own accounting, measured not assumed: inside ONE `requestId` the input and cache
// fields are REPEATED identically on every `apiBlockIndex` while `output_tokens` GROWS, and the
// last block carries a non-null `stop_reason`. So a request contributes its fixed fields once and
// its final block's output — summing every message inflates output and cache reads, keeping only
// the first block loses the output. Blocks that DISAGREE on the fixed fields are not a shape this
// reduction understands: that request contributes nothing and is reported, never averaged.
const ASSISTANT_USAGE_FIELDS = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']
function readTranscript(path) {
  const requests = new Map()
  const models = new Set()
  const efforts = new Set()
  const errors = []
  let firstMessageAt = null
  let lastMessageAt = null
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let rec
    try {
      rec = JSON.parse(line)
    } catch {
      errors.push({ error: 'malformed-transcript-record', source: path })
      continue
    }
    if (rec.type !== 'assistant' || !rec.requestId || !rec.message || typeof rec.message !== 'object') continue
    const u = rec.message.usage
    if (!u || typeof u !== 'object') {
      errors.push({ error: 'assistant-record-without-usage', source: path, requestId: rec.requestId })
      continue
    }
    const at = Date.parse(rec.timestamp ?? '')
    if (Number.isInteger(at)) {
      if (firstMessageAt === null || at < firstMessageAt) firstMessageAt = at
      if (lastMessageAt === null || at > lastMessageAt) lastMessageAt = at
    }
    if (rec.message.model) models.add(String(rec.message.model))
    if (rec.effort) efforts.add(String(rec.effort))
    const block = Number.isInteger(rec.apiBlockIndex) ? rec.apiBlockIndex : 0
    const fixed = ASSISTANT_USAGE_FIELDS.map(k => Number(u[k] ?? 0))
    const cur = requests.get(rec.requestId)
    if (!cur) {
      requests.set(rec.requestId, { fixed, block, output: Number(u.output_tokens ?? 0), complete: u && rec.message.stop_reason != null, inconsistent: false })
      continue
    }
    if (cur.fixed.some((v, i) => v !== fixed[i])) {
      if (!cur.inconsistent) errors.push({ error: 'usage-request-inconsistent', source: path, requestId: rec.requestId })
      cur.inconsistent = true
    }
    if (block >= cur.block) {
      cur.block = block
      cur.output = Number(u.output_tokens ?? 0)
    }
    if (rec.message.stop_reason != null) cur.complete = true
  }
  const usage = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, requests: 0, partialRequests: 0, inconsistentRequests: 0 }
  for (const r of requests.values()) {
    usage.requests++
    if (r.inconsistent) {
      usage.inconsistentRequests++
      continue
    }
    // An observed cost is never discarded: an INCOMPLETE request still contributes what the
    // provider already charged — it simply does not become complete by having usage.
    if (!r.complete) usage.partialRequests++
    usage.inputTokens += r.fixed[0]
    usage.cacheWriteTokens += r.fixed[1]
    usage.cacheReadTokens += r.fixed[2]
    usage.outputTokens += r.output
  }
  return { usage, models: [...models].sort(), efforts: [...efforts].sort(), firstMessageAt, lastMessageAt, errors }
}

export function extractUsage({ transcriptsDir, journalPath, out, runId, storyId }) {
  const errors = []
  // the journal's OWN identity for each execution — the join key, and the only terminal proof
  const byAgent = new Map()
  if (journalPath && existsSync(journalPath))
    for (const line of readFileSync(journalPath, 'utf8').split('\n')) {
      if (!line.trim()) continue
      let rec
      try {
        rec = JSON.parse(line)
      } catch {
        continue // a partial last line is the tailer's business, not the adapter's
      }
      if (!rec.key || !rec.agentId) continue
      const prior = byAgent.get(rec.agentId) ?? { key: rec.key, terminal: false }
      byAgent.set(rec.agentId, { key: prior.key, terminal: prior.terminal || rec.result !== undefined })
    }
  const files = existsSync(transcriptsDir) ? readdirSync(transcriptsDir).filter(f => /^agent-.+\.jsonl$/.test(f)).sort() : []
  const records = []
  const unattributed = []
  const seenAgents = new Set()
  for (const f of files) {
    const agentId = f.slice('agent-'.length, -'.jsonl'.length)
    seenAgents.add(agentId)
    const t = readTranscript(join(transcriptsDir, f))
    errors.push(...t.errors)
    const metaPath = join(transcriptsDir, `agent-${agentId}.meta.json`)
    let meta = {}
    if (existsSync(metaPath))
      try {
        meta = JSON.parse(readFileSync(metaPath, 'utf8'))
      } catch {
        errors.push({ error: 'malformed-transcript-meta', source: metaPath })
      }
    const known = byAgent.get(agentId)
    if (!known) unattributed.push(agentId)
    // The identity is the JOURNAL's, so the usage lands on the execution the journal already
    // reported. A transcript the journal does not know is a real cost with no dispatch identity:
    // it keeps its own id under an explicit `unattributed` phase — never folded into a sibling,
    // and never given an invented parent.
    const executionId = known ? `${runId}:${known.key}:${agentId}` : `${runId}:transcript:${agentId}`
    records.push({
      eventId: `${executionId}:usage`,
      executionId,
      agentId,
      key: known?.key,
      phase: known ? known.key : 'unattributed',
      attribution: known ? 'journal' : 'transcript-only',
      role: meta.agentType ?? 'unknown',
      spawnDepth: Number.isInteger(meta.spawnDepth) ? meta.spawnDepth : undefined,
      models: t.models,
      efforts: t.efforts,
      // Three different clocks, never conflated (S7): these are the PROVIDER timestamps of the
      // messages this execution produced — an observed message SPAN, not the agent's lifetime, and
      // `terminalObserved` says whether the host ever saw this execution actually finish.
      messageSpan: { firstMessageAt: t.firstMessageAt === null ? null : new Date(t.firstMessageAt).toISOString(), lastMessageAt: t.lastMessageAt === null ? null : new Date(t.lastMessageAt).toISOString(), source: 'transcript', terminalObserved: !!known?.terminal },
      complete: t.usage.inconsistentRequests === 0 && t.usage.partialRequests === 0,
      usage: { ...t.usage, accountingBasis: 'leaf-exclusive' },
    })
  }
  const withoutTranscript = [...byAgent.entries()].filter(([agentId]) => !seenAgents.has(agentId)).map(([agentId, v]) => `${runId}:${v.key}:${agentId}`).sort()
  if (out && records.length) {
    mkdirSync(dirname(out), { recursive: true })
    // Cumulative per execution: a later record REPLACES the earlier one in `mergeObservations`
    // (it carries no `isDelta`), so a full re-read after a rotation or a restart rebuilds the same
    // totals instead of summing them again.
    appendFileSync(out, records.map(r => JSON.stringify(r)).join('\n') + '\n')
  }
  return { executions: records.filter(r => r.attribution === 'journal').length, records, unattributed, withoutTranscript, errors }
}

// ── host admin counters (US-479 B4, S4/S7) ─────────────────────────────────────────────────
// The four execution counters no journal or transcript encodes: they exist only in the engine
// result the host already holds when the run returns. Derived here, from that file, so the recipe
// hands the observer REAL values instead of a JSON somebody would have to write by hand. What the
// result genuinely does not carry stays `null` — never a fabricated 0 (S7).
export function dispatchStatsFromResult({ result, story }) {
  if (!result || typeof result !== 'object') return { redirects: null, engineRecoveries: null, administrativeDispatches: null, nestedDispatches: null }
  const row = (result.batch ?? []).find(r => String(r?.id ?? r?.story?.id ?? '') === String(story))
  const m = row?.metrics ?? result.metrics ?? {}
  const asInt = v => (Number.isInteger(v) ? v : null)
  const perDispatch = Array.isArray(result.metrics?.perDispatch) ? result.metrics.perDispatch : []
  return {
    redirects: asInt(m.redirects),
    // an agent that died and was re-dispatched with the same prompt is the engine recovering
    engineRecoveries: asInt(m.retries),
    // the batch-wide contract generator: the only dispatch that judges nothing
    administrativeDispatches: perDispatch.length ? perDispatch.filter(d => /^contract:/.test(String(d?.label ?? ''))).length : null,
    // the engine result does not report sub-agent nesting: unknown, and said so
    nestedDispatches: null,
  }
}

// ── checkpoint: offsets + accumulated observations, atomic ──────────────────────────────────
const CHECKPOINT_NAME = '.runtime-checkpoint.json'
// US-479 remediation (Finding 3, residual): `appliedDeltaEventIds` is the dedup ledger
// `mergeObservations` needs seeded back in on every tick — without it, a delta replayed after a
// restart looks unseen again and is summed a second time. US-479 remediation (Finding 4, residual):
// `dispatchStats`/`sharedCost` are the host's own admin counters/allocation input — carried here so
// a tick that doesn't re-supply them (or a `finalize` running after the observer stopped) still
// reports the last host-supplied values, never silently reverting to null.
const CHECKPOINT_DEFAULTS = { journalOffset: 0, usageOffset: 0, observations: [], revision: 0, terminalObservedAt: null, appliedDeltaEventIds: {}, dispatchStats: null, sharedCost: null }
export function readCheckpoint(dir) {
  const p = join(dir, CHECKPOINT_NAME)
  if (!existsSync(p)) return { ...CHECKPOINT_DEFAULTS }
  try {
    return { ...CHECKPOINT_DEFAULTS, ...JSON.parse(readFileSync(p, 'utf8')) }
  } catch {
    return { ...CHECKPOINT_DEFAULTS }
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
export function runtimeTick({ dir, journalPath, usagePath, transcriptsDir, runId, storyId, repository, story, branch, pr, checkpoint, now, dispatchStats, sharedCost }) {
  const errors = []
  // US-479 B4: the host journal carries no cost at all, so when the transcripts are named the tick
  // PRODUCES the usage source before tailing it — the same deterministic reader, re-run each tick,
  // appending one cumulative record per execution (replace-on-merge, never summed twice).
  if (transcriptsDir && usagePath) {
    const ex = extractUsage({ transcriptsDir, journalPath, out: usagePath, runId, storyId })
    errors.push(...ex.errors)
    for (const id of ex.withoutTranscript) errors.push({ error: 'execution-without-transcript', executionId: id })
    for (const agentId of ex.unattributed) errors.push({ error: 'transcript-without-dispatch-identity', agentId })
  }
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
  // US-479 remediation (Finding 3, residual): the dedup ledger from the LAST tick is seeded back in
  // — the only way a delta event replayed after a restart is still recognized as already-applied.
  const { observations: combined, appliedDeltaEventIds } = mergeObservations([...priorObservations, ...journalObs, ...usageObs], checkpoint.appliedDeltaEventIds ?? {})
  // US-479 remediation (Finding 4, residual): a tick that doesn't re-supply the host's admin
  // counters/allocation input keeps the last ones this run actually received — never silently
  // reverting real, previously-known values back to null.
  const effectiveDispatchStats = dispatchStats ?? checkpoint.dispatchStats ?? undefined
  const effectiveSharedCost = sharedCost ?? checkpoint.sharedCost ?? undefined
  const view = reduceCycleMetrics({ dir, repository, story, branch, pr, runId, observations: combined, revision: (checkpoint.revision ?? 0) + 1, asOf: new Date(now).toISOString(), dispatchStats: effectiveDispatchStats, sharedCost: effectiveSharedCost })
  const writeResult = writeMetrics({ dir, view })
  const terminalObs = journalObs.find(o => o.kind === 'run-terminal')
  const newCheckpoint = {
    journalOffset: j.newOffset,
    usageOffset: newUsageOffset,
    observations: combined,
    appliedDeltaEventIds,
    revision: writeResult.written ? view.snapshot.revision : checkpoint.revision,
    terminalObservedAt: terminalObs ? now : (checkpoint.terminalObservedAt ?? null),
    dispatchStats: effectiveDispatchStats ?? null,
    sharedCost: effectiveSharedCost ?? null,
  }
  return { view, writeResult, checkpoint: newCheckpoint, errors, terminalObserved: !!terminalObs, journalRotated: j.rotated }
}

// ── entry (S1, S7): a cache hint the phase re-validates, never approval ─────────────────────
// US-479 remediation (Finding 5): the capsule must be in the EXACT shape WF's strict parser
// accepts (workflowVersion, schemaVersion, run, story, pr?, branch?, expectedHead?,
// scopeBaselineHash?, lastHandoff?, next) — no `note`, no null `schemaVersion`/`run`, no missing
// `next`. It is built from a REAL `cycle-state.mjs resolve()` call (real authority AT CAPTURE
// TIME) rather than a hand-rolled placeholder; when nothing is yet resolvable, or the state is
// stale/incompatible, this returns `capsule: null` — never a malformed stand-in. Compatibility
// with Finding 1: a well-shaped capsule here is STILL never trusted as approval by WF — only
// grounded enough to be worth forwarding as a cache hint.
export function buildEntryCapsule({ dir, repo, story, pr, workflowVersion, policy = {} }) {
  const exists = existsSync(dir)
  const telemetry = { fsAvailable: true, capability: exists ? 'known-state' : 'fresh' }
  if (!exists) return { capsule: null, telemetry }
  const runId = basename(dirname(dir))
  const result = resolveCycleState({ dir, workflowVersion, policy, entry: pr ? 'pr' : 'fresh', pr: pr !== undefined ? Number(pr) : undefined, runsRoot: dirname(dirname(dir)), story })
  if (result.status === 'invalid' || result.status === 'incompatible' || result.status === 'other-run' || !result.next) return { capsule: null, telemetry: { ...telemetry, capability: 'stale', reason: result.reason ?? result.status } }
  const handoffs = readHandoffs(dir)
  const last = handoffs[handoffs.length - 1]
  const expectedHead = last?.data?.reviewedHead ?? last?.data?.outputHead ?? undefined
  const capsule = {
    workflowVersion,
    schemaVersion: SCHEMA_VERSION,
    run: runId,
    story: String(story),
    ...(Number.isInteger(result.pr) ? { pr: result.pr } : pr !== undefined ? { pr: Number(pr) } : {}),
    ...(expectedHead ? { expectedHead } : {}),
    ...(last ? { lastHandoff: last.name } : {}),
    next: result.next,
  }
  return { capsule, telemetry: { ...telemetry, capability: 'known-state' } }
}

// ── finalize (S8): last reduce+write, then the PR summary — deterministic, zero model tokens ──
// Readiness is claimed only AFTER the candidate summary is read back (S8): a ready view whose
// publish fails or cannot be confirmed is reported as `failed-publication` (reason
// `publication-pending`), never a fabricated `ready-for-merge` with no durable evidence.
export function finalizeMetrics({ dir, repository, story, branch, pr, runId, publish, dispatchStats, sharedCost, journalPath, usagePath, transcriptsDir }) {
  // US-479 B4: the last agent's usage often lands AFTER the observer stopped. When finalize is
  // given the sources it reconciles them itself, in ONE tick — the same reader, no new judgment,
  // no LLM: a tail that arrives late completes the same snapshot instead of being lost.
  if (journalPath || usagePath || transcriptsDir) {
    const pre = runtimeTick({ dir, journalPath, usagePath, transcriptsDir, runId, storyId: story, repository, story, branch, pr, checkpoint: readCheckpoint(dir), now: Date.now(), dispatchStats, sharedCost })
    writeCheckpoint(dir, pre.checkpoint)
  }
  const checkpoint = readCheckpoint(dir)
  // US-479 remediation (Finding 4): completeness is the reducer's OWN honest derivation (every
  // observed execution has matching usage, timing coverage is full) — "an observation exists" was
  // never proof every declared source was actually reconciled, and this no longer overrides it.
  // US-479 remediation (Finding 4, residual): the host's admin counters/allocation, carried through
  // the checkpoint when this finalize call doesn't itself supply them — the observer may already
  // have stopped by the time finalize runs, and its last-known values must still reach the summary.
  const view = reduceCycleMetrics({ dir, repository, story, branch, pr, runId, observations: checkpoint.observations ?? [], revision: (checkpoint.revision ?? 0) + 1, asOf: new Date().toISOString(), dispatchStats: dispatchStats ?? checkpoint.dispatchStats ?? undefined, sharedCost: sharedCost ?? checkpoint.sharedCost ?? undefined })
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

export async function runObserveLoop({ dir, journalPath, usagePath, transcriptsDir, runId, storyId, repository, story, branch, pr, intervalMs = 5000, graceMs = 30000, maxTicks = Infinity, sleepFn = sleep, nowFn = () => Date.now(), onTick = () => {}, signal, dispatchStats, sharedCost }) {
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
      const result = runtimeTick({ dir, journalPath, usagePath, transcriptsDir, runId, storyId, repository, story, branch, pr, checkpoint, now, dispatchStats, sharedCost })
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
    need('dir', 'repo', 'story', 'workflowVersion')
    return { out: buildEntryCapsule({ dir: opts.dir, repo: opts.repo, story: opts.story, pr: opts.pr, workflowVersion: opts.workflowVersion, policy: opts.policy ? JSON.parse(opts.policy) : {} }), code: 0 }
  }
  if (cmd === 'reconcile') {
    need('dir', 'repository', 'story', 'branch')
    const checkpoint = readCheckpoint(opts.dir)
    const now = Date.now()
    const result = runtimeTick({ dir: opts.dir, journalPath: opts.journal, usagePath: opts.usage, transcriptsDir: opts.transcripts, runId: opts.runId, storyId: opts.story, repository: opts.repository, story: opts.story, branch: opts.branch, pr: opts.pr ? Number(opts.pr) : undefined, checkpoint, now, dispatchStats: opts.dispatchStats ? JSON.parse(opts.dispatchStats) : undefined, sharedCost: opts.sharedCost ? JSON.parse(opts.sharedCost) : undefined })
    writeCheckpoint(opts.dir, result.checkpoint)
    return { out: { written: result.writeResult.written, errors: result.errors, terminalObserved: result.terminalObserved }, code: 0 }
  }
  if (cmd === 'observe') {
    need('dir', 'repository', 'story', 'branch')
    const res = await runObserveLoop({ dir: opts.dir, journalPath: opts.journal, usagePath: opts.usage, transcriptsDir: opts.transcripts, runId: opts.runId, storyId: opts.story, repository: opts.repository, story: opts.story, branch: opts.branch, pr: opts.pr ? Number(opts.pr) : undefined, intervalMs: opts['interval-ms'] ? Number(opts['interval-ms']) : 5000, graceMs: opts['grace-ms'] ? Number(opts['grace-ms']) : 30000, maxTicks: opts['max-ticks'] ? Number(opts['max-ticks']) : Infinity, dispatchStats: opts.dispatchStats ? JSON.parse(opts.dispatchStats) : undefined, sharedCost: opts.sharedCost ? JSON.parse(opts.sharedCost) : undefined, onTick: r => process.stdout.write(`tick: revision=${r.view.snapshot.revision} terminal=${r.terminalObserved}\n`) })
    return { out: res, code: 0 }
  }
  if (cmd === 'finalize') {
    need('dir', 'repo', 'pr')
    const out = finalizeMetrics({ dir: opts.dir, repository: opts.repo, story: opts.story, branch: opts.branch, pr: Number(opts.pr), runId: opts.runId, journalPath: opts.journal, usagePath: opts.usage, transcriptsDir: opts.transcripts, publish: { listComments, findByMarker, upsert }, dispatchStats: opts.dispatchStats ? JSON.parse(opts.dispatchStats) : undefined, sharedCost: opts.sharedCost ? JSON.parse(opts.sharedCost) : undefined })
    // US-479 B4: a repeat finalize that finds nothing new writes nothing — that is the idempotent
    // outcome the recipe relies on, not a failure. Only a real write failure is a non-zero exit.
    const idempotent = out.writeResult.written || out.writeResult.reason === 'stale-revision'
    return { out: { completeness: out.view.snapshot.completeness, written: out.writeResult.written, reason: out.writeResult.reason, publication: out.view.publication }, code: idempotent ? 0 : 1 }
  }
  if (cmd === 'dispatch-stats') {
    need('result', 'story')
    return { out: dispatchStatsFromResult({ result: JSON.parse(readFileSync(opts.result, 'utf8')), story: opts.story }), code: 0 }
  }
  if (cmd === 'usage-extract') {
    need('transcripts', 'journal', 'out', 'runId')
    const res = extractUsage({ transcriptsDir: opts.transcripts, journalPath: opts.journal, out: opts.out, runId: opts.runId, storyId: opts.story })
    return { out: { executions: res.executions, unattributed: res.unattributed, withoutTranscript: res.withoutTranscript, errors: res.errors }, code: 0 }
  }
  throw new Error(`unknown command: ${cmd} (expected entry | observe | reconcile | finalize | usage-extract | dispatch-stats)`)
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
