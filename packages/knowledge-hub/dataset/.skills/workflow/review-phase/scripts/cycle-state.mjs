#!/usr/bin/env node
// The durable transition authority of ONE delivery cycle (US-479, ADR-024 amendment b).
//
// The Workflow coordinator has no filesystem: it can only dispatch a skill and validate what the
// skill returns. So the question "what is the first incomplete step of this cycle?" is answered
// HERE, from the phase handoffs under `.pair/working/runs/<run>/<story>/` in the MAIN checkout,
// by a script every phase skill runs (a) before doing anything — to redirect the coordinator when
// another step is due — and (b) after publishing its own handoff — to return the next step.
// The handoffs stay the storage authority: this module derives, it never stores a second copy.
//
//   node <skill dir>/scripts/cycle-state.mjs resolve --dir <run/story dir> --workflowVersion <v>
//        --policy '{"maxFixRounds":3,"redRepairs":1,"greenRetries":1,"reviewers":1}' --entry fresh|pr
//        [--pr <n>] [--head <remote 40-hex>] [--inputs <digest>] [--acHash <digest>]
//        [--runsRoot <.pair/working/runs>] [--story <id>]
//     → { status: empty | in-progress | completed | blocked | incompatible | invalid | other-run, next, ... }
//
//   node … publish --dir <dir> --file <complete draft.json> --phase <p> --skill <s> --workflowVersion <v>
//        [--predecessor <phase>-<skill>] [--attempt <n>] [--pr <n>]
//        --pr stamps the PR the cycle is bound to into the envelope (canary run 11: a revision's
//        implement handoff carried pr=null although #483 existed); a PR that contradicts the draft
//        or an earlier handoff of the run is refused (pr-mismatch), never overwritten.
//     Validates the envelope, checks the predecessor, takes the directory lock, assigns a monotonic
//     `seq`, writes `<phase>-<skill>[.attempt-<n>].json` atomically (temp + rename), removes the
//     draft. A second writer for the same step is `stale-write`; a held lock is never broken.
//
//   node … hash --file <contract.json>            → { contractHash }   (canonical, volatile fields excluded)
//   node … inputs --json '<effective inputs>'      → { inputsDigest }
//   node … ac-hash --story <id>                    → { acHash }        canonical sha256 of the card body (gh issue view)
//   node … test-identity --cwd <worktree> --command <cmd> [--env-keys K1,K2] [--toolchain <s>]
//     → { identity, parts, reusable, missing }     a cached test result is valid ONLY for this identity
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const SCHEMA_VERSION = 2
export const SKILLS = ['red-spec', 'red-verify', 'implement-phase', 'green-fix', 'review-phase']
export const STEPS = ['prepare', 'validate', 'implement', 'green', 'verify', 'done', 'blocked']
export const PREPARE_REFUSALS = ['stale', 'split-required', 'unprovable', 'dirty']
const SHA_RE = /^[0-9a-f]{40}$/
const PHASE_RE = /^(a0(?:-rev\d+)?|r\d+(?:-g\d+(?:-rev\d+)?)?)$/
const NAME_RE = /^(a0(?:-rev\d+)?|r\d+(?:-g\d+(?:-rev\d+)?)?)-(red-spec|red-verify|implement-phase|green-fix|review-phase)(?:\.attempt-(\d+))?\.json$/

const sha256 = s => `sha256:${createHash('sha256').update(s).digest('hex')}`
// Canonical JSON: sorted keys at every level, so two spellings of one object hash alike.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  return JSON.stringify(value)
}
const VOLATILE = new Set(['contractPath', 'createdAt', '$meta', 'contractHash', 'seq', 'schemaVersion', 'workflowVersion'])
export const contractHash = contract =>
  sha256(canonical(Object.fromEntries(Object.entries(contract ?? {}).filter(([k]) => !VOLATILE.has(k)))))
