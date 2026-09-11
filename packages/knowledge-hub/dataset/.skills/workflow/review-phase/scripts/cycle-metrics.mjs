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
  if (b?.accountingBasis ?? a?.accountingBasis) out.accountingBasis = b?.accountingBasis ?? a?.accountingBasis
  return out
}

// A re-observation of the SAME (executionId, kind) updates it; a provider cumulative usage sample
// REPLACES the prior one; a delta-marked sample (`usage.isDelta: true`) is SUMMED — but only ONCE
// per unique `eventId` (US-479 remediation, Finding 3.B, and residual): a lost-response retry
// replays the exact same event, and applying it twice would double the total. The dedup key is
// (executionId, eventId), never eventId alone (two different executions could reuse an id) and
// never content alone (S7: two real executions may report identical usage).
//
// The dedup ledger does NOT survive inside a single call's return value — a merged usage-observed
// observation only carries its SUMMED total, not which eventIds contributed to it. Across a
// checkpoint/restart, `raw` on the NEXT call is `[...priorMergedObservations, ...newRawEvents]`:
// without an externally-persisted ledger, a replayed eventId looks unseen again and gets summed a
// second time (residual: 100+200 -> checkpoint -> replay of the FIRST delta -> 400, not 300). The
// caller (cycle-runtime.mjs) persists the returned `appliedDeltaEventIds` in ITS OWN checkpoint —
// the existing durable path — and passes it back in as `priorLedger` on the next tick; this
// function introduces no independent execution authority, only extends the ledger it already kept
// in-memory into something that can be handed back on the next call.
export function mergeObservations(raw, priorLedger = {}) {
  const byKey = new Map()
  const appliedDeltaEventIds = new Map(Object.entries(priorLedger ?? {}).map(([execId, ids]) => [execId, new Set(ids)]))
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
      if (n.usage?.isDelta && n.eventId) {
        const seen = appliedDeltaEventIds.get(n.executionId) ?? new Set()
        seen.add(n.eventId)
        appliedDeltaEventIds.set(n.executionId, seen)
      }
      continue
    }
    if (n.usage?.isDelta && existing.usage) {
      const seen = appliedDeltaEventIds.get(n.executionId) ?? new Set()
      appliedDeltaEventIds.set(n.executionId, seen)
      if (seen.has(n.eventId)) continue // idempotent replay of the SAME delta event — no-op
      seen.add(n.eventId)
      byKey.set(key, { ...n, usage: sumUsage(existing.usage, n.usage) })
      continue
    }
    byKey.set(key, n)
  }
  const appliedLedger = Object.fromEntries([...appliedDeltaEventIds.entries()].filter(([, ids]) => ids.size).map(([execId, ids]) => [execId, [...ids].sort()]))
  return { observations: [...byKey.values()], errors, appliedDeltaEventIds: appliedLedger }
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

