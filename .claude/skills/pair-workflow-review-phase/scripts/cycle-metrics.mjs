#!/usr/bin/env node
// Deterministic metrics reducer + CLI (US-479 T-24, S6/S7/S9). A pure derived VIEW over the durable
// handoffs (cycle-state.mjs) and normalized runtime observations (cycle-runtime.mjs, T-25) — never
// a second execution database, never consulted by `deriveNext`, never mutates outcome/findings/
// counters. Ships byte-identical inside every phase skill that imports it, exactly like
// cycle-state.mjs — a plain Node script, zero new dependencies.
//
//   node <skill dir>/scripts/cycle-metrics.mjs reduce --dir <run/story dir> --repository <owner/name>
//        --story <id> --branch <b> [--pr <n>] [--runId <id>] [--observations <normalized.json>]
//        [--revision <n>] [--asOf <ISO>]
//     → the schema-1 metrics view (S6 shape), derived from the handoffs at --dir plus the optional
//       observations file (an array of normalized events, T-25's output). Never writes.
//
//   node <skill dir>/scripts/cycle-metrics.mjs write --dir <dir> [same flags as reduce]
//     → reduces AND persists metrics.json + metrics.md atomically (temp+rename) under --dir,
//       predecessor/revision-checked so a stale writer never overwrites a newer view.
//
//   node <skill dir>/scripts/cycle-metrics.mjs aggregate --inputs <manifest.json> --out <dir>
//     → S9 cohort report from an explicit manifest of {repository, story, branch, pr?, dir} entries
//       (or persisted metrics.json paths) plus a cutoff; writes cohort.json + cohort.md to --out.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readHandoffs, cycleCounters, canonical } from './cycle-state.mjs'

export const METRICS_SCHEMA_VERSION = 1
const sha256 = s => `sha256:${createHash('sha256').update(s).digest('hex')}`

// ── observations (S7): identity, idempotent merge, never content-only dedup ────────────────
const OBS_KINDS = ['step-started', 'step-finished', 'step-failed', 'step-cancelled', 'usage-observed', 'run-terminal']

export function normalizeObservation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'not-an-object' }
  if (!OBS_KINDS.includes(raw.kind)) return { error: `kind-invalid:${raw.kind}` }
  if (!raw.runId) return { error: 'runId-missing' }
  if (!raw.sourceRef) return { error: 'sourceRef-missing' }
  // Prefer a provider invocation id; else runId+journal key+agentId+kind. Never content alone —
  // two real executions can carry byte-identical replies.
  const executionId = raw.executionId || `${raw.runId}:${raw.sourceRef}:${raw.agentId ?? ''}:${raw.kind}`
  return { ...raw, executionId }
}