export const inputsDigest = inputs => sha256(canonical(inputs ?? {}))
export const compatible = (mine, theirs) => {
  const major = v => (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v.split('.')[0] : null)
  return major(mine) !== null && major(mine) === major(theirs)
}
export function phaseParts(phase) {
  // The initial acceptance contract is group `a0`; a genuine gap in it is revised as `a0-rev<m>`,
  // sealed as a successor snapshot, and implemented again on the same story branch.
  const a = /^a0(?:-rev(\d+))?$/.exec(phase)
  if (a) return { kind: 'initial', round: 0, groupId: 'a0', revision: a[1] ? Number(a[1]) : 1 }
  const m = /^r(\d+)(?:-g(\d+)(?:-rev(\d+))?)?$/.exec(phase)
  if (!m) return null
  return { kind: m[2] ? 'group' : 'review', round: Number(m[1]), group: m[2] ? Number(m[2]) : undefined, revision: m[3] ? Number(m[3]) : 1, groupId: m[2] ? `r${m[1]}-g${m[2]}` : undefined }
}

// ── handoffs ───────────────────────────────────────────────────────────────────────────────
export function readHandoffs(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const f of readdirSync(dir)) {
    const m = NAME_RE.exec(f)
    if (!m) continue
    const entry = { file: join(dir, f), name: `${m[1]}-${m[2]}`, phase: m[1], skill: m[2], attempt: m[3] ? Number(m[3]) : 1 }
    try {
      entry.data = JSON.parse(readFileSync(entry.file, 'utf8'))
    } catch (e) {
      entry.invalid = `not-json: ${f}`
    }
    out.push(entry)
  }
  // seq is the publication order; a pre-envelope file (no seq) sorts by mtime so it can be reported
  const seqOf = h => (Number.isInteger(h.data?.seq) ? h.data.seq : Number.POSITIVE_INFINITY)
  return out.sort((a, b) => seqOf(a) - seqOf(b) || statSync(a.file).mtimeMs - statSync(b.file).mtimeMs || a.attempt - b.attempt)
}

const REQUIRED_BY_SKILL = {
  'red-spec': ['status'],
  'red-verify': ['verified', 'sealed'],
  'implement-phase': ['status'],
  'green-fix': ['fixed'],
  'review-phase': ['reviewedHead', 'verdict', 'findings', 'custody', 'readiness'],
}
export function envelopeErrors(data, { phase, skill }) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['not-an-object']
  const errs = []
  for (const k of ['run', 'story', 'phase', 'skill', 'inputHead']) if (data[k] === undefined || data[k] === null || data[k] === '') errs.push(`missing-field:${k}`)
  if (data.inputHead !== undefined && !SHA_RE.test(String(data.inputHead))) errs.push('inputHead-not-a-sha')
  if (!PHASE_RE.test(String(phase))) errs.push(`phase-invalid:${phase}`)
  if (!SKILLS.includes(skill)) errs.push(`skill-unknown:${skill}`)
  for (const k of REQUIRED_BY_SKILL[skill] ?? []) if (data[k] === undefined) errs.push(`missing-field:${k}`)
  if (data.phase !== undefined && data.skill !== undefined && (String(data.phase) !== String(phase) || String(data.skill) !== String(skill))) errs.push('identity-mismatch')
  return errs
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}
function withLock(dir, waitMs, fn) {
  const lock = join(dir, '.lock')
  const deadline = Date.now() + waitMs
  for (;;) {
    try {
      mkdirSync(lock)
      break
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      if (Date.now() >= deadline) return { published: false, reason: 'locked', lock }
      sleep(20)
    }
  }
  try {
    return fn()
  } finally {
    try {
      rmdirSync(lock)
    } catch {}
  }
}