// US-479 remediation (Finding 2): observations carry `observedAt`/`occurredAt` as an epoch-ms
// INTEGER (S7: "UTC timestamps, integer milliseconds") — never an ISO string. `Date.parse` expects
// a string; handed a number it stringifies it into garbage and returns NaN, which later crashed
// `new Date(NaN).toISOString()`. This is the ONE place either format is accepted: a genuine number
// is used as-is; a string is parsed and validated; anything else is explicitly invalid (`null`),
// never coerced into a fabricated duration.
export function toEpochMs(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value) {
    const n = Date.parse(value)
    return Number.isFinite(n) ? n : null
  }
  return null
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
// US-479 remediation (Finding 3): the denominator is every OBSERVED execution — any kind, not only
// `usage-observed` ones — so an execution that started/finished but never reported usage is
// EXPLICITLY missing, never invisible. Parent/child: an execution whose usage carries
// `accountingBasis: 'inclusive-subtree'` already counts its descendants; those descendants are
// excluded from the sum so a subtree is never counted twice (S7 "never both parent and children").
export function reduceUsage(observations) {
  const all = (observations ?? []).filter(o => o && o.executionId)
  const executionIds = new Set(all.map(o => o.executionId))
  const usageByExec = new Map()
  const parentOf = new Map()
  const roleOf = new Map()
  for (const o of all) {
    if (o.parentExecutionId) parentOf.set(o.executionId, o.parentExecutionId)
    if (o.role) roleOf.set(o.executionId, o.role)
    if (o.kind === 'usage-observed' && o.usage) usageByExec.set(o.executionId, o.usage)
  }
  const totalOf = u => (typeof u.totalTokens === 'number' ? u.totalTokens : ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'].every(k => typeof u[k] !== 'number') ? null : ['inputTokens', 'outputTokens'].reduce((s, k) => s + (u[k] ?? 0), 0))
  const excluded = new Set()
  for (const [id, usage] of usageByExec) {
    if (usage.accountingBasis !== 'inclusive-subtree') continue
    for (const childId of executionIds) {
      if (childId === id || excluded.has(childId)) continue
      let p = parentOf.get(childId)
      const seen = new Set()
      while (p && !seen.has(p)) {
        seen.add(p)
        if (p === id) {
          excluded.add(childId)
          break
        }
        p = parentOf.get(p)
      }
    }
  }
  const relevantIds = [...executionIds].filter(id => !excluded.has(id))
  const countedIds = relevantIds.filter(id => usageByExec.has(id))
  const known = countedIds.map(id => usageByExec.get(id))
  const totals = known.map(totalOf).filter(t => t != null)
  const observedTotalTokens = totals.length ? totals.reduce((a, b) => a + b, 0) : null
  const missingExecutionIds = relevantIds.filter(id => !usageByExec.has(id) || totalOf(usageByExec.get(id)) == null).sort()
  const byRoleMap = new Map()
  for (const id of countedIds) {
    const role = roleOf.get(id)
    const t = totalOf(usageByExec.get(id))
    if (!role || t == null) continue
    byRoleMap.set(role, (byRoleMap.get(role) ?? 0) + t)
  }
  return {
    observedTotalTokens,
    inputTokens: known.length ? known.reduce((s, u) => s + (u.inputTokens ?? 0), 0) : null,
    outputTokens: known.length ? known.reduce((s, u) => s + (u.outputTokens ?? 0), 0) : null,
    cacheReadTokens: known.some(u => u.cacheReadTokens != null) ? known.reduce((s, u) => s + (u.cacheReadTokens ?? 0), 0) : null,
    cacheWriteTokens: known.some(u => u.cacheWriteTokens != null) ? known.reduce((s, u) => s + (u.cacheWriteTokens ?? 0), 0) : null,
    coverage: { known: relevantIds.length - missingExecutionIds.length, total: relevantIds.length },
    missingExecutionIds,
    // Observed, charged, and NOT finished: an incomplete or self-inconsistent provider request
    // (US-479 B4). Its tokens are counted; its execution is named so nothing reads as settled.
    incompleteExecutionIds: countedIds.filter(id => ((usageByExec.get(id)?.partialRequests ?? 0) > 0 || (usageByExec.get(id)?.inconsistentRequests ?? 0) > 0)).sort(),
    // US-479 F2: the SOURCE of an already-counted request disappeared (truncation, rotation). The
    // cost stays; the execution is named so the view never reads as fully corroborated.
    truncatedExecutionIds: countedIds.filter(id => (usageByExec.get(id)?.lostRequests ?? 0) > 0).sort(),
    accountingBasis: 'leaf-exclusive',
    byRole: [...byRoleMap.entries()].map(([role, tokens]) => ({ role, tokens })),
    sharedOverhead: null,
  }
}

// ── the main reducer ─────────────────────────────────────────────────────────────────────────
export function reduceCycleMetrics({ dir, repository, story, branch, pr, runId, observations = [], revision = 1, asOf = null, dispatchStats, sharedCost }) {
  const handoffs = readHandoffs(dir)
  const list = handoffs.filter(h => h.data)
  const counters = cycleCounters(handoffs)
  const versions = [...new Set(list.map(h => h.data.workflowVersion).filter(Boolean))]
  // US-479 F5: a `recordType: migration` handoff rides on the review-phase skill because that is
  // where the envelope lives — it is NOT a review. `deriveNext`/`cycleCounters` already skip it;
  // the reducer did not, so a run directory holding only an acknowledgment reported
  // `quality: converged` with zero review executions and a null reviewed head. Judgments only.
  // A `recordType: decision` record IS a real human act and keeps every effect it had.
  const reviews = list.filter(h => h.skill === 'review-phase' && h.data.recordType !== 'migration')
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
  const finishByExec = new Map()
  for (const f of finishEvents) if (!finishByExec.has(f.executionId)) finishByExec.set(f.executionId, f)
  // US-479 remediation (Finding 2): observedAt/occurredAt are epoch-ms NUMBERS (S7) — `toEpochMs`
  // accepts that or a validated ISO string, never `Date.parse` on a number (NaN, then a crash).
  // US-479 remediation (Finding 4, residual): a start with NO finish (in progress, or a result that
  // never arrived) and a finish with NO matching start are BOTH explicit missing-timing evidence —
  // an execution absent from the interval list entirely was invisible to `reduceTime`, so it could
  // never flag `time.incomplete` or push 'timing' into `missingSources`; an all-zero silence read
  // as full coverage. Every execution seen on EITHER side gets one interval, with the missing side
  // left `null` — `reduceTime`'s own known/flagged split then reports it honestly.
  const timedIds = new Set([...startEvents.keys(), ...finishByExec.keys()])
  // US-479 F4 (S7) — THREE clocks, and only one of them is work.
  //   1. the HOST OBSERVATION: when the host read the journal. The harness journal carries no time
  //      of its own, so this is an upper bound on elapsed and NO evidence of duration. Reported
  //      separately, labelled, and never folded into active or agent time.
  //   2. the PROVIDER MESSAGE SPAN: the timestamps of the messages an execution actually produced —
  //      demonstrated work, and the only interval this reducer will measure.
  //   3. a real EXECUTION BOUNDARY carried by a record itself (`timeSource: 'record'`), when a host
  //      ever provides one.
  // An execution with none of 2 or 3 has an UNKNOWN interval: it is flagged incomplete, never given
  // the tick clock (an hour of import lag was reported as an hour of exact active time, F4).
  const spanByExec = new Map()
  for (const o of merged) if (o.kind === 'usage-observed' && o.messageSpan) spanByExec.set(o.executionId, o.messageSpan)
  const demonstrated = o => (o && o.timeSource !== 'host-observation' ? toEpochMs(o.observedAt ?? o.occurredAt) : null)
  const widen = (a, b, pick) => (Number.isInteger(a) && Number.isInteger(b) ? pick(a, b) : Number.isInteger(a) ? a : Number.isInteger(b) ? b : null)
  const intervals = [...timedIds].map(id => {
    const s = startEvents.get(id)
    const f = finishByExec.get(id)
    const span = spanByExec.get(id)
    const spanStart = span ? toEpochMs(span.firstMessageAt) : null
    const spanEnd = span ? toEpochMs(span.lastMessageAt) : null
    // An end is claimed only where the host actually observed the execution finish; a message span
    // on its own never closes an interval.
    return { startMs: widen(demonstrated(s), spanStart, Math.min), endMs: f ? widen(demonstrated(f), spanEnd, Math.max) : null }
  })
  const hostObservedTimes = merged.map(o => toEpochMs(o.hostObservedAt ?? (o.timeSource === 'host-observation' ? o.observedAt : null))).filter(v => Number.isInteger(v))
  const observation = {
    firstObservedAt: hostObservedTimes.length ? new Date(Math.min(...hostObservedTimes)).toISOString() : null,
    lastObservedAt: hostObservedTimes.length ? new Date(Math.max(...hostObservedTimes)).toISOString() : null,
    source: 'host-observation',
    note: 'when the host READ the sources; an upper bound on elapsed, never a measure of work',
  }
  const time = reduceTime(intervals)
  const usage = reduceUsage(merged)
  // US-479 B2 (S10, AC-27/22): a legacy run this cycle was bound to is part of the PR's LIFETIME.
  // Whatever it already persisted is folded in; whatever it did not is named and leaves the
  // lifetime explicitly partial — "missing older logs yield partial lifetime metrics, not a clean
  // new PR". Nothing is read from the legacy directory except its own metrics file, and nothing is
  // written back to it.
  // US-479 F6: the predecessors are a SET keyed by verified run identity — iterating the references
  // folded a run named by two overlapping acknowledgments twice (400 tokens for 100+200, three
  // completed cycles for two). Later references of the same runId may only add detail, never a
  // second contribution.
  const predecessorById = new Map()
  for (const h of handoffs.filter(x => x.data?.recordType === 'migration'))
    for (const r of h.data.predecessorRuns ?? []) {
      if (!r?.runId) continue
      const prior = predecessorById.get(r.runId)
      predecessorById.set(r.runId, prior ? { ...prior, ...r, handoffs: prior.handoffs ?? r.handoffs } : r)
    }
  const predecessorRecords = [...predecessorById.values()].sort((a, b) => (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0))
  const predecessorRuns = predecessorRecords.map(r => r.runId)
  const lifetimeUsageKeys = ['observedTotalTokens', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']
  const lifetimeTimeKeys = ['agentMs', 'activeWallMs']
  // A dimension is a SUM only while every contributor knows it: one unknown makes the sum unknown.
  // An `unknown` never silently becomes a 0 just because another source happens to know a 0.
  const acc = Object.fromEntries([...lifetimeUsageKeys, ...lifetimeTimeKeys].map(k => [k, { total: 0, known: true }]))
  const addDimension = (k, v) => {
    if (typeof v === 'number' && Number.isFinite(v)) acc[k].total += v
    else acc[k].known = false
  }
  // The CURRENT cycle's own contribution. A cycle that observed NO execution at all contributes a
  // certain zero — there is nothing there yet. A cycle that observed executions whose usage or
  // timing is missing contributes an UNKNOWN: absence of evidence is not evidence of zero.
  const currentUsageEmpty = (usage.coverage?.total ?? 0) === 0
  const currentTimeEmpty = intervals.length === 0
  for (const k of lifetimeUsageKeys) addDimension(k, currentUsageEmpty ? 0 : usage[k])
  for (const k of lifetimeTimeKeys) addDimension(k, currentTimeEmpty ? 0 : time[k])
  const lifetime = {
    predecessorRuns: predecessorRecords.map(r => ({ runId: r.runId, metricsPath: r.metricsPath ?? null })),
    foldedRuns: [],
    missingRuns: [],
    invalidRuns: [],
    partialRuns: [],
    unknownDimensions: [],
    cycles: { attempted: counters.attemptedCycles, completed: counters.completedCycles },
    usage: {},
    time: {},
    coverage: 'complete',
  }
  for (const r of predecessorRecords) {
    // Foreign evidence is VALIDATED before it counts: readable, this metrics schema, and about this
    // same story/PR. Anything else is refused and named — never trusted for being parseable.
    let prior = null
    let invalid = null
    if (!r.metricsPath || !existsSync(r.metricsPath)) invalid = 'missing'
    else
      try {
        const parsed = JSON.parse(readFileSync(r.metricsPath, 'utf8'))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalid = 'not-an-object'
        else if (parsed.schemaVersion !== METRICS_SCHEMA_VERSION) invalid = `schema:${parsed.schemaVersion}`
        else if (parsed.identity?.storyId !== undefined && String(parsed.identity.storyId) !== String(story)) invalid = 'story-mismatch'
        else if (parsed.identity?.prNumber != null && Number.isInteger(pr) && Number(parsed.identity.prNumber) !== Number(pr)) invalid = 'pr-mismatch'
        else prior = parsed
      } catch {
        invalid = 'unreadable'
      }
    if (!prior) {
      if (invalid === 'missing') lifetime.missingRuns.push(r.runId)
      else lifetime.invalidRuns.push(r.runId)
      // A predecessor whose evidence cannot be read leaves EVERY dimension unknown: its real
      // numbers are not zero, they are unavailable.
      for (const k of [...lifetimeUsageKeys, ...lifetimeTimeKeys]) acc[k].known = false
      continue
    }
    lifetime.foldedRuns.push(r.runId)
    if (prior.snapshot?.completeness === 'partial') lifetime.partialRuns.push(r.runId)
    lifetime.cycles.attempted += prior.cycles?.attempted ?? 0
    lifetime.cycles.completed += prior.cycles?.completed ?? 0
    for (const k of lifetimeUsageKeys) addDimension(k, prior.usage?.[k])
    for (const k of lifetimeTimeKeys) addDimension(k, prior.time?.[k])
  }
  for (const k of lifetimeUsageKeys) lifetime.usage[k] = acc[k].known ? acc[k].total : null
  for (const k of lifetimeTimeKeys) lifetime.time[k] = acc[k].known ? acc[k].total : null
  lifetime.unknownDimensions = [...lifetimeUsageKeys, ...lifetimeTimeKeys].filter(k => !acc[k].known)
  lifetime.foldedRuns.sort()
  lifetime.missingRuns.sort()
  lifetime.invalidRuns.sort()
  lifetime.partialRuns.sort()
  // Two independent kinds of incompleteness, reported separately instead of collapsed into one
  // flag (US-479 F6): `coverage` is about the RUNS — every predecessor imported and none of them
  // itself partial — while `unknownDimensions` is per-DIMENSION, naming exactly which quantity no
  // source could supply. Either one makes the snapshot partial; neither invents a value.
  if (lifetime.missingRuns.length || lifetime.invalidRuns.length || lifetime.partialRuns.length) lifetime.coverage = 'partial'
  // US-479 remediation (Finding 4): the shared-batch allocation formula (allocateSharedCost) is
  // wired into the real reducer path — labeled distinctly from directly-measured tokens (S7).
  if (sharedCost && Array.isArray(sharedCost.admittedIds) && sharedCost.admittedIds.length) {
    const alloc = allocateSharedCost({ tokens: sharedCost.tokens, admittedIds: sharedCost.admittedIds })
    usage.sharedOverhead = Object.prototype.hasOwnProperty.call(alloc.allocations, story) ? alloc.allocations[story] : null
  }
  const known = intervals.filter(i => i && Number.isInteger(i.startMs) && Number.isInteger(i.endMs) && i.endMs >= i.startMs && i.startMs >= 0)
  const hasObservations = merged.length > 0
  // Only an execution actually OBSERVED to start (Finding 4: "dispatches conta handoff, non
  // esecuzioni avviate") — never the handoff count, and explicitly `null` (not 0) with zero
  // telemetry, since a batch could genuinely have run zero OR simply never been observed.
  const dispatches = hasObservations ? startEvents.size : null
  const startedWithoutResult = hasObservations ? [...startEvents.keys()].filter(id => !finishEvents.some(f => f.executionId === id)).length : null
  const admin = dispatchStats ?? {}
  const asInt = v => (Number.isInteger(v) ? v : null)
  // US-479 remediation (Finding 4): a real quantity this reducer cannot derive from handoffs or
  // observations alone stays an explicit `null` — never a fabricated `0` presented as measured.
  const execution = {
    dispatches,
    reviewExecutions: counters.reviewExecutions,
    reviewBatches: counters.reviewBatches,
    retries: counters.implementationRetries,
    redirects: asInt(admin.redirects),
    contractRevisions: counters.contractRevisions,
    preparationRepairs: counters.preparationRepairs,
    engineRecoveries: asInt(admin.engineRecoveries),
    startedWithoutResult,
    administrativeDispatches: asInt(admin.administrativeDispatches),
    nestedDispatches: asInt(admin.nestedDispatches),
  }
  // US-479 remediation (Finding 4): `complete` is earned — every observed execution has matching
  // usage, timing coverage is full, and there IS something observed; a bare "an observation
  // exists" is not proof every declared source was actually reconciled.
  const missingSources = []
  if (usage.missingExecutionIds.length) missingSources.push('usage')
  // US-479 B4: an execution whose provider request never completed (no `stop_reason`) or whose
  // blocks disagreed keeps the cost already observed — but the snapshot it feeds is NOT complete.
  // Having usage is not being finished.
  if (usage.incompleteExecutionIds.length) missingSources.push('usage-incomplete')
  if (usage.truncatedExecutionIds.length) missingSources.push('usage-source-truncated')
  if (lifetime.predecessorRuns.length && (lifetime.coverage === 'partial' || lifetime.unknownDimensions.length)) missingSources.push('legacy-lifetime')
  if (time.incomplete) missingSources.push('timing')
  const completeness = hasObservations && !missingSources.length ? 'complete' : 'partial'
  return {
    schemaVersion: METRICS_SCHEMA_VERSION,
    identity: { repository, storyId: story, prNumber: Number.isInteger(pr) ? pr : null, branch, canonicalRunId: runId ?? null, runIds: [...(runId ? [runId] : []), ...predecessorRuns.filter(r => r !== runId)], predecessorRuns, scopeEpoch: lastReview?.data.scopeEpoch ?? 1 },
    workflow: { name: 'pair-implement-batch', versions, sourceShas: [], artifactDigests: [], models: [...new Set(merged.flatMap(o => (Array.isArray(o.models) ? o.models : [])))].sort(), mixedVersions: versions.length > 1 },
    snapshot: { revision, asOf, sourceDigest: sha256(canonical(list.map(h => h.name))), completeness, missingSources },
    outcome: { quality, delivery, cohortState: delivery === 'ready-for-merge' ? 'completed' : delivery === 'in-progress' ? 'running' : 'blocked', reason: delivery === 'awaiting-scope-decision' ? 'human-scope' : null, qualityConvergedHead: quality === 'converged' ? lastReview?.data.reviewedHead ?? null : null, reviewedHead: lastReview?.data.reviewedHead ?? null },
    cycles: { attempted: counters.attemptedCycles, completed: counters.completedCycles, perScopeEpoch: [] },
    lifetime,
    execution,
    usage,
    // `lastObservedAt` keeps the meaning it always had — the last DEMONSTRATED end — and
    // `lastDemonstratedAt` says so in its name; the host's read clock lives only under
    // `observation`, labelled, so the two can never be confused again (US-479 F4).
    time: { startedAt: known.length ? new Date(Math.min(...known.map(i => i.startMs))).toISOString() : null, lastObservedAt: known.length ? new Date(Math.max(...known.map(i => i.endMs))).toISOString() : null, lastDemonstratedAt: known.length ? new Date(Math.max(...known.map(i => i.endMs))).toISOString() : null, terminalAt: delivery === 'ready-for-merge' ? asOf : null, elapsedMs: time.elapsedMs, activeWallMs: time.activeWallMs, agentMs: time.agentMs, waitMs: time.waitMs, incomplete: time.incomplete, observation, byPhase: [] },
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
  const tok = k => (typeof view.usage[k] === 'number' ? view.usage[k] : 'unknown')
  // The aggregate is the provider's billed total, stated by the adapter with its accounting label
  // (US-479 F3: for Anthropic `input_tokens` excludes cache reads and cache creation, so all four
  // categories are inside the total). The categories are named beside it as details — an aggregate
  // is never counted together with its own details.
  lines.push(`Tokens: ${view.usage.observedTotalTokens ?? 'unknown'} (coverage ${view.usage.coverage.known}/${view.usage.coverage.total}) — in ${tok('inputTokens')}, out ${tok('outputTokens')}, cache read ${tok('cacheReadTokens')}, cache write ${tok('cacheWriteTokens')}`)
  if (view.usage.incompleteExecutionIds?.length) lines.push(`Incomplete provider requests in ${view.usage.incompleteExecutionIds.length} execution(s): the cost is counted, the execution is NOT settled`)
  lines.push(`Time: elapsed ${view.time.elapsedMs ?? 'unknown'}ms, active ${view.time.activeWallMs ?? 'unknown'}ms, agent ${view.time.agentMs ?? 'unknown'}ms`)
  if (view.scopeChanges.entries.length) lines.push(`Scope proposals: ${view.scopeChanges.pending} pending, ${view.scopeChanges.ignored} ignored, ${view.scopeChanges.extended} extended, ${view.scopeChanges.deferred} deferred`)
  if (view.lifetime?.predecessorRuns?.length) {
    const lu = view.lifetime.usage
    lines.push(`Lifetime (incl. ${view.lifetime.predecessorRuns.length} predecessor run${view.lifetime.predecessorRuns.length > 1 ? 's' : ''}: ${view.lifetime.predecessorRuns.map(r => r.runId).join(', ')}) — cycles ${view.lifetime.cycles.completed} completed / ${view.lifetime.cycles.attempted} attempted · tokens ${lu.observedTotalTokens ?? 'unknown'} · agent ${view.lifetime.time.agentMs ?? 'unknown'}ms · coverage ${view.lifetime.coverage}${lifetimeCaveats(view.lifetime)}`)
  }
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
  const tk = k => (typeof view.usage[k] === 'number' ? view.usage[k] : 'unknown')
  lines.push(`**4. Cost / time** — tokens ${view.usage.observedTotalTokens ?? 'unknown'} (in ${tk('inputTokens')} · out ${tk('outputTokens')} · cache read ${tk('cacheReadTokens')} · cache write ${tk('cacheWriteTokens')}; known ${cov.known}/${cov.total}${view.usage.missingExecutionIds.length ? `; missing: ${view.usage.missingExecutionIds.join(', ')}` : ''}${view.usage.incompleteExecutionIds?.length ? `; unfinished provider requests in ${view.usage.incompleteExecutionIds.length} execution(s)` : ''}) · elapsed ${view.time.elapsedMs ?? 'unknown'}ms · active ${view.time.activeWallMs ?? 'unknown'}ms · agent ${view.time.agentMs ?? 'unknown'}ms · wait ${view.time.waitMs ?? 'unknown'}ms`)
  // US-479 B2: what this PR cost across every run it actually had — never silently reduced to the
  // current run directory, and explicitly partial when a predecessor persisted no metrics.
  if (view.lifetime?.predecessorRuns?.length)
    lines.push(`   *Lifetime across ${view.lifetime.predecessorRuns.length + 1} run(s) (${[view.identity.canonicalRunId, ...view.lifetime.predecessorRuns.map(r => r.runId)].filter(Boolean).join(', ')})* — cycles ${view.lifetime.cycles.completed} completed / ${view.lifetime.cycles.attempted} attempted · tokens ${view.lifetime.usage.observedTotalTokens ?? 'unknown'} · agent ${view.lifetime.time.agentMs ?? 'unknown'}ms · coverage **${view.lifetime.coverage}**${lifetimeCaveats(view.lifetime)}`)
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

// Every reason a lifetime is not fully corroborated, named where the number is shown (US-479 F6).
function lifetimeCaveats(l) {
  const parts = []
  if (l.missingRuns.length) parts.push(`no persisted metrics for ${l.missingRuns.join(', ')}`)
  if (l.invalidRuns.length) parts.push(`unusable evidence for ${l.invalidRuns.join(', ')}`)
  if (l.partialRuns.length) parts.push(`${l.partialRuns.join(', ')} was itself partial`)
  if (l.unknownDimensions.length) parts.push(`unknown: ${l.unknownDimensions.join(', ')}`)
  return parts.length ? ` (${parts.join('; ')})` : ''
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
  // US-479 F6: a resumed PR's cycles and cost belong to its WHOLE known history. Reading
  // `e.cycles`/`e.usage` measured only the current run directory, so starting a fresh directory
  // made a PR look cheaper and faster than it was. `lifetime` already folds every bound
  // predecessor exactly once, with its own coverage — so it is the cohort's input when present,
  // and its coverage travels with the numbers instead of being lost.
  const cyclesOf = e => e.lifetime?.cycles?.completed ?? e.cycles.completed
  const tokensOf = e => (e.lifetime?.predecessorRuns?.length ? e.lifetime.usage?.observedTotalTokens : e.usage.observedTotalTokens) ?? null
  const coverages = entries.map(e => (e.lifetime?.predecessorRuns?.length ? e.lifetime.coverage : e.snapshot?.completeness) ?? 'complete')
  const lifetimeCoverage = coverages.some(c => c !== 'complete') ? 'partial' : 'complete'
  const by = state => entries.filter(e => e.outcome.cohortState === state).length
  const completed = by('completed')
  const blocked = by('blocked')
  const abandoned = by('abandoned')
  const running = by('running')
  const interrupted = by('interrupted')
  const settledDenominator = completed + blocked + abandoned
  const readyCycles = entries.filter(e => e.outcome.cohortState === 'completed').map(cyclesOf).sort((a, b) => a - b)
  const allTokens = entries.reduce((s, e) => s + (tokensOf(e) ?? 0), 0)
  const knownTokenEntries = entries.filter(e => tokensOf(e) != null).length
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
    lifetimeCoverage,
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