function sumUsage(a, b) {
  const out = {}
  for (const k of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens'])
    if (a?.[k] != null || b?.[k] != null) out[k] = (a?.[k] ?? 0) + (b?.[k] ?? 0)
  return out
}

// A re-observation of the SAME (executionId, kind) updates it; a provider cumulative usage sample
// REPLACES the prior one; a delta-marked sample (`usage.isDelta: true`, its own unique eventId) is
// SUMMED. A genuinely new execution (different executionId/agentId) is never merged into an old one.
export function mergeObservations(raw) {
  const byKey = new Map()
  const errors = []
  for (const r of raw ?? []) {
    const n = normalizeObservation(r)
    if (n.error) {
      errors.push(n)
      continue
    }
    const key = `${n.executionId} ${n.kind}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, n)
      continue
    }
    byKey.set(key, n.usage?.isDelta && existing.usage ? { ...n, usage: sumUsage(existing.usage, n.usage) } : n)
  }
  return { observations: [...byKey.values()], errors }
}

// ── shared cost allocation (S7) ──────────────────────────────────────────────────────────────
// Equal split of a KNOWN shared-batch token count across the FROZEN admitted card set, sorted
// stable ids, integer remainder to the first ids — never only to completed cards.
export function allocateSharedCost({ tokens, admittedIds }) {
  const ids = [...new Set(admittedIds ?? [])].sort()
  if (tokens == null) return { allocations: Object.fromEntries(ids.map(id => [id, null])), coverage: 'unknown' }
  const n = ids.length
  if (!n) return { allocations: {}, coverage: 'known', total: tokens }
  const base = Math.floor(tokens / n)
  const remainder = tokens - base * n
  const allocations = {}
  ids.forEach((id, i) => {
    allocations[id] = base + (i < remainder ? 1 : 0)
  })
  return { allocations, coverage: 'known', total: tokens }
}

// ── time (S7): union for wall time, sum for agent time ──────────────────────────────────────
export function reduceTime(intervals) {
  const list = intervals ?? []
  const known = list.filter(i => Number.isInteger(i.startMs) && Number.isInteger(i.endMs) && i.endMs >= i.startMs && i.startMs >= 0)
  const flaggedCount = list.length - known.length
  if (!known.length) return { elapsedMs: null, activeWallMs: null, agentMs: null, waitMs: null, incomplete: list.length > 0, flaggedCount }
  const agentMs = known.reduce((sum, i) => sum + (i.endMs - i.startMs), 0)
  const sorted = [...known].sort((a, b) => a.startMs - b.startMs)
  let activeWallMs = 0
  let curStart = sorted[0].startMs
  let curEnd = sorted[0].endMs
  for (const i of sorted.slice(1)) {
    if (i.startMs <= curEnd) curEnd = Math.max(curEnd, i.endMs)
    else {
      activeWallMs += curEnd - curStart
      curStart = i.startMs
      curEnd = i.endMs
    }
  }
  activeWallMs += curEnd - curStart
  const elapsedMs = Math.max(...known.map(i => i.endMs)) - Math.min(...known.map(i => i.startMs))
  const fullCoverage = flaggedCount === 0
  return { elapsedMs, activeWallMs, agentMs, waitMs: fullCoverage ? elapsedMs - activeWallMs : null, incomplete: flaggedCount > 0, flaggedCount }
}

// ── usage (S7): one accounting basis per execution, coverage never fabricated ───────────────
export function reduceUsage(observations) {
  const usageEvents = (observations ?? []).filter(o => o.kind === 'usage-observed' && o.usage)
  const byExec = new Map()
  for (const e of usageEvents) byExec.set(e.executionId, e.usage)
  const known = [...byExec.values()]
  const totalOf = u => (typeof u.totalTokens === 'number' ? u.totalTokens : ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'].every(k => typeof u[k] !== 'number') ? null : ['inputTokens', 'outputTokens'].reduce((s, k) => s + (u[k] ?? 0), 0))
  const totals = known.map(totalOf).filter(t => t != null)
  const observedTotalTokens = totals.length ? totals.reduce((a, b) => a + b, 0) : null
  const missingExecutionIds = [...byExec.entries()].filter(([, u]) => totalOf(u) == null).map(([id]) => id)
  return {
    observedTotalTokens,
    inputTokens: known.length ? known.reduce((s, u) => s + (u.inputTokens ?? 0), 0) : null,
    outputTokens: known.length ? known.reduce((s, u) => s + (u.outputTokens ?? 0), 0) : null,
    cacheReadTokens: known.some(u => u.cacheReadTokens != null) ? known.reduce((s, u) => s + (u.cacheReadTokens ?? 0), 0) : null,
    cacheWriteTokens: known.some(u => u.cacheWriteTokens != null) ? known.reduce((s, u) => s + (u.cacheWriteTokens ?? 0), 0) : null,
    coverage: { known: byExec.size - missingExecutionIds.length, total: byExec.size },
    missingExecutionIds,
    accountingBasis: 'leaf-exclusive',
    byRole: [],
    sharedOverhead: null,
  }
}

// ── the main reducer ─────────────────────────────────────────────────────────────────────────
export function reduceCycleMetrics({ dir, repository, story, branch, pr, runId, observations = [], revision = 1, asOf = null }) {
  const handoffs = readHandoffs(dir)
  const list = handoffs.filter(h => h.data)
  const counters = cycleCounters(handoffs)
  const versions = [...new Set(list.map(h => h.data.workflowVersion).filter(Boolean))]
  const reviews = list.filter(h => h.skill === 'review-phase')
  const lastReview = reviews[reviews.length - 1]
  const findingsById = new Map()
  for (const r of reviews) for (const f of r.data.findings ?? []) if (f?.id) findingsById.set(f.id, f)
  const openBySeverity = {}
  const closedBySeverity = {}
  const late = { preexistingMissed: 0, introducedByRemediation: 0, unknown: 0 }
  for (const f of findingsById.values()) {
    const bucket = f.transition === 'resolved' || f.transition === 'superseded' ? closedBySeverity : openBySeverity
    bucket[f.severity] = (bucket[f.severity] ?? 0) + 1
    if (f.discoveredAtReviewId && f.discoveredAtReviewId !== reviews[0]?.name) {
      if (f.origin === 'preexisting-missed') late.preexistingMissed++
      else if (f.origin === 'introduced-by-remediation') late.introducedByRemediation++
      else late.unknown++
    }
  }
  const scopeById = new Map()
  for (const r of reviews) for (const c of r.data.scopeChanges ?? []) if (c?.id) scopeById.set(c.id, c)
  const scopeEntries = [...scopeById.values()]
  const scopeCounts = { pending: 0, ignored: 0, extended: 0, deferred: 0 }
  for (const c of scopeEntries) scopeCounts[c.status ?? 'pending'] = (scopeCounts[c.status ?? 'pending'] ?? 0) + 1
  const last = list[list.length - 1]
  const blocking = (lastReview?.data.findings ?? []).filter(f => f?.blocking === true && f.transition !== 'resolved')
  const quality = !lastReview ? 'not-evaluated' : blocking.length === 0 ? 'converged' : 'not-converged'
  // Pending scope always wins over a bare readiness.ready — deriveNext never reaches `done` while
  // a proposal is undecided (US-479 T-22, S5), so the metrics view must not claim ready-for-merge either.
  const delivery = !last ? 'empty' : quality === 'converged' && scopeCounts.pending > 0 ? 'awaiting-scope-decision' : last.skill === 'review-phase' && last.data.readiness?.ready === true ? 'ready-for-merge' : last.data.recordType === 'decision' ? 'awaiting-scope-decision' : 'in-progress'
  const { observations: merged } = mergeObservations(observations)
  const timeByPhase = new Map()
  for (const o of merged) {
    if (o.kind !== 'step-started' && o.kind !== 'step-finished') continue
    const bucket = timeByPhase.get(o.phase) ?? []
    timeByPhase.set(o.phase, bucket)
  }
  const startEvents = new Map(merged.filter(o => o.kind === 'step-started').map(o => [o.executionId, o]))
  const finishEvents = merged.filter(o => o.kind === 'step-finished' || o.kind === 'step-failed' || o.kind === 'step-cancelled')
  const intervals = finishEvents
    .map(f => {
      const s = startEvents.get(f.executionId)
      return s ? { startMs: Date.parse(s.observedAt ?? s.occurredAt ?? ''), endMs: Date.parse(f.observedAt ?? f.occurredAt ?? '') } : null
    })
    .filter(Boolean)
  const time = reduceTime(intervals)
  const usage = reduceUsage(merged)
  return {
    schemaVersion: METRICS_SCHEMA_VERSION,
    identity: { repository, storyId: story, prNumber: Number.isInteger(pr) ? pr : null, branch, canonicalRunId: runId ?? null, runIds: runId ? [runId] : [], scopeEpoch: lastReview?.data.scopeEpoch ?? 1 },
    workflow: { name: 'pair-implement-batch', versions, sourceShas: [], artifactDigests: [], models: [], mixedVersions: versions.length > 1 },
    snapshot: { revision, asOf, sourceDigest: sha256(canonical(list.map(h => h.name))), completeness: 'complete', missingSources: [] },
    outcome: { quality, delivery, cohortState: delivery === 'ready-for-merge' ? 'completed' : delivery === 'in-progress' ? 'running' : 'blocked', reason: delivery === 'awaiting-scope-decision' ? 'human-scope' : null, qualityConvergedHead: quality === 'converged' ? lastReview?.data.reviewedHead ?? null : null, reviewedHead: lastReview?.data.reviewedHead ?? null },
    cycles: { attempted: counters.attemptedCycles, completed: counters.completedCycles, perScopeEpoch: [] },
    execution: { dispatches: list.length, reviewExecutions: counters.reviewExecutions, reviewBatches: counters.reviewBatches, retries: counters.implementationRetries, redirects: 0, contractRevisions: counters.contractRevisions, preparationRepairs: counters.preparationRepairs, engineRecoveries: 0, startedWithoutResult: 0, administrativeDispatches: 0, nestedDispatches: 0 },
    usage,
    time: { startedAt: intervals.length ? new Date(Math.min(...intervals.map(i => i.startMs))).toISOString() : null, lastObservedAt: intervals.length ? new Date(Math.max(...intervals.map(i => i.endMs))).toISOString() : null, terminalAt: delivery === 'ready-for-merge' ? asOf : null, elapsedMs: time.elapsedMs, activeWallMs: time.activeWallMs, agentMs: time.agentMs, waitMs: time.waitMs, byPhase: [] },
    defects: { openBySeverity, closedBySeverity, late, entries: [...findingsById.values()] },
    scopeChanges: { ...scopeCounts, entries: scopeEntries },
    steps: merged,
    publication: { marker: null, commentId: null, url: null, metricsRevision: revision, sourceDigest: null, state: 'not-applicable', lastError: null },
  }
}

export function renderMarkdown(view) {
  const lines = []
  lines.push(`# Metrics — ${view.identity.repository}#${view.identity.storyId}${view.identity.prNumber ? ` PR#${view.identity.prNumber}` : ''}`)
  lines.push('')
  lines.push(`Workflow: ${view.workflow.name} ${view.workflow.versions.join(', ') || 'unknown'} | Quality: **${view.outcome.quality}** | Delivery: **${view.outcome.delivery}**`)
  lines.push('')
  lines.push(`Cycles: ${view.cycles.completed} completed / ${view.cycles.attempted} attempted`)
  lines.push(`Reviews: ${view.execution.reviewExecutions} executions, ${view.execution.reviewBatches} batches`)
  lines.push(`Tokens: ${view.usage.observedTotalTokens ?? 'unknown'} (coverage ${view.usage.coverage.known}/${view.usage.coverage.total})`)
  lines.push(`Time: elapsed ${view.time.elapsedMs ?? 'unknown'}ms, active ${view.time.activeWallMs ?? 'unknown'}ms, agent ${view.time.agentMs ?? 'unknown'}ms`)
  if (view.scopeChanges.entries.length) lines.push(`Scope proposals: ${view.scopeChanges.pending} pending, ${view.scopeChanges.ignored} ignored, ${view.scopeChanges.extended} extended, ${view.scopeChanges.deferred} deferred`)
  lines.push(`Snapshot: revision ${view.snapshot.revision}, completeness ${view.snapshot.completeness}`)
  return lines.join('\n') + '\n'
}

// ── persistence: atomic, revision-checked ───────────────────────────────────────────────────
export function writeMetrics({ dir, view }) {
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'metrics.json')
  if (existsSync(jsonPath)) {
    let prior
    try {
      prior = JSON.parse(readFileSync(jsonPath, 'utf8'))
    } catch {
      prior = null
    }
    if (prior && Number.isInteger(prior.snapshot?.revision) && prior.snapshot.revision >= view.snapshot.revision) return { written: false, reason: 'stale-revision', priorRevision: prior.snapshot.revision }
  }
  const tmpJson = join(dir, `.tmp-metrics-${process.pid}-${Date.now()}.json`)
  writeFileSync(tmpJson, JSON.stringify(view, null, 2) + '\n')
  renameSync(tmpJson, jsonPath)
  const mdPath = join(dir, 'metrics.md')
  const tmpMd = join(dir, `.tmp-metrics-${process.pid}-${Date.now()}.md`)
  writeFileSync(tmpMd, renderMarkdown(view))
  renameSync(tmpMd, mdPath)
  return { written: true, jsonPath, mdPath }
}

// A confirmation-only update (e.g. `publication.state` after a successful/failed post) is NOT a
// new semantic revision (S8) — patch metrics.json's `publication` field alone, same revision, so a
// later reconcile's real revision bump is never mistaken for stale.
export function updatePublicationState({ dir, publication }) {
  const jsonPath = join(dir, 'metrics.json')
  if (!existsSync(jsonPath)) return { written: false, reason: 'no-metrics-yet' }
  let view
  try {
    view = JSON.parse(readFileSync(jsonPath, 'utf8'))
  } catch {
    return { written: false, reason: 'metrics-unreadable' }
  }
  view.publication = { ...view.publication, ...publication }
  const tmp = join(dir, `.tmp-metrics-${process.pid}-${Date.now()}.json`)
  writeFileSync(tmp, JSON.stringify(view, null, 2) + '\n')
  renameSync(tmp, jsonPath)
  return { written: true }
}

// ── PR summary (S8): required order, compact machine-readable tail ─────────────────────────
export function renderPrSummary(view) {
  const lines = []
  lines.push('## Delivery workflow summary')
  lines.push('')
  lines.push(`**1. Identity** — ${view.workflow.name} ${view.workflow.versions.join(', ') || 'unknown'}${view.workflow.mixedVersions ? ' (mixed versions)' : ''} | run \`${view.identity.canonicalRunId ?? 'unknown'}\`${(view.identity.runIds ?? []).length > 1 ? ` (+${view.identity.runIds.length - 1} other run(s))` : ''} | models: ${view.workflow.models.join(', ') || 'unknown'} | reviewed head: \`${view.outcome.reviewedHead ?? 'none yet'}\``)
  lines.push('')
  lines.push(`**2. Status** — quality: **${view.outcome.quality}** · delivery: **${view.outcome.delivery}**${view.outcome.reason ? ` (${view.outcome.reason})` : ''} · gate/custody: ${view.outcome.quality === 'converged' ? 'passed' : 'pending'}`)
  lines.push('')
  lines.push(`**3. Cycles** — completed ${view.cycles.completed} / attempted ${view.cycles.attempted} · review batches ${view.execution.reviewBatches} · review executions ${view.execution.reviewExecutions} · retries ${view.execution.retries} · redirects ${view.execution.redirects} · contract revisions ${view.execution.contractRevisions} · preparation repairs ${view.execution.preparationRepairs} · admin/engine recoveries ${view.execution.engineRecoveries}`)
  lines.push('')
  const cov = view.usage.coverage
  lines.push(`**4. Cost / time** — tokens ${view.usage.observedTotalTokens ?? 'unknown'} (known ${cov.known}/${cov.total}${view.usage.missingExecutionIds.length ? `; missing: ${view.usage.missingExecutionIds.join(', ')}` : ''}) · elapsed ${view.time.elapsedMs ?? 'unknown'}ms · active ${view.time.activeWallMs ?? 'unknown'}ms · agent ${view.time.agentMs ?? 'unknown'}ms · wait ${view.time.waitMs ?? 'unknown'}ms`)
  lines.push('')
  const late = view.defects.late
  lines.push(`**5. Late defects** (by origin) — preexisting-missed ${late.preexistingMissed} · introduced-by-remediation ${late.introducedByRemediation} · unknown ${late.unknown}`)
  lines.push('')
  if (view.scopeChanges.entries.length) {
    lines.push('| Scope proposal | Type | Status | Link |')
    lines.push('| --- | --- | --- | --- |')
    for (const c of view.scopeChanges.entries) lines.push(`| ${c.id} | ${c.type} | ${c.status ?? 'pending'} | ${c.targetIssueUrl ?? '—'} |`)
  } else lines.push('No scope proposals.')
  lines.push('')
  lines.push('**6. Machine-readable summary**')
  lines.push('```json')
  lines.push(JSON.stringify({ schemaVersion: view.schemaVersion, sourceDigest: view.snapshot.sourceDigest, asOf: view.snapshot.asOf, metricsRevision: view.snapshot.revision, completeness: view.snapshot.completeness, missingSources: view.snapshot.missingSources }, null, 2))
  lines.push('```')
  return lines.join('\n') + '\n'
}

// A hidden boundary marks where the machine-generated section ends — anything a human wrote AFTER
// it in a prior comment is preserved verbatim across a republish, never silently overwritten (S8).
export const HUMAN_BOUNDARY = '<!-- pair:metrics:end -->'

// `listComments`/`findByMarker`/`upsert` are INJECTED (from pr-comment.mjs) so this module stays
// dependency-light and testable without a `gh` transport; cycle-runtime.mjs wires the real ones.
export function publishSummary({ view, marker, pr, repo, listComments, findByMarker, upsert }) {
  const before = listComments({ pr, repo })
  const priorHit = findByMarker(before, marker).hits[0]
  let humanSuffix = ''
  if (priorHit) {
    const idx = priorHit.body.indexOf(HUMAN_BOUNDARY)
    if (idx !== -1) humanSuffix = priorHit.body.slice(idx + HUMAN_BOUNDARY.length)
  }
  const generated = renderPrSummary(view) + HUMAN_BOUNDARY + humanSuffix
  const result = upsert({ pr, marker, body: generated, repo })
  const base = { marker, metricsRevision: view.snapshot.revision, sourceDigest: view.snapshot.sourceDigest }
  if (result.error) return { published: false, publication: { ...base, commentId: null, url: null, state: 'failed', lastError: result.error } }
  const after = listComments({ pr, repo })
  const readback = findByMarker(after, marker).hits.find(h => h.id === result.id)
  if (!readback || !readback.body.startsWith(marker)) return { published: false, publication: { ...base, commentId: result.id ?? null, url: result.url ?? null, state: 'failed', lastError: 'readback-mismatch' } }
  return { published: true, publication: { ...base, commentId: result.id, url: result.url, state: 'confirmed', lastError: null } }
}

// ── aggregate (S9) ───────────────────────────────────────────────────────────────────────────
// Percentile (nearest-rank) over a SORTED numeric array.
function nearestRank(sorted, pct) {
  if (!sorted.length) return null
  const rank = Math.ceil(pct * sorted.length)
  return sorted[Math.max(0, Math.min(sorted.length, rank) - 1)]
}
function median(sorted) {
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// `entries`: one persisted metrics view per admitted PR/story identity (already deduped by the
// caller — repository+PR, or repository+story+branch before a PR exists — one record per identity;
// a mixed-version PR folds all its scope epochs/runs into ONE entry with `workflow.mixedVersions`).
export function aggregateCohort(entries) {
  const N = entries.length
  const by = state => entries.filter(e => e.outcome.cohortState === state).length
  const completed = by('completed')
  const blocked = by('blocked')
  const abandoned = by('abandoned')
  const running = by('running')
  const interrupted = by('interrupted')
  const settledDenominator = completed + blocked + abandoned
  const readyCycles = entries.filter(e => e.outcome.cohortState === 'completed').map(e => e.cycles.completed).sort((a, b) => a - b)
  const allTokens = entries.reduce((s, e) => s + (e.usage.observedTotalTokens ?? 0), 0)
  const knownTokenEntries = entries.filter(e => e.usage.observedTotalTokens != null).length
  return {
    n: N,
    completedRate: N ? completed / N : null,
    blockedRate: N ? blocked / N : null,
    abandonedRate: N ? abandoned / N : null,
    runningRate: N ? running / N : null,
    interruptedRate: N ? interrupted / N : null,
    settled: { completed, blocked, abandoned, denominator: settledDenominator, completedRate: settledDenominator ? completed / settledDenominator : null },
    meanCompletedCycles: readyCycles.length ? readyCycles.reduce((a, b) => a + b, 0) / readyCycles.length : null,
    medianCompletedCycles: median(readyCycles),
    p90CompletedCycles: nearestRank(readyCycles, 0.9),
    sampleCount: readyCycles.length,
    histogram: readyCycles.reduce((h, c) => ((h[c] = (h[c] ?? 0) + 1), h), {}),
    allWorkTokens: knownTokenEntries ? allTokens : null,
    costPerCompletedDelivery: completed && knownTokenEntries ? { value: allTokens / completed, lowerBound: knownTokenEntries < N } : null,
  }
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
function loadJsonOrEmpty(path) {
  if (!path) return []
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return []
  }
}
export function main(argv) {
  const { cmd, opts } = parseCli(argv)
  const need = (...ks) => {
    for (const k of ks) if (opts[k] === undefined) throw new Error(`--${k} is required`)
  }
  if (cmd === 'reduce' || cmd === 'write') {
    need('dir', 'repository', 'story', 'branch')
    const view = reduceCycleMetrics({ dir: opts.dir, repository: opts.repository, story: opts.story, branch: opts.branch, pr: opts.pr ? Number(opts.pr) : undefined, runId: opts.runId, observations: loadJsonOrEmpty(opts.observations), revision: opts.revision ? Number(opts.revision) : 1, asOf: opts.asOf ?? new Date().toISOString() })
    if (cmd === 'reduce') return { out: view, code: 0 }
    const res = writeMetrics({ dir: opts.dir, view })
    return { out: res, code: res.written ? 0 : 1 }
  }
  if (cmd === 'aggregate') {
    need('inputs', 'out')
    const manifest = JSON.parse(readFileSync(opts.inputs, 'utf8'))
    const entries = (manifest.entries ?? manifest).map(e => (e.metricsPath ? JSON.parse(readFileSync(e.metricsPath, 'utf8')) : e))
    const cohort = aggregateCohort(entries)
    mkdirSync(opts.out, { recursive: true })
    writeFileSync(join(opts.out, 'cohort.json'), JSON.stringify(cohort, null, 2) + '\n')
    writeFileSync(join(opts.out, 'cohort.md'), `# Cohort report\n\nN=${cohort.n}, completed=${(cohort.completedRate ?? 0) * 100}%, mean cycles=${cohort.meanCompletedCycles ?? 'n/a'}\n`)
    return { out: cohort, code: 0 }
  }
  throw new Error(`unknown command: ${cmd} (expected reduce | write | aggregate)`)
}

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const isMain = () => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}
if (isMain()) {
  try {
    const { out, code } = main(process.argv.slice(2))
    process.stdout.write(JSON.stringify(out) + '\n')
    process.exit(code)
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(2)
  }
}