export function publish({ dir, file, phase, skill, workflowVersion, predecessor, attempt, pr, lockWaitMs = 5000 }) {
  let data
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return { published: false, reason: 'not-json', file }
  }
  const errs = envelopeErrors(data, { phase, skill })
  if (errs.length) return { published: false, reason: errs[0], errors: errs }
  if (!compatible(workflowVersion, workflowVersion)) return { published: false, reason: 'workflowVersion-invalid' }
  if (pr !== undefined) {
    if (!Number.isInteger(pr) || pr <= 0) return { published: false, reason: 'pr-invalid', pr }
    if (data.pr !== undefined && data.pr !== null && Number(data.pr) !== pr) return { published: false, reason: 'pr-mismatch', stated: data.pr, pr }
    const prior = existsSync(dir) ? readHandoffs(dir).map(h => h.data?.pr).find(x => Number.isInteger(x) && x > 0) : undefined
    if (prior !== undefined && prior !== pr) return { published: false, reason: 'pr-mismatch', stated: prior, pr, source: 'earlier-handoff' }
    data = { ...data, pr }
  }
  mkdirSync(dir, { recursive: true })
  if (predecessor && !existsSync(join(dir, `${predecessor}.json`))) return { published: false, reason: 'predecessor-missing', predecessor }
  const n = Number.isInteger(attempt) ? attempt : Number.isInteger(data.attempt) ? data.attempt : 1
  const name = `${phase}-${skill}`
  const target = join(dir, n > 1 ? `${name}.attempt-${n}.json` : `${name}.json`)
  return withLock(dir, lockWaitMs, () => {
    if (existsSync(target)) return { published: false, reason: 'stale-write', path: target }
    const seq = readHandoffs(dir).reduce((m, h) => Math.max(m, Number.isInteger(h.data?.seq) ? h.data.seq : 0), 0) + 1
    const stamped = { ...data, schemaVersion: SCHEMA_VERSION, workflowVersion, seq, attempt: n, createdAt: new Date().toISOString(), ...(predecessor ? { predecessor } : {}) }
    const tmp = join(dir, `.tmp-${process.pid}-${Date.now()}.json`)
    writeFileSync(tmp, JSON.stringify(stamped, null, 2) + '\n')
    renameSync(tmp, target)
    if (basename(file) !== basename(target))
      try {
        unlinkSync(file)
      } catch {}
    return { published: true, path: target, name, seq, attempt: n }
  })
}

// ── resolve ────────────────────────────────────────────────────────────────────────────────
const blocked = (reason, extra = {}) => ({ step: 'blocked', reason, ...extra })
const orderGroups = groups => {
  const byId = new Map(groups.map(g => [g.groupId, g]))
  const done = new Set()
  const visiting = new Set()
  const out = []
  const visit = g => {
    if (!g || done.has(g.groupId)) return true
    if (visiting.has(g.groupId)) return false
    visiting.add(g.groupId)
    for (const d of g.dependsOn ?? []) if (!visit(byId.get(d))) return false
    visiting.delete(g.groupId)
    done.add(g.groupId)
    out.push(g)
    return true
  }
  for (const g of groups) if (!visit(g)) return null
  return out
}
const isBlocking = f => f && f.blocking === true && f.transition !== 'resolved' && f.nonActionable !== true

export function deriveNext(handoffs, policy, ctx = {}) {
  const list = handoffs.filter(h => h.data)
  if (!list.length) return ctx.entry === 'pr' ? { step: 'verify', mode: 'first', phase: 'r0', round: 0, attempt: 1 } : { step: 'prepare', mode: 'initial', phase: 'a0', round: 0, attempt: 1 }
  const last = list[list.length - 1]
  const d = last.data
  const parts = phaseParts(last.phase) ?? {}
  const reviews = list.filter(h => h.skill === 'review-phase')
  const lastReview = reviews[reviews.length - 1]
  const byPhase = (skill, phase) => list.filter(h => h.skill === skill && h.phase === phase)
  const latestOf = (skill, phase, pred = () => true) => byPhase(skill, phase).filter(h => pred(h.data)).pop()
  const contractOf = phase => {
    const spec = latestOf('red-spec', phase, x => x.status === 'red')
    const sealed = latestOf('red-verify', phase, x => x.sealed === true)
    return spec ? { path: spec.data.contractPath, hash: spec.data.contractHash, revision: phaseParts(phase)?.revision ?? 1, ...(sealed ? { snapshot: sealed.data.snapshot } : {}) } : undefined
  }
  const planFor = round => list.find(h => h.skill === 'red-spec' && h.phase === `r${round}-g1` && h.data.plan)?.data.plan
  const groupOf = phase => {
    const p = phaseParts(phase)
    const plan = p?.groupId ? planFor(p.round) : undefined
    return plan?.groups?.find(g => g.groupId === p.groupId)
  }
  // Every finding id the cycle has ever seen, with its latest severity — the coordinator seeds its
  // identity checks from this on a resume (its own memory is per-run).
  const priorFindings = () => {
    const seen = new Map()
    for (const r of reviews) for (const f of r.data.findings ?? []) if (f?.id) seen.set(f.id, { id: f.id, severity: f.severity })
    return [...seen.values()]
  }
  const findingsByIds = ids => {
    const pool = new Map()
    for (const r of reviews) for (const f of r.data.findings ?? []) if (f?.id) pool.set(f.id, f)
    return (ids ?? []).map(id => pool.get(id)).filter(Boolean)
  }
  const groupPhases = groupId => list.filter(h => h.skill === 'red-verify' && h.data.sealed === true && (h.phase === groupId || h.phase.startsWith(`${groupId}-rev`))).map(h => h.phase)
  const latestGroupPhase = groupId => groupPhases(groupId).pop() ?? groupId
  // The GREEN retry for the FIRST group (dependency order) of `atf` that still has a retry left —
  // on its own sealed contract, carrying only its findings; null when every group is out.
  const greenRetryFor = (atf, round) => {
    const order = (orderGroups(planFor(round)?.groups ?? []) ?? []).map(g => g.groupId)
    const rank = g => (order.indexOf(g) === -1 ? Number.MAX_SAFE_INTEGER : order.indexOf(g))
    const ids = [...new Set(atf.map(f => f.groupId))].sort((a, b) => rank(a) - rank(b))
    for (const groupId of ids) {
      const phase = latestGroupPhase(groupId)
      const greens = list.filter(h => h.skill === 'green-fix' && h.phase === phase).length
      if (greens <= (policy.greenRetries ?? 1)) return { step: 'green', mode: 'retry', phase, round, attempt: greens + 1, base: latestOf('red-verify', phase, x => x.sealed)?.data.inputHead, contract: contractOf(phase), group: groupOf(phase), findings: atf.filter(f => f.groupId === groupId), detail: 'an approved test still fails on production' }
    }
    return null
  }

  if (last.skill === 'red-spec') {
    if (d.status === 'red') return { step: 'validate', mode: d.mode, phase: last.phase, round: parts.round, attempt: last.attempt, base: d.inputHead, contract: contractOf(last.phase), group: groupOf(last.phase), findings: d.findings?.received ? findingsByIds(d.findings.received) : undefined }
    return blocked('failed-preparation', { refusal: d.status, detail: d.reason ?? d.splitReason, phase: last.phase })
  }
  if (last.skill === 'red-verify') {
    if (d.verified !== true) {
      const repairs = byPhase('red-verify', last.phase).filter(h => h.data.verified !== true).length
      if (repairs <= (policy.redRepairs ?? 1)) return { step: 'prepare', mode: 'repair', phase: last.phase, round: parts.round, attempt: repairs + 1, base: d.inputHead, rejection: d.findings ?? [], contract: contractOf(last.phase), group: groupOf(last.phase) }
      return blocked('failed-contract', { budget: 'redRepairs', phase: last.phase, findings: d.findings ?? [] })
    }
    if (d.sealed !== true) return blocked('failed-seal', { phase: last.phase, detail: d.reason })
    if (parts.kind === 'initial') return { step: 'implement', mode: parts.revision > 1 ? 'revision' : 'initial', phase: last.phase, round: 0, attempt: byPhase('implement-phase', last.phase).length + 1, base: d.inputHead, contract: contractOf(last.phase), pr: list.map(h => h.data.pr).find(x => Number.isInteger(x)) }
    return { step: 'green', mode: parts.revision > 1 ? 'revision' : 'remediation', phase: last.phase, round: parts.round, attempt: 1, base: d.inputHead, contract: contractOf(last.phase), group: groupOf(last.phase), findings: findingsByIds(groupOf(last.phase)?.findings) }
  }
  if (last.skill === 'implement-phase') {
    if (d.status === 'ok' && d.gatesPassed === true && Number.isInteger(d.prNumber) && SHA_RE.test(String(d.outputHead ?? ''))) {
      // A revised acceptance contract (a0-rev<m>) was implemented after a review: the next
      // verification is a re-review of the prior findings + the delta, never a second first review.
      if (lastReview) return { step: 'verify', mode: 're-review', phase: `r${(phaseParts(lastReview.phase)?.round ?? 0) + 1}`, round: (phaseParts(lastReview.phase)?.round ?? 0) + 1, attempt: 1, base: lastReview.data.reviewedHead, prior: lastReview.name, openIds: (lastReview.data.findings ?? []).filter(isBlocking).map(f => f.id), priorFindings: priorFindings(), pr: d.prNumber }
      return { step: 'verify', mode: 'first', phase: 'r0', round: 0, attempt: 1, base: d.outputHead, pr: d.prNumber }
    }
    // A red gate or a failed build is the implementer's to fix on the SAME seal — once. The
    // contract was approved; the implementation was not.
    const attempts = byPhase('implement-phase', last.phase).length
    if (attempts <= (policy.greenRetries ?? 1)) return { step: 'implement', mode: 'retry', phase: last.phase, round: 0, attempt: attempts + 1, base: d.inputHead, contract: contractOf(last.phase), pr: Number.isInteger(d.prNumber) ? d.prNumber : undefined, detail: d.gatesPassed === false ? 'gate red' : d.reason }
    return blocked('failed-implement', { budget: 'greenRetries', detail: d.gatesPassed === false ? 'gate red twice' : d.reason })
  }
  if (last.skill === 'green-fix') {
    if (d.needsHumanDecision === true) return blocked('escalate', { detail: 'green-fix asked for a human decision', phase: last.phase })
    if (d.fixed !== true) return blocked('failed-fix', { phase: last.phase, detail: d.reason })
    const plan = planFor(parts.round)
    const groups = orderGroups(plan?.groups ?? []) ?? []
    const idx = groups.findIndex(g => g.groupId === parts.groupId)
    const nextGroup = groups[idx + 1]
    const roundReview = reviews.filter(h => (phaseParts(h.phase)?.round ?? -1) === parts.round).pop()
    if (roundReview) {
      // This GREEN was a retry after the round's review: the other groups whose approved test
      // still failed take their own retry before the one re-review of all of them.
      const still = (roundReview.data.findings ?? []).filter(f => isBlocking(f) && f.kind === 'approved-test-failing' && f.groupId).filter(f => !list.some(h => h.skill === 'green-fix' && h.phase === latestGroupPhase(f.groupId) && h.data.seq > roundReview.data.seq))
      const retry = still.length ? greenRetryFor(still, parts.round) : null
      if (retry) return retry
    } else if (nextGroup) return { step: 'prepare', mode: 'remediation', phase: nextGroup.groupId, round: parts.round, attempt: 1, base: d.outputHead, group: nextGroup, findings: findingsByIds(nextGroup.findings), plan }
    const prior = lastReview
    return { step: 'verify', mode: 're-review', phase: `r${parts.round}`, round: parts.round, attempt: byPhase('review-phase', `r${parts.round}`).length + 1, base: prior?.data.reviewedHead, prior: prior?.name, openIds: (prior?.data.findings ?? []).filter(isBlocking).map(f => f.id), priorFindings: priorFindings() }
  }
  if (last.skill === 'review-phase') {
    if (d.custody?.contractBreach === true) return blocked('failed-custody', { phase: last.phase, breaches: d.custody.breaches })
    const findings = Array.isArray(d.findings) ? d.findings : []
    const blocking = findings.filter(isBlocking)
    const round = parts.round ?? 0
    // The tier's independent reviewer count is HONOURED here, not merely rendered into a prompt
    // (T-9 review, t9-2): the reviews of one pass share the reviewed head; while fewer than
    // `policy.reviewers` exist — or the last one calls itself partial — the next dispatch is the next
    // reviewer of the SAME phase, and only a complete, non-partial pass is judged below.
    const required = Number.isInteger(policy.reviewers) && policy.reviewers > 0 ? policy.reviewers : 1
    const pass = byPhase('review-phase', last.phase).filter(h => h.data.reviewedHead === d.reviewedHead)
    if (d.partial === true || pass.length < required) {
      const reviewer = Math.max(pass.length, Number.isInteger(d.reviewer) ? d.reviewer : 0) + 1
      if (reviewer <= required) return { step: 'verify', mode: d.mode ?? (round === 0 ? 'first' : 're-review'), phase: last.phase, round, attempt: byPhase('review-phase', last.phase).length + 1, reviewer, base: d.inputHead, prior: last.name, openIds: blocking.map(f => f.id), priorFindings: priorFindings(), detail: `reviewer ${reviewer} of ${required}` }
      return blocked('failed-verify', { phase: last.phase, detail: 'the last reviewer published a partial review' })
    }
    if (!blocking.length) {
      // Readiness is PROVEN only by the remote head the verifier read back at the very end: a
      // 40-hex `readiness.remoteHead` equal to the head it reviewed (T-9 review, t9-3). An
      // omitted or different one is unproven and re-verifies; a `--head` given by the caller
      // must agree as well.
      const remote = String(d.readiness?.remoteHead ?? '').toLowerCase()
      if (d.readiness?.ready === true && SHA_RE.test(remote) && remote === String(d.reviewedHead).toLowerCase()) {
        if (ctx.head && SHA_RE.test(ctx.head) && ctx.head !== d.reviewedHead) return { step: 'verify', mode: 're-review', phase: `r${round + 1}`, round: round + 1, attempt: 1, base: d.reviewedHead, prior: last.name, openIds: [], priorFindings: priorFindings(), headMoved: true }
        return { step: 'done', reviewedHead: d.reviewedHead, round, verdict: d.verdict }
      }
      return { step: 'verify', mode: 're-review', phase: `r${round + 1}`, round: round + 1, attempt: 1, base: d.reviewedHead, prior: last.name, openIds: [], priorFindings: priorFindings(), headMoved: true, detail: SHA_RE.test(remote) ? 'readiness not confirmed on the remote head' : 'readiness not bound to a 40-hex remote head' }
    }
    if (d.needsHumanDecision === true && d.humanDecisionKind === 'history-rewrite') return blocked('escalate', { detail: 'history-rewrite decision', findings: blocking })
    if (blocking.every(f => f.external === true)) return blocked('escalate', { detail: 'external blockers need a human disposition or a read-back-verified correction', findings: blocking })
    if (round >= (policy.maxFixRounds ?? 3)) return blocked('escalate', { budget: 'maxFixRounds', findings: blocking })
    const atf = blocking.filter(f => f.kind === 'approved-test-failing')
    const gaps = blocking.filter(f => f.kind === 'contract-gap')
    // Every blocking finding is an approved test still failing ⇒ GREEN again on the SAME seals,
    // group by group in dependency order (T-9 review, t9-4: two groups used to fall through to a
    // fresh remediation contract). A group out of retries exhausts the budget.
    if (atf.length === blocking.length && atf.every(f => f.groupId)) {
      const retry = greenRetryFor(atf, round)
      if (retry) return retry
      return blocked('failed-fix', { budget: 'greenRetries', phase: latestGroupPhase(atf[0].groupId), findings: blocking })
    }
    if (gaps.length && gaps[0].groupId) {
      const groupId = gaps[0].groupId
      const current = latestGroupPhase(groupId)
      const revision = (phaseParts(current)?.revision ?? 1) + 1
      return { step: 'prepare', mode: 'revision', phase: `${groupId}-rev${revision}`, revision, round, attempt: 1, base: d.reviewedHead, findings: gaps.filter(f => f.groupId === groupId), contract: contractOf(current), group: groupOf(groupId) }
    }
    return { step: 'prepare', mode: 'remediation', phase: `r${round + 1}-g1`, round: round + 1, attempt: 1, base: d.reviewedHead, findings: blocking }
  }
  return blocked('failed-resume', { detail: `unknown last skill ${last.skill}` })
}

export function resolve({ dir, workflowVersion, policy = {}, entry = 'fresh', pr, head, inputs, acHash, runsRoot, story }) {
  const handoffs = readHandoffs(dir)
  const bad = handoffs.find(h => h.invalid)
  if (bad) return { status: 'invalid', reason: bad.invalid, workflowVersion }
  if (!handoffs.length) {
    // Another run directory of the same story/PR may hold the cycle: ONE compatible candidate is
    // adopted (`other-run`), several are ambiguous. Run directories written by another engine major
    // or schema are LEGACY evidence: never adopted, never overwritten, listed so the caller knows a
    // fresh cycle is starting beside them (an explicit runId is how a maintainer starts it).
    const legacyRuns = []
    if (pr !== undefined && runsRoot && story && existsSync(runsRoot)) {
      const candidates = readdirSync(runsRoot).filter(r => {
        const other = join(runsRoot, r, String(story))
        if (other === dir || !existsSync(other)) return false
        const hs = readHandoffs(other).filter(h => h.data && (h.data.pr === undefined || String(h.data.pr) === String(pr)))
        if (!hs.length) return false
        const compatibleRun = hs.every(h => h.data.schemaVersion === SCHEMA_VERSION && compatible(workflowVersion, h.data.workflowVersion))
        if (!compatibleRun) legacyRuns.push(r)
        return compatibleRun
      })
      if (candidates.length === 1) return { status: 'other-run', runId: candidates[0], legacyRuns, workflowVersion }
      if (candidates.length > 1) return { status: 'incompatible', reason: 'ambiguous-runs', candidates, legacyRuns, workflowVersion }
    }
    return { status: 'empty', next: deriveNext([], policy, { entry }), handoffs: [], legacyRuns, workflowVersion }
  }
  for (const h of handoffs) {
    if (h.data.schemaVersion !== SCHEMA_VERSION) return { status: 'incompatible', reason: `schemaVersion ${JSON.stringify(h.data.schemaVersion)} != ${SCHEMA_VERSION} in ${h.name}`, workflowVersion }
    if (!compatible(workflowVersion, h.data.workflowVersion)) return { status: 'incompatible', reason: `workflowVersion ${h.data.workflowVersion} in ${h.name} is not compatible with ${workflowVersion}`, workflowVersion }
    if (story !== undefined && String(h.data.story) !== String(story)) return { status: 'incompatible', reason: 'story-mismatch', workflowVersion }
    if (pr !== undefined && h.data.pr !== undefined && h.data.pr !== null && String(h.data.pr) !== String(pr)) return { status: 'incompatible', reason: 'pr-mismatch', workflowVersion }
  }
  const last = handoffs[handoffs.length - 1]
  let next = deriveNext(handoffs, policy, { entry, head })
  const names = handoffs.map(h => h.name)
  // Changed effective inputs invalidate REVIEW evidence: prior findings + the delta are re-validated
  // from the last reviewed head. Sealed contracts and GREEN commits stay trusted.
  // The card hash is compared only when BOTH sides are canonical (`sha256:<64 hex>` from `ac-hash`):
  // two producers spelling it differently (a free-text summary vs a digest) would otherwise flag a
  // change on every resume and force a re-verification each time (canary run 11).
  const canonicalHash = v => (typeof v === 'string' && /^sha256:[0-9a-f]{64}$/.test(v) ? v : undefined)
  const acNow = canonicalHash(acHash)
  const acThen = canonicalHash(last.data.acHash)
  if (last.skill === 'review-phase' && ((inputs && last.data.inputsDigest && last.data.inputsDigest !== inputs) || (acNow && acThen && acThen !== acNow)) && next.step !== 'blocked') {
    const round = phaseParts(last.phase)?.round ?? 0
    const seen = new Map()
    for (const r of handoffs.filter(h => h.skill === 'review-phase')) for (const f of r.data.findings ?? []) if (f?.id) seen.set(f.id, { id: f.id, severity: f.severity })
    next = { step: 'verify', mode: 're-review', phase: `r${round + 1}`, round: round + 1, attempt: 1, base: last.data.reviewedHead, prior: last.name, openIds: (last.data.findings ?? []).filter(isBlocking).map(f => f.id), priorFindings: [...seen.values()], inputsChanged: true, invalidated: handoffs.filter(h => h.skill === 'review-phase').map(h => h.name) }
  }
  // The PR the cycle is bound to travels with EVERY next: a coordinator resuming a fresh-path card
  // (no prNumber in its args) learns it from here — a verification dispatched without it would
  // key its markers on `PR#null` (canary run 11, finding r1-5).
  const knownPr = handoffs.map(h => h.data.pr ?? h.data.prNumber).find(x => Number.isInteger(x) && x > 0) ?? (Number.isInteger(Number(pr)) && Number(pr) > 0 ? Number(pr) : undefined)
  if (knownPr !== undefined && next && typeof next === 'object' && next.pr === undefined) next = { ...next, pr: knownPr }
  const status = next.step === 'done' ? 'completed' : next.step === 'blocked' ? 'blocked' : 'in-progress'
  const nextFindingSeq = handoffs.filter(h => h.skill === 'review-phase').reduce((m, h) => Math.max(m, ...(h.data.findings ?? []).map(f => Number(/-(\d+)$/.exec(String(f.id ?? ''))?.[1] ?? 0))), 0) + 1
  return { status, next, handoffs: names, last: last.name, pr: knownPr ?? pr, nextFindingSeq, workflowVersion }
}

// ── test identity ──────────────────────────────────────────────────────────────────────────
// A git process must act on the repository named by `cwd`, never on one named by an INHERITED
// environment: a pre-push hook exports GIT_DIR (and friends) to everything it runs, and a script
// that spawned `git init` / `git commit` in a temp directory under that environment re-initialised
// and committed into the REAL repository (core.bare flipped to true, fixture commits on the branch —
// the 2026-09-09 canary incident). Scrub the whole family before every spawn.
const GIT_ENV_RE = /^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/
export const cleanGitEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([k]) => !GIT_ENV_RE.test(k)))

export function testIdentity({ cwd, command, env = {}, toolchain }) {
  const git = args => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanGitEnv() })
    return r.status === 0 ? r.stdout.replace(/\n$/, '') : null
  }
  const tree = git(['rev-parse', 'HEAD^{tree}'])
  const dirty = (git(['status', '--porcelain', '--untracked-files=all']) ?? '')
    .split('\n')
    .filter(Boolean)
    .map(l => l.slice(3).replace(/^"|"$/g, ''))
    .sort()
    .map(p => {
      const full = join(cwd, p)
      return `${p}:${existsSync(full) ? sha256(readFileSync(full)) : 'deleted'}`
    })
  const lockfiles = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'].filter(f => existsSync(join(cwd, f))).map(f => `${f}:${sha256(readFileSync(join(cwd, f)))}`)
  const parts = { tree, dirty, lockfiles, command: String(command ?? ''), env: Object.keys(env).sort().map(k => `${k}=${env[k]}`), toolchain: toolchain ?? null, platform: process.platform }
  const missing = [!tree && 'tree', !command && 'command', !toolchain && 'toolchain'].filter(Boolean)
  return { identity: sha256(canonical(parts)), parts, reusable: missing.length === 0, missing }
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────
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
// Entry-point guard by REAL path: an install directory reached through a symlink (macOS's /var → /private/var,
// a linked skills dir) makes `import.meta.url` and `process.argv[1]` spell the same file two ways, and a
// string comparison silently turns the CLI into a no-op that exits 0. Compare realpaths, never strings.
const isMain = () => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}
if (isMain()) {
  try {
    const { cmd, opts } = parseCli(process.argv.slice(2))
    const need = (...ks) => {
      for (const k of ks) if (opts[k] === undefined) throw new Error(`--${k} is required`)
    }
    let out
    if (cmd === 'resolve') {
      need('dir', 'workflowVersion', 'entry')
      out = resolve({ dir: opts.dir, workflowVersion: opts.workflowVersion, policy: opts.policy ? JSON.parse(opts.policy) : {}, entry: opts.entry, pr: opts.pr, head: opts.head, inputs: opts.inputs, acHash: opts.acHash, runsRoot: opts.runsRoot, story: opts.story })
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(0)
    } else if (cmd === 'publish') {
      need('dir', 'file', 'phase', 'skill', 'workflowVersion')
      out = publish({ dir: opts.dir, file: opts.file, phase: opts.phase, skill: opts.skill, workflowVersion: opts.workflowVersion, predecessor: opts.predecessor, attempt: opts.attempt ? Number(opts.attempt) : undefined, pr: opts.pr !== undefined ? Number(opts.pr) : undefined })
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(out.published ? 0 : 1)
    } else if (cmd === 'hash') {
      need('file')
      out = { contractHash: contractHash(JSON.parse(readFileSync(opts.file, 'utf8'))) }
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(0)
    } else if (cmd === 'ac-hash') {
      // The canonical hash of the story card's body, the ONE spelling every stage records as acHash.
      need('story')
      const body = spawnSync('gh', ['issue', 'view', String(opts.story), '--json', 'body', '-q', '.body'], { encoding: 'utf8' })
      if (body.status !== 0) throw new Error(`gh issue view ${opts.story} failed: ${(body.stderr || '').trim()}`)
      process.stdout.write(JSON.stringify({ acHash: sha256(body.stdout) }) + '\n')
      process.exit(0)
    } else if (cmd === 'inputs') {
      need('json')
      process.stdout.write(JSON.stringify({ inputsDigest: inputsDigest(JSON.parse(opts.json)) }) + '\n')
      process.exit(0)
    } else if (cmd === 'test-identity') {
      need('cwd', 'command')
      const keys = (opts['env-keys'] ?? 'CI,NODE_ENV,TZ').split(',').filter(Boolean)
      const env = Object.fromEntries(keys.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]))
      out = testIdentity({ cwd: opts.cwd, command: opts.command, env, toolchain: opts.toolchain ?? `node ${process.version}` })
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(0)
    } else throw new Error(`unknown command: ${cmd} (expected resolve | publish | hash | inputs | test-identity)`)
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(2)
  }
}
