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
//   node … migrate-acknowledge --dir <new run/story dir> --legacy <legacy dir>[,<dir>...]
//        --workflowVersion <v> --story <id> --run <runId> --head <40-hex> [--pr <n>] [--branch <b>]
//     → { applied, migrationKey, predecessorRuns }   (US-479 B2, S10)
//     Binds a NEW run directory to the legacy run(s) it continues — transitively — with verified
//     per-file digests and migrate-inspect's finding. Read-only on the legacy directory; writes no
//     counter, token, verdict or approval; idempotent (`already-acknowledged`).
//
//   node … migrate-inspect --dir <run/story dir>   → { compatibleEvidenceRefs, missingDimensions, ambiguity, next }
//     Read-only (US-479 T-19, S10): never rewrites schema-2 evidence, never fabricates a counter.
//
//   node … apply-scope-decisions --dir <dir> --decision-ref <PR comment URL> --repo <owner/name> --pr <n> [--maintainer <login>]
//     → { applied, reason?, results?, path? }   (US-479 T-22, S5)
//     Reads the ACTUAL PR comment through `gh`; verifies author type=User and login in the
//     authorized set; applies ignore | new-card | extend-current-card mechanically and persists a
//     `recordType: decision` review-phase handoff. Idempotent on the same decisionRef.
//
//   node … test-identity --cwd <worktree> --command <cmd> [--env-keys K1,K2] [--toolchain <s>]
//     → { identity, parts, reusable, missing }     a cached test result is valid ONLY for this identity
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const SCHEMA_VERSION = 3
// Pinned once here (US-479 T-19, S1) so no caller re-spells it: workflow 4.0.0 / handoff schema 3
// consume this; cycle-metrics.mjs (T-24) stamps its own views with METRICS_SCHEMA_VERSION.
export const METRICS_SCHEMA_VERSION = 1
export const SKILLS = ['red-spec', 'red-verify', 'implement-phase', 'green-fix', 'review-phase']
export const STEPS = ['prepare', 'validate', 'implement', 'green', 'verify', 'done', 'blocked']
export const PREPARE_REFUSALS = ['stale', 'split-required', 'unprovable', 'dirty']
// US-479 B1 (S3, AC-08, DT-04): a preparation that discovers its obligation cannot be contracted
// WITHOUT contradicting rows of an already-sealed contract answers `contradiction` — a typed
// evidence-bearing answer that routes a minimal successor revision in the same canonical cycle,
// NOT a refusal. `split-required` (a behavior repair and a refactor cannot share one contract)
// stays what it was: terminal. The two are different findings about the cycle and never convert
// into one another — prose alone can never become the typed evidence (envelopeErrors below).
export const PREPARE_STATUSES = ['red', ...PREPARE_REFUSALS, 'contradiction']
export const REVISION_REASONS = ['contradicts-approved-authority']
// Schema-3 taxonomy (US-479 T-19, S1/S2/S5) — the ONE spelling every handoff and comment must use.
export const FINDING_TRANSITIONS = ['open', 'resolved', 'superseded', 'human']
// US-479 T-24 (S2/S9, AC-23): late-defect origin — never inferred from file age or LLM confidence,
// only from a replay at the baseline head vs the defective head (originEvidence).
export const FINDING_ORIGINS = ['preexisting-missed', 'introduced-by-remediation', 'unknown']
export const RECORD_TYPES = ['decision', 'migration', 'judgment']
// US-479 T-29 (S11, D5): a regression provably INTRODUCED by a remediation is an entry of the
// existing finding ledger — not a fifth stage, not a second authority. Its two states are the whole
// lifecycle; the active matrix is DERIVED from them and never stored or supplied by a caller.
export const REGRESSION_RISK_STATES = ['active', 'discharged']
export const SCOPE_CHANGE_TYPES = ['new-requirement', 'scope-extension']
export const SCOPE_CHANGE_STATUSES = ['pending', 'ignored', 'extended', 'deferred']
// New public engine statuses beyond ready-for-merge/escalate/failed-*/incompatible (ADR-024
// amendment 2026-09-10). All four are non-ready: a caller already halts on any status it does not
// recognise, so this list is documentation the conformance tests pin, not a new caller branch.
export const NEW_PUBLIC_STATUSES = ['awaiting-scope-decision', 'failed-publication', 'interrupted', 'abandoned']
export const SCOPE_DECISION_ACTIONS = ['ignore', 'new-card', 'extend-current-card']
const SHA_RE = /^[0-9a-f]{40}$/
// A gap's reproducer command is an executable reference, never shell code pasted into an unsafe
// eval (S3) — the same hostile-value shape the coordinator already refuses in card/pipeline fields.
const SHELL_METACHAR_RE = /[;&|`]|\$\(|\.\.\//
// `m<n>` is a RECORD-ONLY phase (US-479 B2, S10): a migration acknowledgment is durable evidence
// about where this cycle came from, never a position in the cycle. `phaseParts` returns null for it
// and `deriveNext`/`cycleCounters` skip it, so it can never be read as a step, a review or readiness.
const PHASE_RE = /^(a0(?:-rev\d+)?|r\d+(?:-g\d+(?:-rev\d+)?)?|m\d+)$/
const NAME_RE = /^(a0(?:-rev\d+)?|r\d+(?:-g\d+(?:-rev\d+)?)?|m\d+)-(red-spec|red-verify|implement-phase|green-fix|review-phase)(?:\.attempt-(\d+))?\.json$/

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

// ── regression-risk identity (US-479 T-29, S11) ────────────────────────────────────────────
// Deterministic from the PR the cycle is bound to, the STABLE finding id and the remediation batch
// that introduced it. Replay, restart and a second observation of the same regression therefore
// reuse the same id by construction; a different finding or a different introducing batch is a
// different risk. Stamped by `publish`, never spelled by an agent (the acHash lesson, 3.0.12).
export function riskIdOf({ story, pr, findingId, batchId }) {
  if (!findingId || !batchId) return null
  return `risk:${createHash('sha256').update([String(story ?? ''), String(pr ?? ''), String(findingId), String(batchId)].join('\u0000')).digest('hex').slice(0, 16)}`
}

// ── contradiction identity (US-479 B1, S3) ─────────────────────────────────────────────────
// The succession LINE of a contract phase — the identity every revision of it inherits. `a0`,
// `a0-rev4` and any later successor share the line `a0`; `r1-g1-rev2` shares `r1-g1`. It is stable
// across revisions and independent of any contract hash, so a budget keyed on it cannot be reset by
// sealing a new successor, renaming the run or raising the same conflict from another group.
export const successionLineOf = phase => phaseParts(phase)?.groupId
// The VERIFIED identity behind a contract hash: only a red-verify that both verified AND sealed it
// proves the rows a contradiction claims to contradict exist as independently approved rows. A
// merely PREPARED hash is not an identity — the target is never guessed from the current group.
export function sealedContractPhase(handoffs, contractHash) {
  if (!/^sha256:[0-9a-f]{64}$/.test(String(contractHash ?? ''))) return undefined
  const sealed = (handoffs ?? []).filter(h => h.skill === 'red-verify' && h.data && h.data.verified === true && h.data.sealed === true && h.data.contractHash === contractHash)
  return sealed.length ? sealed[sealed.length - 1].phase : undefined
}
// US-479 F1 — the PREDECESSOR's proven evidence, read through the acknowledgment that bound it.
// A legacy run directory is never executable (`resolve` refuses its first pre-schema-3 handoff, and
// that refusal stays), but the identities it PROVED are still facts: `a0-rev3` was sealed there,
// under that contract hash, on that succession line. Without this, a contradiction naming that hash
// was `contradiction-unresolvable` even though the acknowledgment listed the run right beside it.
//
// Reuse is limited and checked: only handoffs whose sha256 still matches the digest the
// acknowledgment recorded are usable — a file that moved since is not evidence, it is a discrepancy
// (`predecessor-evidence-changed`). Nothing is copied forward: no verdict, no finding, no counter.
// What the legacy evidence cannot supply is reported by `migrate-inspect` as missing dimensions and
// travels to the successor as `revalidate`, so it is re-derived rather than inherited.
export function predecessorEvidence(dir) {
  const runs = []
  for (const h of readHandoffs(dir))
    if (h.data?.recordType === 'migration')
      for (const r of h.data.predecessorRuns ?? []) {
        if (!r?.runId || !r.dir || runs.some(x => x.runId === r.runId)) continue
        const handoffs = []
        let changed = null
        for (const entry of r.handoffs ?? []) {
          const file = join(r.dir, entry.name)
          if (!existsSync(file)) {
            changed = changed ?? `${r.runId}/${entry.name}:absent`
            continue
          }
          const digest = `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`
          if (digest !== entry.sha256) {
            changed = changed ?? `${r.runId}/${entry.name}`
            continue
          }
          const m = NAME_RE.exec(entry.name)
          if (!m) continue
          try {
            handoffs.push({ file, name: `${m[1]}-${m[2]}`, phase: m[1], skill: m[2], attempt: m[3] ? Number(m[3]) : 1, data: JSON.parse(readFileSync(file, 'utf8')) })
          } catch {
            changed = changed ?? `${r.runId}/${entry.name}:not-json`
          }
        }
        runs.push({ runId: r.runId, dir: r.dir, handoffs, changed, inspection: r.inspection ?? migrateInspect({ dir: r.dir }) })
      }
  return runs
}

// US-479 F1 residual — a contract's identity is a COHERENT SET of necessary proofs, not one of
// them. The sealed `red-verify` proves the rows were independently approved; the `red-spec` of the
// SAME phase carries the descriptor a revision is built on (its path, its hash). A sealed verify
// whose spec is absent, excluded by a digest discrepancy, or disagreeing about the hash is an
// INCOMPLETE identity: the route would hand the revision no base at all (the residual — `resolve`
// returned `prepare/revision a0-rev4` with no `contract` field whatsoever). Refused, and named.
function contractProofs(handoffs, contractHash) {
  const of = (skill, pred) => (handoffs ?? []).filter(h => h.skill === skill && h.data && pred(h)).pop()
  const sealed = of('red-verify', h => h.data.verified === true && h.data.sealed === true && h.data.contractHash === contractHash)
  if (!sealed) return null
  const spec = of('red-spec', h => h.phase === sealed.phase)
  if (!spec) return { phase: sealed.phase, incomplete: 'contract-descriptor-missing' }
  if (!String(spec.data.contractPath ?? '').trim()) return { phase: sealed.phase, incomplete: 'contract-descriptor-missing' }
  if (spec.data.contractHash !== contractHash) return { phase: sealed.phase, incomplete: `contract-descriptor-hash-mismatch:${spec.data.contractHash ?? 'absent'}` }
  return { phase: sealed.phase, spec, sealed }
}

// The ONE resolution a contradiction's target goes through: the current cycle first, then the
// proven identities of the runs this cycle was bound to. Returns the phase, the two proofs behind
// it, where it was proven and what the legacy evidence cannot supply — or the reason it is unusable.
export function resolveSealedContract({ handoffs, predecessors = [], contractHash }) {
  const own = contractProofs(handoffs, contractHash)
  if (own?.incomplete) return { error: `evidence-incomplete:${own.phase}:${own.incomplete}` }
  if (own) return { phase: own.phase, origin: 'current', spec: own.spec, sealed: own.sealed, missingDimensions: [] }
  for (const p of predecessors) {
    const found = contractProofs(p.handoffs, contractHash)
    if (!found) continue
    // A predecessor whose necessary proof was excluded by the digest check is not a target: the
    // discrepancy that removed it is named, so the answer is never a silent "not found".
    if (found.incomplete) return { error: `predecessor-evidence-incomplete:${p.runId}/${found.phase}:${found.incomplete}${p.changed ? ` (after ${p.changed})` : ''}` }
    return { phase: found.phase, origin: 'predecessor', runId: p.runId, dir: p.dir, handoffs: p.handoffs, spec: found.spec, sealed: found.sealed, missingDimensions: p.inspection?.missingDimensions ?? [] }
  }
  const discrepancy = predecessors.find(p => p.changed)
  return discrepancy ? { error: `predecessor-evidence-changed:${discrepancy.changed}` } : null
}

// One canonical key per (succession line, contractual obligation): the set of conflicting rows,
// deduplicated and sorted, so id order, the raising group and the successor's own hash are all
// irrelevant to it. Stamped by `publish`, never spelled by an agent (the acHash lesson, 3.0.12).
export function contradictionKeyOf({ line, conflictingRowIds }) {
  if (!line || !Array.isArray(conflictingRowIds) || !conflictingRowIds.length) return null
  const rows = [...new Set(conflictingRowIds.map(String))].sort().join('\u0000')
  return `sha256:${createHash('sha256').update(`${line}\u0000${rows}`).digest('hex')}`
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
// The ONE semantic validator (US-479 T-19, S1 bullet 5): envelope shape AND the schema-3 scope/
// finding-transition/record-type fields, checked here before `publish` takes the atomic write —
// never split across a second, looser sandbox-side check that could accept what this rejects.
export function envelopeErrors(data, { phase, skill }) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['not-an-object']
  const errs = []
  for (const k of ['run', 'story', 'phase', 'skill', 'inputHead']) if (data[k] === undefined || data[k] === null || data[k] === '') errs.push(`missing-field:${k}`)
  if (data.inputHead !== undefined && !SHA_RE.test(String(data.inputHead))) errs.push('inputHead-not-a-sha')
  if (!PHASE_RE.test(String(phase))) errs.push(`phase-invalid:${phase}`)
  if (!SKILLS.includes(skill)) errs.push(`skill-unknown:${skill}`)
  if (data.recordType !== 'migration') for (const k of REQUIRED_BY_SKILL[skill] ?? []) if (data[k] === undefined) errs.push(`missing-field:${k}`)
  if (data.phase !== undefined && data.skill !== undefined && (String(data.phase) !== String(phase) || String(data.skill) !== String(skill))) errs.push('identity-mismatch')
  if (data.scopeEpoch !== undefined && (!Number.isInteger(data.scopeEpoch) || data.scopeEpoch < 1)) errs.push('scopeEpoch-invalid')
  if (data.scopeBaselineHash !== undefined && !/^sha256:[0-9a-f]{64}$/.test(String(data.scopeBaselineHash))) errs.push('scopeBaselineHash-invalid')
  if (data.firstReviewHead !== undefined && !SHA_RE.test(String(data.firstReviewHead))) errs.push('firstReviewHead-invalid')
  // US-479 DR4-01: the rollback echo. A spend is decided on this value, so it is a 40-hex head or
  // the handoff does not publish — never a free-text field a phase agent can shape.
  if (data.reconstructedFrom !== undefined && !SHA_RE.test(String(data.reconstructedFrom))) errs.push('reconstructedFrom-not-a-sha')
  if (data.remediationBatchId !== undefined && (typeof data.remediationBatchId !== 'string' || data.remediationBatchId === '')) errs.push('remediationBatchId-invalid')
  if (data.recordType !== undefined && !RECORD_TYPES.includes(data.recordType)) errs.push(`recordType-invalid:${data.recordType}`)
  // red-spec's envelope carries `findings: { received, covered }` — the obligation ids it was
  // handed and the ids its contract covers — NOT review findings (its SKILL.md step 2). Validating
  // it against the review shape refused every preparation that reported what it received
  // (`findings-not-an-array`), which is how a contradiction carrying its origin ids was refused.
  if (data.findings !== undefined && skill === 'red-spec' && !Array.isArray(data.findings)) {
    const f = data.findings
    if (!f || typeof f !== 'object') errs.push('findings-not-an-object')
    else for (const k of ['received', 'covered']) if (f[k] !== undefined && (!Array.isArray(f[k]) || f[k].some(x => typeof x !== 'string' || !x.trim()))) errs.push(`findings-${k}-invalid`)
  } else if (data.findings !== undefined) {
    if (!Array.isArray(data.findings)) errs.push('findings-not-an-array')
    else {
      for (const f of data.findings) {
        if (!f || typeof f !== 'object') continue
        if (f.transition !== undefined && !FINDING_TRANSITIONS.includes(f.transition)) errs.push(`finding-transition-invalid:${f.id ?? '?'}`)
        if (f.origin !== undefined && !FINDING_ORIGINS.includes(f.origin)) errs.push(`finding-origin-invalid:${f.id ?? '?'}`)
        // Origin claimed as decided (not `unknown`) needs the replay evidence that decided it —
        // never inferred from file age or confidence (S2).
        if ((f.origin === 'preexisting-missed' || f.origin === 'introduced-by-remediation') && (!f.originEvidence || typeof f.originEvidence !== 'object')) errs.push(`finding-originEvidence-missing:${f.id ?? '?'}`)
        // US-479 T-20 (S3): a red-verify GAP that names a mechanism is closed only by an executable
        // closure assertion or an explicitly approved non-applicability — never a prose claim, and
        // never silently left for a later, separate rejection to (maybe) mention.
        if (f.mechanismId !== undefined) {
          const tag = f.mechanismId || f.rowId || '?'
          if (f.applicability === 'not-applicable') {
            if (!f.applicabilityRationale) errs.push(`mechanism-not-applicable-without-rationale:${tag}`)
          } else if (!Array.isArray(f.closureAssertions) || !f.closureAssertions.length) errs.push(`mechanism-incompletely-closed:${tag}`)
          else
            for (const ca of f.closureAssertions)
              if (!ca || typeof ca !== 'object' || !ca.id || !ca.expected || (!ca.command && !ca.testRef)) errs.push(`closureAssertion-invalid:${tag}`)
        }
        // US-479 T-29 (S11): `introduced-by-remediation` is a CLAIM with named proofs. The
        // reviewer may make it only with a cited approved obligation, an executable reproducer, the
        // baseline head where the guard passes, the failing head where it does not, the introducing
        // batch and the affected boundaries. Anything less is `unknown` — an ordinary finding — and
        // a changed or new requirement belongs to `scopeChanges`, never here.
        if (f.origin === 'introduced-by-remediation' || f.regressionRisk !== undefined) {
          const tag = f.id ?? '?'
          const rr = f.regressionRisk
          if (!rr || typeof rr !== 'object' || Array.isArray(rr)) errs.push(`regressionRisk-missing:${tag}`)
          else {
            if (f.origin !== 'introduced-by-remediation') errs.push(`regressionRisk-without-origin:${tag}`)
            if (!Array.isArray(f.obligationIds) || !f.obligationIds.length) errs.push(`regression-obligation-missing:${tag}`)
            if (!SHA_RE.test(String(rr.lastCleanReviewedHead ?? ''))) errs.push(`lastCleanReviewedHead-invalid:${tag}`)
            if (!SHA_RE.test(String(rr.firstFailingHead ?? ''))) errs.push(`firstFailingHead-invalid:${tag}`)
            if (SHA_RE.test(String(rr.lastCleanReviewedHead ?? '')) && rr.lastCleanReviewedHead === rr.firstFailingHead) errs.push(`regression-heads-identical:${tag}`)
            if (typeof rr.introducedByRemediationBatchId !== 'string' || !rr.introducedByRemediationBatchId.trim()) errs.push(`introducedByRemediationBatchId-invalid:${tag}`)
            if (typeof rr.reproducerRef !== 'string' || !rr.reproducerRef.trim()) errs.push(`reproducerRef-invalid:${tag}`)
            else if (SHELL_METACHAR_RE.test(rr.reproducerRef)) errs.push(`reproducerRef-unsafe:${tag}`)
            if (!Array.isArray(rr.closureAssertions) || !rr.closureAssertions.length) errs.push(`closureAssertions-missing:${tag}`)
            else
              for (const ca of rr.closureAssertions)
                if (!ca || typeof ca !== 'object' || !ca.id || !ca.expected || (!ca.command && !ca.testRef)) errs.push(`closureAssertion-invalid:${tag}`)
            if (!Array.isArray(rr.affectedBoundaryRefs) || !rr.affectedBoundaryRefs.length || rr.affectedBoundaryRefs.some(b => typeof b !== 'string' || !b.trim())) errs.push(`affectedBoundaryRefs-missing:${tag}`)
            if (!REGRESSION_RISK_STATES.includes(rr.state)) errs.push(`regressionRisk-state-invalid:${tag}`)
            // Only a review bound to the EXACT head it reviewed may discharge (S11): a discharge
            // claimed for another head is not this review's to make.
            if (rr.state === 'discharged') {
              if (!SHA_RE.test(String(rr.dischargedHead ?? ''))) errs.push(`dischargedHead-invalid:${tag}`)
              else if (data.reviewedHead !== undefined && String(rr.dischargedHead) !== String(data.reviewedHead)) errs.push(`discharge-head-mismatch:${tag}`)
              if (!rr.dischargedByReviewId) errs.push(`dischargedByReviewId-missing:${tag}`)
            }
          }
        }
        if (f.reproducer !== undefined) {
          if (!f.reproducer || typeof f.reproducer !== 'object' || typeof f.reproducer.command !== 'string' || !f.reproducer.command.trim()) errs.push(`reproducer-invalid:${f.mechanismId ?? f.rowId ?? '?'}`)
          else if (SHELL_METACHAR_RE.test(f.reproducer.command)) errs.push(`reproducer-command-unsafe:${f.mechanismId ?? f.rowId ?? '?'}`)
        }
      }
      // The verifier's OWN declared set of mechanisms it identified this pass must be closed
      // together — never one gap this round and the sibling mechanism in a later rejection
      // (canary run 3: two independent Markdown rewriters split across successive rejections).
      // This cannot know what the verifier MISSED (no omniscience claim) — only that what it
      // itself named is not silently under-reported.
      if (data.mechanismsIdentified !== undefined) {
        if (!Array.isArray(data.mechanismsIdentified)) errs.push('mechanismsIdentified-not-an-array')
        else {
          const declared = new Set(data.mechanismsIdentified)
          const named = new Set(data.findings.filter(f => f && typeof f === 'object' && f.mechanismId).map(f => f.mechanismId))
          for (const id of declared) if (!named.has(id)) errs.push(`mechanism-not-enumerated:${id}`)
          for (const id of named) if (!declared.has(id)) errs.push(`mechanism-undeclared:${id}`)
        }
      }
    }
  }
  // US-479 B2 (S10, AC-27): a migration acknowledgment is EVIDENCE, not a judgment. It names its
  // predecessors with verified digests and carries no verdict, head, finding or readiness — the
  // shapes that would let it be mistaken for a review or confer readiness are refused outright.
  if (data.recordType === 'migration') {
    for (const k of ['verdict', 'readiness', 'reviewedHead', 'findings', 'custody']) if (data[k] !== undefined) errs.push(`migration-must-not-carry:${k}`)
    const runs = data.predecessorRuns
    if (!Array.isArray(runs) || !runs.length) errs.push('predecessorRuns-missing')
    else
      for (const r of runs) {
        if (!r || typeof r !== 'object' || !String(r.runId ?? '').trim()) errs.push('predecessorRun-invalid')
        else if (!Array.isArray(r.handoffs) || r.handoffs.some(h => !h || !h.name || !/^sha256:[0-9a-f]{64}$/.test(String(h.sha256 ?? '')))) errs.push(`predecessorRun-digests-invalid:${r.runId}`)
      }
    if (!/^sha256:[0-9a-f]{64}$/.test(String(data.migrationKey ?? ''))) errs.push('migrationKey-invalid')
  }
  // US-479 B1 (S3): the contradiction answer carries EXECUTABLE evidence or it is not published.
  // Validated here, before the atomic write, exactly like every other schema-3 field — so a
  // preparation can never hand the cycle a revision route backed by prose.
  if (skill === 'red-spec') {
    if (data.status !== undefined && !PREPARE_STATUSES.includes(data.status)) errs.push(`status-invalid:${data.status}`)
    const isContradiction = data.status === 'contradiction'
    // The 3.0.x refusal (`split-required` + a prose `splitReason`) is NOT this evidence: naming the
    // reason on another status is refused rather than silently promoted (no fabricated validation).
    if (data.revisionReason !== undefined && !isContradiction) errs.push('revisionReason-without-contradiction')
    if (isContradiction) {
      if (!REVISION_REASONS.includes(data.revisionReason)) errs.push(`revisionReason-invalid:${data.revisionReason ?? 'missing'}`)
      if (!/^sha256:[0-9a-f]{64}$/.test(String(data.predecessorContractHash ?? ''))) errs.push('predecessorContractHash-invalid')
      const rows = data.conflictingRowIds
      if (!Array.isArray(rows) || !rows.length || rows.some(r => typeof r !== 'string' || !r.trim())) errs.push('conflictingRowIds-invalid')
      else {
        // The revision may only change what the contradiction names — and must name all of it.
        const changed = new Set(Array.isArray(data.changedRows) ? data.changedRows : [])
        const missing = rows.filter(r => !changed.has(r))
        if (missing.length) errs.push(`changedRows-incomplete:${missing.join(',')}`)
      }
      const cx = data.counterexample
      if (!cx || typeof cx !== 'object' || Array.isArray(cx)) errs.push('counterexample-missing')
      else {
        if (typeof cx.command !== 'string' || !cx.command.trim()) errs.push('counterexample-command-missing')
        else if (SHELL_METACHAR_RE.test(cx.command)) errs.push('counterexample-command-unsafe')
        for (const k of ['expected', 'actual']) if (typeof cx[k] !== 'string' || !cx[k].trim()) errs.push(`counterexample-${k}-missing`)
      }
    }
  }
  // US-479 T-29 (S11): the active regression-risk matrix is a VIEW over the ledger. A handoff that
  // carries its own aggregate would be a second, mutable source of truth.
  if (data.activeRegressionRisks !== undefined) errs.push('activeRegressionRisks-not-storable')
  if (data.invalidatedBatchId !== undefined && (typeof data.invalidatedBatchId !== 'string' || !data.invalidatedBatchId.trim())) errs.push('invalidatedBatchId-invalid')
  // US-479 (ADL 2026-09-12): `worked` — the decisions a review verified CORRECT in work that may be
  // discarded. The contract already carries what must work again (obligations) and what must not
  // break (guards); neither says what was already right, so a rebuild repeats the discarded round's
  // mistakes. Same grammars as the rest of the envelope: evidence is shaped exactly like
  // `closureAssertions`, and the prose escape hatch is the bargain `nonActionable`/`disposition`
  // already strikes — a design decision no command can demonstrate is legal, but must say why.
  if (data.worked !== undefined) {
    if (!Array.isArray(data.worked)) errs.push('worked-not-an-array')
    else
      for (const w of data.worked) {
        if (!w || typeof w !== 'object' || Array.isArray(w)) {
          errs.push('worked-not-an-object')
          continue
        }
        const tag = w.id || '?'
        if (!String(w.id ?? '').trim()) errs.push('worked-id-missing')
        if (!String(w.claim ?? '').trim()) errs.push(`worked-claim-missing:${tag}`)
        // An appunto that applies to nothing cannot reach any rebuild: it is noise, not a note.
        if (!Array.isArray(w.appliesTo) || !w.appliesTo.length || w.appliesTo.some(p => typeof p !== 'string' || !p.trim())) errs.push(`worked-appliesTo-missing:${tag}`)
        const hasEvidence = Array.isArray(w.evidence) && w.evidence.length
        if (w.notVerifiable === true) {
          if (!String(w.rationale ?? '').trim()) errs.push(`worked-rationale-missing:${tag}`)
        } else if (!hasEvidence) errs.push(`worked-unproven:${tag}`)
        if (hasEvidence)
          for (const ev of w.evidence) {
            if (!ev || typeof ev !== 'object' || !ev.id || !ev.expected || (!ev.command && !ev.testRef)) errs.push(`worked-evidence-invalid:${tag}`)
            else if (ev.command && SHELL_METACHAR_RE.test(ev.command)) errs.push(`worked-evidence-unsafe:${tag}`)
          }
      }
  }
  if (data.scopeChanges !== undefined) {
    if (!Array.isArray(data.scopeChanges)) errs.push('scopeChanges-not-an-array')
    else
      for (const c of data.scopeChanges) {
        if (!c || typeof c !== 'object') {
          errs.push('scopeChange-not-an-object')
          continue
        }
        if (!SCOPE_CHANGE_TYPES.includes(c.type)) errs.push(`scopeChange-type-invalid:${c.id ?? '?'}`)
        if (c.status !== undefined && !SCOPE_CHANGE_STATUSES.includes(c.status)) errs.push(`scopeChange-status-invalid:${c.id ?? '?'}`)
        // A scope proposal is NEVER a defect: it can never carry severity or a non-actionable
        // shortcut (S2) — those fields exist only on findings[].
        if (c.severity !== undefined) errs.push(`scopeChange-severity-forbidden:${c.id ?? '?'}`)
        if (c.nonActionable !== undefined) errs.push(`scopeChange-nonActionable-forbidden:${c.id ?? '?'}`)
      }
  }
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

// The canonical hash of a story card's body — the ONE spelling every handoff records. Computed by
// the script (never by an agent) so two stages can never disagree on it: canary v4 (run 15) ping-ponged
// prepare ↔ verify because two agents hashed the card two ways. `gh` is the transport; PAIR_GH_BIN
// overrides the binary (tests); a failure is reported, never mistaken for a change.
export function cardHash({ story, ghBin = process.env.PAIR_GH_BIN || 'gh' }) {
  if (story === undefined || story === null || String(story).trim() === '') return { error: 'story-missing' }
  const r = spawnSync(ghBin, ['issue', 'view', String(story), '--json', 'body', '-q', '.body'], { encoding: 'utf8', env: cleanGitEnv(process.env) })
  if (r.error || r.status !== 0) return { error: `gh issue view ${story} failed: ${(r.stderr || r.error?.message || '').trim()}` }
  return { acHash: sha256(r.stdout) }
}

// ── scope decisions (US-479 T-22, S5) ──────────────────────────────────────────────────────
// Canonical hash of the CURRENTLY pending scope proposals — the "did the packet the maintainer
// read still match what exists now" check. Sorted, so two spellings of the same set hash alike.
export function scopeBaselineHashOf(scopeChanges) {
  const pending = (scopeChanges ?? [])
    .filter(c => (c?.status ?? 'pending') === 'pending')
    .map(c => ({ id: c.id, proposal: c.proposal }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return sha256(canonical(pending))
}

const DECISION_ALLOWED_KEYS = new Set(['id', 'action', 'rationale', 'targetIssueUrl', 'approvedDelta'])
// One fenced JSON object, schemaVersion 1, decisions[] with no unknown key/action/duplicate id —
// a caller-supplied author string is NEVER trusted here; that check happens in applyScopeDecisions.
export function parseScopeDecisionComment(body) {
  const m = /```json\s*([\s\S]*?)```/.exec(String(body ?? ''))
  if (!m) return { error: 'no-fenced-json' }
  let payload
  try {
    payload = JSON.parse(m[1])
  } catch {
    return { error: 'invalid-json' }
  }
  if (!payload || typeof payload !== 'object') return { error: 'invalid-json' }
  if (payload.schemaVersion !== 1) return { error: `schemaVersion-invalid:${payload.schemaVersion}` }
  if (typeof payload.scopeBaselineHash !== 'string' || !payload.scopeBaselineHash) return { error: 'scopeBaselineHash-missing' }
  if (!Array.isArray(payload.decisions)) return { error: 'decisions-not-an-array' }
  const seenIds = new Set()
  const decisions = []
  for (const raw of payload.decisions) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'decision-not-an-object' }
    for (const k of Object.keys(raw)) if (!DECISION_ALLOWED_KEYS.has(k)) return { error: `unknown-key:${k}` }
    if (typeof raw.id !== 'string' || !raw.id) return { error: 'decision-id-missing' }
    if (!SCOPE_DECISION_ACTIONS.includes(raw.action)) return { error: `unknown-action:${raw.action}` }
    if (seenIds.has(raw.id)) return { error: `duplicate-id:${raw.id}` }
    seenIds.add(raw.id)
    decisions.push(raw)
  }
  return { schemaVersion: 1, scopeBaselineHash: payload.scopeBaselineHash, decisions }
}

const COMMENT_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:pull|issues)\/(\d+)#issuecomment-(\d+)$/
const ISSUE_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)$/

// S5: an existing targetIssueUrl is VERIFIED through `gh` — it must resolve, in the same repo — never
// trusted as text. Returns the read-back canonical url/number, or a typed error; never guesses.
function verifyExistingIssue({ ghBin, repo, targetIssueUrl }) {
  const m = ISSUE_URL_RE.exec(String(targetIssueUrl ?? ''))
  if (!m) return { error: 'targetIssueUrl-invalid' }
  if (`${m[1]}/${m[2]}` !== repo) return { error: 'targetIssueUrl-repo-mismatch' }
  const r = spawnSync(ghBin, ['issue', 'view', targetIssueUrl, '--json', 'number,url'], { encoding: 'utf8', env: cleanGitEnv(process.env) })
  if (r.error || r.status !== 0) return { error: `gh-issue-view-failed:${(r.stderr || r.error?.message || '').trim()}` }
  let data
  try {
    data = JSON.parse(r.stdout)
  } catch {
    return { error: 'gh-issue-view-invalid-json' }
  }
  if (!data?.url || !data?.number) return { error: 'gh-issue-view-incomplete' }
  return { url: data.url, number: data.number }
}

// US-479 remediation (Finding 6, residual — Caso A): the ADOPTED card formats are recognized
// explicitly and CUMULATIVELY, never guessed by a generic Markdown parser. Three dialects are real:
//   1. the colon convention — `AC-1: description`, `- **AC-1**: description` — what a human writes
//      on a card and what this script itself emitted before 4.0.0;
//   2. #479's own checkbox convention `- [ ] **AC-01 — Title.** Description.`, together with the
//      title-less shape this script emits itself, `- [ ] **AC-01.** Description.`;
//   3. the delivery template's (and #482's) numbered Given/When/Then blocks
//      (`N. **Given** … / **When** … / **Then** …`, three lines, user-story-template.md).
// The id token is captured to its FULL word boundary — `AC-10` is never mistaken for a prefix match
// against `AC-1` — and every match keeps its exact PREFIX and position, so a targeted obligation is
// rewritten in place: its bullet, its checkbox state and its human title survive, and no other AC or
// prose around it is disturbed. An id defined more than once is ambiguous whether the duplicates
// share a dialect or straddle two of them: `acById` merges the AC-id dialects deliberately.
const COLON_AC_RE = /^([ \t]*(?:[-*][ \t]*)?(?:\*\*)?(AC-[\w.-]*\w)(?:\*\*)?[ \t]*:[ \t]*)(.*)$/gm
const CHECKBOX_AC_RE = /^((?:-[ \t]*\[[ xX]\][ \t]*)?\*\*(AC-[\w.-]*\w)(?:[ \t]+—[ \t]+[^*\n]*?)?\.\*\*[ \t]*)(.*)$/gm
const GWT_AC_RE = /^(\d+)\.[ \t]+\*\*Given\*\*[ \t]+(.*)\n[ \t]+\*\*When\*\*[ \t]+(.*)\n[ \t]+\*\*Then\*\*[ \t]+(.*)$/gm
function parseAcCard(body) {
  const text = String(body ?? '')
  const acById = new Map()
  let m
  for (const [re, format] of [[COLON_AC_RE, 'colon'], [CHECKBOX_AC_RE, 'checkbox']]) {
    re.lastIndex = 0
    while ((m = re.exec(text))) {
      const entry = { id: m[2], format, prefix: m[1], description: (m[3] ?? '').trim(), start: m.index, end: m.index + m[0].length }
      acById.set(m[2], [...(acById.get(m[2]) ?? []), entry])
    }
  }
  const gwtById = new Map()
  GWT_AC_RE.lastIndex = 0
  while ((m = GWT_AC_RE.exec(text))) {
    const entry = { number: m[1], given: m[2].trim(), when: m[3].trim(), then: m[4].trim(), start: m.index, end: m.index + m[0].length }
    gwtById.set(m[1], [...(gwtById.get(m[1]) ?? []), entry])
  }
  // A genuinely new AC is appended in the shape the card already speaks — checkbox unless every
  // recognized entry is colon. A card with no recognized entry at all never reaches an append
  // (`extendCard` fails closed on `dialect: 'unknown'`); the checkbox default stands for the shape
  // this script emits itself.
  const entries = [...acById.values()].flat()
  const appendFormat = entries.length && entries.every(e => e.format === 'colon') ? 'colon' : 'checkbox'
  return { dialect: acById.size ? 'ac' : gwtById.size ? 'gwt' : 'unknown', acById, gwtById, appendFormat }
}
const renderAcLine = (id, description, format) => (format === 'colon' ? `- **${id}**: ${description}` : `- [ ] **${id}.** ${description}`)
const renderCheckboxLine = (id, description) => renderAcLine(id, description, 'checkbox')
// Whether the card mentions this exact id token at all — matched to its FULL word boundary, so
// `AC-1` is not found inside `AC-10`. Consulted only when NO recognized entry carries the id: a
// mention the adopted dialects could not account for means the obligation is on the card in a shape
// this parser does not support, which is a failed resolution — never proof the AC is new.
const mentionsAcId = (text, id) => new RegExp(`(?<![\\w.-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.-])`).test(String(text ?? ''))
// The approved content for a GWT-identified obligation must ITSELF be in the adopted contract's
// shape (S1's "modifica dell'obbligo identificato secondo il contratto adottato") — never a bare
// string coerced into one of the three fields by guesswork.
function parseGwtText(s) {
  const m = /^\*\*Given\*\*[ \t]+([\s\S]*?)[ \t]*\n?[ \t]*\*\*When\*\*[ \t]+([\s\S]*?)[ \t]*\n?[ \t]*\*\*Then\*\*[ \t]+([\s\S]*)$/.exec(String(s ?? '').trim())
  return m ? { given: m[1].trim(), when: m[2].trim(), then: m[3].trim() } : null
}
const renderGwtBlock = (number, parsed) => `${number}. **Given** ${parsed.given}\n   **When** ${parsed.when}\n   **Then** ${parsed.then}`
// A GWT block has no `AC-` prefix at all (S1) — its only identity is the block's own ordinal. A
// bare digit or an explicit `GWT-<n>` reference both resolve to it; anything else never does.
const gwtKeyOf = id => /^(?:GWT-)?(\d+)$/i.exec(String(id ?? ''))?.[1]

// A single stable id for "the effect new-card authorizes" — the same (decisionRef, scope proposal
// id) pair always maps to the same key, recoverable after a restart with nothing but the run dir.
const newCardKey = (decisionRef, scopeId) => sha256(`${decisionRef} ${scopeId}`).replace(/^sha256:/, '').slice(0, 32)
const newCardMarker = key => `<!-- pair:scope-decision:${key} -->`
const ledgerPath = (dir, key) => join(dir, `.scope-new-card-${key}.json`)
function readLedger(dir, key) {
  const p = ledgerPath(dir, key)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}
function writeLedger(dir, key, data) {
  const p = ledgerPath(dir, key)
  const tmp = join(dir, `.tmp-scope-new-card-${key}-${process.pid}-${Date.now()}.json`)
  writeFileSync(tmp, JSON.stringify(data))
  renameSync(tmp, p)
}
// A local process crash between recording `creating` and learning the `gh issue create` outcome
// leaves the remote result genuinely unknown. Reconciliation searches ONLY by the hidden marker
// this decision's OWN attempt would have embedded — a foreign issue sharing the approved title
// never carries it, so it is never mistaken for this decision's effect.
function reconcileCreatedIssue({ ghBin, repo, key }) {
  const marker = newCardMarker(key)
  const r = spawnSync(ghBin, ['issue', 'list', '--repo', repo, '--search', marker, '--json', 'number,url,title,body'], { encoding: 'utf8', env: cleanGitEnv(process.env) })
  if (r.error || r.status !== 0) return { error: `gh-issue-list-failed:${(r.stderr || r.error?.message || '').trim()}` }
  let rows
  try {
    rows = JSON.parse(r.stdout)
  } catch {
    return { error: 'gh-issue-list-invalid-json' }
  }
  const matches = (Array.isArray(rows) ? rows : []).filter(x => typeof x.body === 'string' && x.body.includes(marker))
  if (matches.length !== 1) return { error: matches.length ? 'new-card-reconciliation-ambiguous' : 'new-card-remote-outcome-uncertain' }
  return { url: matches[0].url, number: matches[0].number, title: matches[0].title }
}

// US-479 remediation (Finding 6, residual — Caso B): the ONE semantic verification every path below
// shares — a fresh create, a ledger `created` reuse, a `creating` reconciliation, or an immediate
// post-failure reconciliation. Confirms destination identity (url/number), the hidden decision
// marker, the exact title, AND the approved AC content itself (id -> description, via the SAME
// exact-id parser `extendCard` uses) — never title alone. Missing/wrong/ambiguous content is an
// explicit error; the caller's ledger is left untouched by this function, so it always stays
// available for a later reconciliation rather than forcing a second create.
function verifyCreatedIssueContent({ ghBin, ref, marker, title, ac }) {
  const v = spawnSync(ghBin, ['issue', 'view', ref, '--json', 'number,url,title,body'], { encoding: 'utf8', env: cleanGitEnv(process.env) })
  if (v.error || v.status !== 0) return { error: `gh-issue-create-readback-failed:${(v.stderr || v.error?.message || '').trim()}` }
  let data
  try {
    data = JSON.parse(v.stdout)
  } catch {
    return { error: 'gh-issue-create-readback-invalid-json' }
  }
  if (!data?.url || !data?.number || data.title !== title) return { error: 'gh-issue-create-readback-mismatch' }
  if (typeof data.body !== 'string' || !data.body.includes(marker)) return { error: 'gh-issue-create-readback-mismatch' }
  const card = parseAcCard(data.body)
  for (const a of ac) {
    const entries = card.acById.get(a.id) ?? []
    if (entries.length !== 1 || entries[0].description !== a.description) return { error: `gh-issue-create-content-mismatch:${a.id}` }
  }
  return { url: data.url, number: data.number }
}

// S5 new-card, no existing targetIssueUrl: explicit authorization to create means an approved
// TITLE (never inferred), plus the AC payload. Creates via `gh issue create` — embedding a hidden,
// decision-specific marker in the body — then reads the created issue back and confirms the title
// AND the approved AC content stuck before trusting the returned backlink. US-479 remediation
// (Finding 6, residual): the create is bound to a durable ledger keyed by (decisionRef, scope id)
// BEFORE the remote call, so a retry after a successful create but a lost/failed response (or a
// failed downstream publish) reconciles onto the SAME issue instead of creating a second one; a
// genuinely uncertain outcome (no local record of success, nothing found on reconciliation) is
// refused explicitly, never guessed.
function createTargetIssue({ ghBin, repo, dir, decisionRef, scopeId, title, ac }) {
  const key = newCardKey(decisionRef, scopeId)
  const marker = newCardMarker(key)
  const existing = readLedger(dir, key)
  if (existing?.status === 'created' && existing.url) {
    return verifyCreatedIssueContent({ ghBin, ref: existing.url, marker, title, ac })
  }
  if (existing?.status === 'creating') {
    const rec = reconcileCreatedIssue({ ghBin, repo, key })
    if (rec.error) return { error: rec.error }
    const v = verifyCreatedIssueContent({ ghBin, ref: rec.url, marker, title, ac })
    if (v.error) return v
    writeLedger(dir, key, { status: 'created', url: v.url, decisionRef, scopeId, title })
    return v
  }
  writeLedger(dir, key, { status: 'creating', decisionRef, scopeId, title })
  const body = `${marker}\n${ac.map(a => renderCheckboxLine(a.id, a.description)).join('\n')}`
  const r = spawnSync(ghBin, ['issue', 'create', '--repo', repo, '--title', title, '--body', body], { encoding: 'utf8', env: cleanGitEnv(process.env) })
  if (r.error || r.status !== 0) {
    // A local failure here does NOT prove the remote call never landed — a lost response looks
    // identical locally to a genuine failure. Reconcile ONCE, immediately, before reporting
    // anything: the ledger stays `creating` either way (never a status that would let a LATER
    // retry create fresh on a guess), so an unresolved outcome is retried by reconciling again,
    // never by blindly calling create a second time.
    const rec = reconcileCreatedIssue({ ghBin, repo, key })
    if (!rec.error) {
      const v = verifyCreatedIssueContent({ ghBin, ref: rec.url, marker, title, ac })
      if (v.error) return v
      writeLedger(dir, key, { status: 'created', url: v.url, decisionRef, scopeId, title })
      return v
    }
    return { error: `gh-issue-create-uncertain:${rec.error}` }
  }
  const url = r.stdout.trim().split('\n').pop()
  if (!ISSUE_URL_RE.test(url)) return { error: 'gh-issue-create-no-url' }
  // The remote effect is now KNOWN to exist — recorded before the local confirming verification, so
  // a lost/failed/mismatched readback never leaves this decision's own retry uncertain about its
  // own creation, and never forces a second create to "fix" a divergent body.
  writeLedger(dir, key, { status: 'created', url, decisionRef, scopeId, title })
  return verifyCreatedIssueContent({ ghBin, ref: url, marker, title, ac })
}

// S5 extend-current-card: the approved AC are written into the CURRENT card and read back before
// the decision is trusted as applied. US-479 remediation (Finding 6, residual): matching is by
// EXACT AC id — never independent substring `includes` of id and description, which let a real
// description already sitting under a DIFFERENT id (e.g. AC-2) be mistaken for AC-1's own approved
// text. A pre-existing AC is replaced in place (its old definition removed, not left dangling
// alongside a new one); a genuinely new id is appended; an id the card carries more than once is
// AMBIGUOUS and refused outright — never guessed which definition to replace. Idempotent: a body
// whose targeted ids already carry exactly their approved description, once each, is not re-edited.
function extendCard({ ghBin, repo, story, ac }) {
  const read = spawnSync(ghBin, ['issue', 'view', String(story), '--repo', repo, '--json', 'body', '-q', '.body'], { encoding: 'utf8', env: cleanGitEnv(process.env) })
  if (read.error || read.status !== 0) return { error: `gh-issue-view-failed:${(read.stderr || read.error?.message || '').trim()}` }
  const currentBody = read.stdout
  const card = parseAcCard(currentBody)
  // FAIL-CLOSED on an unrecognized card (ADL 2026-09-10, developer decision): a card speaking NONE
  // of the adopted dialects is refused outright, before any write — the absence of the requested id
  // from its text is NOT evidence that the card carries no obligations, only that this parser
  // cannot read the ones it has. Refusing costs a maintainer one explicit retry; appending into an
  // unreadable card writes a second, potentially contradictory definition of an obligation that may
  // already be there.
  if (card.dialect === 'unknown') return { error: 'unsupported-card-format' }
  // Resolve every targeted id BEFORE any edit into exactly one of three outcomes: an EXISTING
  // obligation identified exactly (any adopted dialect), a LEGITIMATE addition under the contract
  // the card already speaks, or an UNRESOLVABLE reference — refused before anything is written,
  // never guessed. A parser miss is not proof the AC is new: it is proof this id could not be
  // resolved, so an id the card mentions in a shape none of the adopted dialects covers is refused
  // too, exactly like an id that belongs to a competing convention (the GWT dialect).
  const resolved = []
  for (const a of ac) {
    const hits = card.acById.get(a.id) ?? []
    if (hits.length > 1) return { error: `ambiguous-ac-id:${a.id}` }
    if (hits.length === 1) {
      resolved.push({ a, kind: 'ac-existing', entry: hits[0] })
      continue
    }
    const gwtKey = gwtKeyOf(a.id)
    if (gwtKey) {
      const gw = card.gwtById.get(gwtKey) ?? []
      if (gw.length > 1) return { error: `ambiguous-ac-id:${a.id}` }
      if (gw.length === 1) {
        const parsed = parseGwtText(a.description)
        if (!parsed) return { error: `approvedDelta-shape-mismatch:${a.id}` }
        resolved.push({ a, kind: 'gwt-existing', entry: gw[0], parsed })
        continue
      }
      return { error: `ac-id-unresolvable:${a.id}` }
    }
    if (card.dialect === 'gwt') return { error: `ac-id-unresolvable:${a.id}` }
    if (mentionsAcId(currentBody, a.id)) return { error: `ac-id-unresolvable:${a.id}` }
    resolved.push({ a, kind: 'ac-new' })
  }
  const isSatisfied = r => {
    if (r.kind === 'ac-existing') return r.entry.description === r.a.description
    if (r.kind === 'gwt-existing') return r.entry.given === r.parsed.given && r.entry.when === r.parsed.when && r.entry.then === r.parsed.then
    return false
  }
  const needsWork = resolved.filter(r => !isSatisfied(r))
  if (needsWork.length) {
    const replacements = []
    const toAppend = []
    for (const r of needsWork) {
      if (r.kind === 'ac-existing') replacements.push({ start: r.entry.start, end: r.entry.end, text: r.entry.prefix + r.a.description })
      else if (r.kind === 'gwt-existing') replacements.push({ start: r.entry.start, end: r.entry.end, text: renderGwtBlock(r.entry.number, r.parsed) })
      else toAppend.push(r.a)
    }
    replacements.sort((x, y) => y.start - x.start)
    let nextBody = currentBody
    for (const rep of replacements) nextBody = nextBody.slice(0, rep.start) + rep.text + nextBody.slice(rep.end)
    if (toAppend.length) {
      const marker = '## Scope extension (US-479 S5)'
      const lines = toAppend.map(a => renderAcLine(a.id, a.description, card.appendFormat)).join('\n')
      nextBody = nextBody.includes(marker) ? nextBody.replace(marker, `${marker}\n${lines}`) : `${nextBody}\n\n${marker}\n${lines}\n`
    }
    const edit = spawnSync(ghBin, ['issue', 'edit', String(story), '--repo', repo, '--body', nextBody], { encoding: 'utf8', env: cleanGitEnv(process.env) })
    if (edit.error || edit.status !== 0) return { error: `gh-issue-edit-failed:${(edit.stderr || edit.error?.message || '').trim()}` }
  }
  const readback = spawnSync(ghBin, ['issue', 'view', String(story), '--repo', repo, '--json', 'body', '-q', '.body'], { encoding: 'utf8', env: cleanGitEnv(process.env) })
  if (readback.error || readback.status !== 0) return { error: `gh-issue-view-readback-failed:${(readback.stderr || readback.error?.message || '').trim()}` }
  const written = readback.stdout
  const writtenCard = parseAcCard(written)
  for (const r of resolved) {
    if (r.kind === 'gwt-existing') {
      const gw = writtenCard.gwtById.get(gwtKeyOf(r.a.id)) ?? []
      if (gw.length !== 1 || gw[0].given !== r.parsed.given || gw[0].when !== r.parsed.when || gw[0].then !== r.parsed.then) return { error: `gh-issue-edit-readback-mismatch:${r.a.id}` }
    } else {
      const hits = writtenCard.acById.get(r.a.id) ?? []
      if (hits.length !== 1 || hits[0].description !== r.a.description) return { error: `gh-issue-edit-readback-mismatch:${r.a.id}` }
    }
  }
  return { body: written }
}

// Reads the ACTUAL PR comment through `gh` (never a caller-supplied author string), verifies it is
// a `User` in the authorized maintainer set, applies exact approved payloads mechanically — no
// planner agent — and persists the result as a `recordType: decision` review-phase handoff via the
// ordinary `publish`. Idempotent: a decisionRef already applied is a no-op, not a duplicate write.
export function applyScopeDecisions({ dir, decisionRef, repo, pr, maintainer = 'rucka', ghBin = process.env.PAIR_GH_BIN || 'gh', workflowVersion, lockWaitMs = 5000 }) {
  const handoffs = readHandoffs(dir)
  const reviews = handoffs.filter(h => h.data && h.skill === 'review-phase')
  if (!reviews.length) return { applied: false, reason: 'no-review-evidence' }
  if (reviews.some(r => r.data.decisionRef === decisionRef)) return { applied: true, reason: 'already-applied' }
  const seen = new Map()
  for (const r of reviews) for (const c of r.data.scopeChanges ?? []) if (c?.id) seen.set(c.id, c)
  const pending = [...seen.values()].filter(c => (c.status ?? 'pending') === 'pending')
  if (!pending.length) return { applied: false, reason: 'no-pending-scope-changes' }
  const m = COMMENT_URL_RE.exec(String(decisionRef ?? ''))
  if (!m) return { applied: false, reason: 'decisionRef-invalid' }
  const [, owner, repoName, prNum] = m
  if (`${owner}/${repoName}` !== repo) return { applied: false, reason: 'decisionRef-repo-mismatch' }
  if (Number(prNum) !== Number(pr)) return { applied: false, reason: 'decisionRef-pr-mismatch' }
  const r = spawnSync(ghBin, ['api', `repos/${repo}/issues/comments/${m[4]}`], { encoding: 'utf8', env: cleanGitEnv(process.env) })
  if (r.error || r.status !== 0) return { applied: false, reason: `gh-api-failed:${(r.stderr || r.error?.message || '').trim()}` }
  let comment
  try {
    comment = JSON.parse(r.stdout)
  } catch {
    return { applied: false, reason: 'gh-api-invalid-json' }
  }
  if (comment?.user?.type !== 'User') return { applied: false, reason: 'author-not-a-user' }
  if (comment.user.login !== maintainer) return { applied: false, reason: `author-not-authorized:${comment.user.login}` }
  if (!new RegExp(`/issues/${prNum}$`).test(String(comment.issue_url ?? ''))) return { applied: false, reason: 'decisionRef-pr-mismatch' }
  const parsed = parseScopeDecisionComment(comment.body)
  if (parsed.error) return { applied: false, reason: parsed.error }
  const currentHash = scopeBaselineHashOf(pending)
  if (parsed.scopeBaselineHash !== currentHash) return { applied: false, reason: 'stale-baseline' }
  const byId = new Map(pending.map(c => [c.id, c]))
  const lastReview = reviews[reviews.length - 1]
  const results = []
  for (const dec of parsed.decisions) {
    const target = byId.get(dec.id)
    if (!target) {
      results.push({ id: dec.id, applied: false, reason: 'unknown-id' })
      continue
    }
    if (dec.action === 'ignore') {
      if (!dec.rationale) {
        results.push({ id: dec.id, applied: false, reason: 'rationale-missing' })
        continue
      }
      results.push({ id: dec.id, applied: true, status: 'ignored', rationale: dec.rationale })
    } else if (dec.action === 'new-card') {
      if (dec.targetIssueUrl) {
        const v = verifyExistingIssue({ ghBin, repo, targetIssueUrl: dec.targetIssueUrl })
        if (v.error) {
          results.push({ id: dec.id, applied: false, reason: v.error })
          continue
        }
        results.push({ id: dec.id, applied: true, status: 'deferred', targetIssueUrl: v.url, approvedDelta: dec.approvedDelta })
      } else if (dec.approvedDelta?.title && Array.isArray(dec.approvedDelta.ac) && dec.approvedDelta.ac.length) {
        const created = createTargetIssue({ ghBin, repo, dir, decisionRef, scopeId: dec.id, title: dec.approvedDelta.title, ac: dec.approvedDelta.ac })
        if (created.error) {
          results.push({ id: dec.id, applied: false, reason: created.error })
          continue
        }
        results.push({ id: dec.id, applied: true, status: 'deferred', targetIssueUrl: created.url, approvedDelta: dec.approvedDelta })
      } else {
        results.push({ id: dec.id, applied: false, reason: 'payload-insufficient' })
      }
    } else if (dec.action === 'extend-current-card') {
      if (!dec.approvedDelta || !Array.isArray(dec.approvedDelta.ac) || !dec.approvedDelta.ac.length) {
        results.push({ id: dec.id, applied: false, reason: 'approvedDelta-missing' })
        continue
      }
      const ext = extendCard({ ghBin, repo, story: lastReview.data.story, ac: dec.approvedDelta.ac })
      if (ext.error) {
        results.push({ id: dec.id, applied: false, reason: ext.error })
        continue
      }
      results.push({ id: dec.id, applied: true, status: 'extended', approvedDelta: dec.approvedDelta })
    }
  }
  if (!results.some(x => x.applied)) return { applied: false, reason: 'no-decision-applied', results }
  const updatedScopeChanges = [...seen.values()].map(c => {
    const res = results.find(x => x.id === c.id && x.applied)
    return res ? { ...c, status: res.status, decisionRef, ...(res.rationale ? { decisionRationale: res.rationale } : {}), ...(res.targetIssueUrl ? { targetIssueUrl: res.targetIssueUrl } : {}), ...(res.approvedDelta ? { approvedDelta: res.approvedDelta } : {}) } : c
  })
  const extension = results.find(x => x.applied && x.status === 'extended')
  const draft = {
    run: lastReview.data.run,
    story: lastReview.data.story,
    pr: lastReview.data.pr ?? Number(pr),
    branch: lastReview.data.branch,
    phase: lastReview.phase,
    skill: 'review-phase',
    inputHead: lastReview.data.inputHead,
    recordType: 'decision',
    reviewedHead: lastReview.data.reviewedHead,
    verdict: lastReview.data.verdict,
    custody: lastReview.data.custody,
    readiness: lastReview.data.readiness,
    findings: lastReview.data.findings,
    scopeChanges: updatedScopeChanges,
    decisionRef,
    scopeEpoch: extension ? (lastReview.data.scopeEpoch ?? 1) + 1 : lastReview.data.scopeEpoch,
    ...(extension ? { scopeExtension: extension.approvedDelta } : {}),
  }
  const tmp = join(dir, `.scope-decision-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(tmp, JSON.stringify(draft))
  const attempt = handoffs.filter(h => h.phase === lastReview.phase && h.skill === 'review-phase').length + 1
  const out = publish({ dir, file: tmp, phase: lastReview.phase, skill: 'review-phase', workflowVersion: workflowVersion ?? lastReview.data.workflowVersion, attempt, predecessor: lastReview.name, lockWaitMs, ghBin })
  return { applied: !!out.published, reason: out.published ? undefined : out.reason, results, path: out.path }
}

export function publish({ dir, file, phase, skill, workflowVersion, predecessor, attempt, pr, lockWaitMs = 5000, ghBin }) {
  let data
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return { published: false, reason: 'not-json', file }
  }
  const errs = envelopeErrors(data, { phase, skill })
  if (errs.length) return { published: false, reason: errs[0], errors: errs }
  if (!compatible(workflowVersion, workflowVersion)) return { published: false, reason: 'workflowVersion-invalid' }
  // US-479 T-20 (S3 step 4): a repair verifies every prior gap FIRST — a red-spec handoff that
  // follows a red-verify rejection naming rowId/mechanismId gaps must list every one of them under
  // `changedRows`, or it is refused BEFORE the write (never accepted and reconciled later, canary
  // run 3: two named rewriters, one repaired, the other silently dropped to the next rejection).
  if (skill === 'red-spec' && predecessor && /-red-verify$/.test(predecessor)) {
    const predFile = join(dir, `${predecessor}.json`)
    if (existsSync(predFile)) {
      let predData
      try {
        predData = JSON.parse(readFileSync(predFile, 'utf8'))
      } catch {
        predData = null
      }
      if (predData && predData.verified === false) {
        const priorIds = (predData.findings ?? []).map(f => f?.rowId ?? f?.mechanismId).filter(Boolean)
        const covered = new Set(data.changedRows ?? [])
        const missing = priorIds.filter(id => !covered.has(id))
        if (missing.length) return { published: false, reason: `repair-incomplete:${missing.join(',')}` }
      }
    }
  }
  // US-479 B1 (S3): the contradiction's budget key is derived HERE from the verified sealed
  // identity of the contract it names — never from a value the agent spelled.
  if (skill === 'red-spec' && data.status === 'contradiction') {
    const target = resolveSealedContract({ handoffs: readHandoffs(dir), predecessors: predecessorEvidence(dir), contractHash: data.predecessorContractHash })
    const line = successionLineOf(target?.phase)
    data = { ...data, contradictionLine: line ?? null, contradictionKey: contradictionKeyOf({ line, conflictingRowIds: data.conflictingRowIds }) }
  }
  // US-479 T-29 (S11): the risk identity is derived HERE, and the claim is checked against what
  // this run actually did — the named batch must exist and the failing head must be one it produced.
  // US-479 S12/AC-30: ONE authority decides every regression-risk transition, reading the persisted
  // ledger and history. The riskId is derived here; nothing is written when a transition is illegal.
  if (skill === 'review-phase' && Array.isArray(data.findings) && data.findings.some(f => f?.regressionRisk)) {
    const existing = readHandoffs(dir)
    const transitionErrs = regressionTransitionErrors({ handoffs: existing, data, pr })
    if (transitionErrs.length) return { published: false, reason: transitionErrs[0], errors: transitionErrs }
    data = {
      ...data,
      findings: data.findings.map(f => (f?.regressionRisk ? { ...f, regressionRisk: { ...f.regressionRisk, riskId: riskIdOf({ story: data.story, pr: data.pr ?? pr, findingId: f.id, batchId: f.regressionRisk.introducedByRemediationBatchId }) } } : f)),
    }
  }
  if (pr !== undefined) {
    if (!Number.isInteger(pr) || pr <= 0) return { published: false, reason: 'pr-invalid', pr }
    if (data.pr !== undefined && data.pr !== null && Number(data.pr) !== pr) return { published: false, reason: 'pr-mismatch', stated: data.pr, pr }
    const prior = existsSync(dir) ? readHandoffs(dir).map(h => h.data?.pr).find(x => Number.isInteger(x) && x > 0) : undefined
    if (prior !== undefined && prior !== pr) return { published: false, reason: 'pr-mismatch', stated: prior, pr, source: 'earlier-handoff' }
    data = { ...data, pr }
  }
  // An agent that recorded an acHash meant the card: the script stamps the canonical value in its
  // place and marks the source, so `resolve` compares only script-stamped hashes.
  if (data.acHash !== undefined && data.acHash !== null) {
    const h = cardHash({ story: data.story, ghBin })
    if (h.acHash) data = { ...data, acHash: h.acHash, acHashSource: 'publish' }
    else {
      const { acHashSource, ...rest } = data
      data = { ...rest, acHashUnverified: String(data.acHash) }
      delete data.acHash
    }
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

// ── regression-risk ledger view (US-479 T-29, S11) ─────────────────────────────────────────
// The ACTIVE matrix, derived: every risk the ledger has ever carried, reduced to its latest state
// in publication order, keeping only those still `active`. A discharged risk leaves this view and
// stays in the append-only history; a reintroduction of the same finding by the same batch reuses
// its id and comes back here, which is why a reopen is never a new discovery.
export function regressionRiskLedger(handoffs) {
  const byId = new Map()
  for (const h of (handoffs ?? []).filter(x => x.data && x.skill === 'review-phase'))
    for (const f of h.data.findings ?? []) {
      const rr = f?.regressionRisk
      if (!rr?.riskId) continue
      // The obligation the risk cites travels WITH it: it is immutable evidence, not decoration.
      byId.set(rr.riskId, { ...rr, findingId: f.id, obligationIds: f.obligationIds, transition: f.transition, reviewName: h.name, reviewedHead: h.data.reviewedHead })
    }
  return [...byId.values()].sort((a, b) => (a.riskId < b.riskId ? -1 : a.riskId > b.riskId ? 1 : 0))
}
export const activeRegressionRisks = handoffs => regressionRiskLedger(handoffs).filter(r => r.state === 'active')

// ── the ONE regression-risk transition authority (US-479 S12/AC-30) ────────────────────────
// Every create, re-observation and discharge of a risk goes through this function, and it reads the
// PERSISTED ledger and history — never the caller's own claims about them. "Latest entry wins" is
// not a validation: a payload may be perfectly schema-valid and still describe a transition that
// never had a predecessor, mutate the evidence it claims to discharge, or disagree with the clean
// review and GREEN heads this run actually recorded.
//
// What a BATCH produced is its green-fix/implement output heads — a `reviewedHead` is what someone
// looked at, never what a remediation built.
// US-479 DR4-01: the batch attribution shared by `batchLineage` and `rollbackSpent`.
// `remediationBatchId` is optional on a handoff, so both fall back to the round the phase itself
// names; `rollbackSpent` did not, which let an omitted field resurrect a directive already spent.
// Two other readers are deliberately NOT routed through this (DR5-03 corrected the claim that they
// were): `batchObligations` keeps the identical expression inline, and `knownBatch` answers a
// different question — it accepts a groupId PREFIXED by the batch, which this must not do.
const batchOf = h => h.data?.remediationBatchId ?? (phaseParts(h.phase)?.round ? `r${phaseParts(h.phase).round}` : undefined)
function batchLineage(list) {
  const byBatch = new Map()
  for (const h of list) {
    if (h.skill !== 'green-fix' && h.skill !== 'implement-phase') continue
    const parts = phaseParts(h.phase)
    const batch = batchOf(h)
    if (!batch || !SHA_RE.test(String(h.data.outputHead ?? ''))) continue
    const entry = byBatch.get(batch) ?? { heads: new Set(), byHead: new Map() }
    entry.heads.add(String(h.data.outputHead))
    const groups = entry.byHead.get(String(h.data.outputHead)) ?? new Set()
    groups.add(parts?.groupId ?? h.phase)
    entry.byHead.set(String(h.data.outputHead), groups)
    byBatch.set(batch, entry)
  }
  return byBatch
}
// The obligations a batch was created to close: the ids its own preparation received.
function batchObligations(list, batch) {
  const ids = new Set()
  for (const h of list) {
    if (h.skill !== 'red-spec') continue
    const parts = phaseParts(h.phase)
    const its = h.data.remediationBatchId ?? (parts?.round ? `r${parts.round}` : undefined)
    if (its !== batch || h.data.regressionRepairOf) continue
    for (const g of h.data.plan?.groups ?? []) if (g.groupId && phaseParts(g.groupId)?.groupId?.startsWith(`${batch}-`)) for (const id of g.findings ?? []) ids.add(id)
    for (const id of h.data.findings?.received ?? []) ids.add(id)
  }
  return [...ids]
}
// A matching regression repair: the same batch prepared again as a repair, and a GREEN that
// actually fixed, whose output head is the head the discharging review read.
function matchingRepairFor(list, batch, head) {
  const repaired = list.filter(h => h.skill === 'red-spec' && h.data.regressionRepairOf === batch).map(h => h.phase)
  if (!repaired.length) return null
  return list.find(h => h.skill === 'green-fix' && repaired.includes(h.phase) && h.data.fixed === true && String(h.data.outputHead) === String(head)) ?? null
}
const sameEvidence = (a, b) => canonical(a ?? null) === canonical(b ?? null)

export function regressionTransitionErrors({ handoffs, data, pr }) {
  const errs = []
  const list = (handoffs ?? []).filter(h => h.data)
  const ledger = new Map(regressionRiskLedger(list).map(r => [r.riskId, r]))
  const lineage = batchLineage(list)
  const reviews = list.filter(h => h.skill === 'review-phase' && (h.data.recordType ?? 'judgment') === 'judgment')
  for (const f of data.findings ?? []) {
    const rr = f?.regressionRisk
    if (!rr) continue
    const batch = String(rr.introducedByRemediationBatchId ?? '')
    const riskId = riskIdOf({ story: data.story, pr: data.pr ?? pr, findingId: f.id, batchId: batch })
    const prior = ledger.get(riskId)
    const bad = (kind, detail) => errs.push(`regression-risk-transition-invalid:${riskId}:${kind}${detail ? `:${detail}` : ''}`)
    const unqualified = (kind, detail) => errs.push(`regression-qualification-invalid:${f.id}:${kind}${detail ? `:${detail}` : ''}`)
    // ONE transition, not three independent state machines: the risk state, the finding transition
    // and the derived blocking flag must describe the same thing.
    if (rr.state === 'active' && f.transition !== undefined && f.transition !== 'open') bad('finding-transition-incoherent', `${f.transition}`)
    // US-479 DR-10: the mirror of the discharged case below — an ACTIVE risk is by definition an open
    // blocker, so a non-blocking finding carrying one is the same incoherent triple, not a lesser one.
    if (rr.state === 'active' && f.blocking !== true) bad('finding-transition-incoherent', 'not-blocking')
    if (rr.state === 'discharged' && !['resolved', 'superseded'].includes(String(f.transition))) bad('finding-transition-incoherent', `${f.transition}`)
    if (rr.state === 'discharged' && f.blocking === true) bad('finding-transition-incoherent', 'blocking')
    if (rr.state === 'active') {
      // ── F-RR-02: the claim is cross-bound to authoritative history, never trusted for shape ──
      const heads = lineage.get(batch)
      if (!heads) unqualified('regression-batch-unknown', batch)
      else if (!heads.heads.has(String(rr.firstFailingHead))) unqualified('firstFailingHead-not-from-batch', batch)
      // US-479 V1 (F-RR-02): `firstFailingHead` is where the regression FIRST appeared. Only the
      // FIRST observation has to name the head it is reviewing; a re-observation on a later head
      // must keep that original head, and validating it as the current one forced every
      // re-observation to rewrite the origin evidence — so a later discharge would have certified
      // as "first failing" a head that never was.
      // US-479 AC-31 (S13): a prior entry in ANY state means this is not a first observation. A
      // discharged batch produces no further head, so a defect seen afterwards was produced by a
      // LATER batch — a different `riskId`, the ordinary `none -> active` path. Reopening an
      // EXISTING id therefore means one thing only: a discharge that should not have been granted.
      // That is a RESTORATION of the prior entry, so every field of it is immutable.
      const reObservation = !!prior
      if (!reObservation && data.reviewedHead !== undefined && String(rr.firstFailingHead) !== String(data.reviewedHead)) unqualified('failing-head-not-current-review')
      // The baseline must be a head this run REVIEWED, and the obligation the risk cites must not
      // have been open there — otherwise "it used to pass" is the reviewer's word, not evidence.
      const baseline = reviews.filter(h => String(h.data.reviewedHead) === String(rr.lastCleanReviewedHead))
      if (!baseline.length) unqualified('baseline-not-reviewed-clean')
      else if (baseline.some(h => (h.data.findings ?? []).some(x => isBlocking(x) && (x.obligationIds ?? []).some(o => (f.obligationIds ?? []).includes(o))))) unqualified('baseline-not-reviewed-clean', 'obligation-open-at-baseline')
      const oe = f.originEvidence
      if (oe && (String(oe.baselineHead ?? '') !== String(rr.lastCleanReviewedHead) || String(oe.failingHead ?? '') !== String(rr.firstFailingHead) || (oe.reproducer !== undefined && String(oe.reproducer) !== String(rr.reproducerRef)))) unqualified('origin-evidence-mismatch')
      // US-479 DR-10: a FIRST observation must name the batch it invalidates — otherwise the ledger
      // carries an active risk whose batch no counter ever marks as an attempted remediation. A
      // re-observation or a reopening does not repeat it: that batch was named when the risk was raised.
      if (data.invalidatedBatchId === undefined && !prior) unqualified('invalidated-batch-missing', batch)
      if (data.invalidatedBatchId !== undefined && String(data.invalidatedBatchId) !== batch) unqualified('invalidated-batch-mismatch', `${data.invalidatedBatchId}!=${batch}`)
      if (reObservation) {
        for (const [field, value] of [['reproducerRef', rr.reproducerRef], ['closureAssertions', rr.closureAssertions], ['affectedBoundaryRefs', rr.affectedBoundaryRefs], ['lastCleanReviewedHead', rr.lastCleanReviewedHead], ['firstFailingHead', rr.firstFailingHead]])
          if (!sameEvidence(prior[field], value)) bad('immutable-field-mismatch', field)
        if (!sameEvidence(prior.obligationIds, f.obligationIds)) bad('immutable-field-mismatch', 'obligationIds')
      }
      continue
    }
    // ── F-RR-01: a discharge is a transition FROM a persisted active entry, with its own repair ──
    if (!prior || prior.state !== 'active') {
      bad('missing-active-predecessor')
      continue
    }
    for (const [field, value] of [
      ['reproducerRef', rr.reproducerRef],
      ['closureAssertions', rr.closureAssertions],
      ['affectedBoundaryRefs', rr.affectedBoundaryRefs],
      ['introducedByRemediationBatchId', rr.introducedByRemediationBatchId],
      ['lastCleanReviewedHead', rr.lastCleanReviewedHead],
      ['firstFailingHead', rr.firstFailingHead],
    ])
      if (!sameEvidence(prior[field], value)) bad('immutable-field-mismatch', field)
    if (!sameEvidence(prior.obligationIds, f.obligationIds)) bad('immutable-field-mismatch', 'obligationIds')
    const repair = matchingRepairFor(list, batch, data.reviewedHead)
    if (!repair) bad('missing-matching-repair', batch)
    else if (String(rr.dischargedHead) !== String(repair.data.outputHead)) errs.push(`discharge-head-mismatch:${f.id}`)
    // The batch's ORIGINAL obligations must be carried in this very review and confirmed closed.
    for (const id of batchObligations(list, batch)) {
      const carried = (data.findings ?? []).find(x => x.id === id)
      if (!carried || isBlocking(carried) || !['resolved', 'superseded'].includes(String(carried.transition))) bad('original-finding-not-closed', id)
    }
  }
  return errs
}

// ── rollback notes (ADL 2026-09-12) ────────────────────────────────────────────────────────
// A VIEW, not a store — like `activeRegressionRisks`. It is ACTIVE while any obligation is still
// open or any regression is still live, and empty once they are not. So "the implementation made
// progress — it closed findings without adding regressions" is not a condition anyone codes: a
// finding that closes leaves the obligations, a new regression enters the ledger and keeps the view
// populated. Nobody deletes these notes, and an empty view emits no reconstruction directive, which
// is also what stops one from re-firing.
export function rollbackNotes(handoffs, precomputedLedger) {
  const list = (handoffs ?? []).filter(h => h.data && h.data.recordType !== 'migration')
  const reviews = list.filter(h => h.skill === 'review-phase')
  const byId = new Map()
  for (const h of reviews) for (const f of h.data.findings ?? []) if (f?.id) byId.set(f.id, f)
  const obligations = [...byId.values()].map(f => ({ id: f.id, severity: f.severity, open: isBlocking(f) }))
  const regressions = (precomputedLedger ?? regressionRiskLedger(list)).filter(r => r.state === 'active')
  // US-479 m-4: `worked` ids are stable across rounds — the ADL and review-phase both say so — so a
  // later review restating an id is REVISING it, not adding a second claim. Deduped last-wins over
  // the same publication order the obligations above already use: otherwise a claim a later review
  // revoked reached the rebuild alongside its replacement, presented as verified-correct, which is
  // the failure `worked` exists to prevent.
  const workedById = new Map()
  for (const h of reviews) for (const w of h.data.worked ?? []) if (w?.id) workedById.set(w.id, { ...w, source: h.name })
  const worked = [...workedById.values()]
  return { active: obligations.some(o => o.open) || regressions.length > 0, obligations, regressions, worked }
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
// Preparation refusals whose cause lies outside the cycle: a later dispatch can succeed unchanged.
const EXTERNAL_REFUSALS = new Set(['dirty', 'stale'])

function deriveNextStep(handoffs, policy, ctx = {}) {
  // US-479 B2: a migration acknowledgment is evidence about provenance, never a cycle position.
  const list = handoffs.filter(h => h.data && h.data.recordType !== 'migration')
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
  // US-479 T-27 (DT-05): the batch plan belongs to the ROUND, not to `-g1`. It is published by the
  // first group actually prepared, and that is not `-g1` whenever `-g1` depends on a sibling. Looking
  // only at `r<n>-g1` lost the plan entirely in that case: `nextGroup` became undefined and the cycle
  // skipped every remaining group straight to the review, while `groupOf` handed the dispatch no
  // scope or ownership at all. Same hard-coded `-g1` assumption F-RR-05 removed from the rewind.
  const planFor = round => list.find(h => h.skill === 'red-spec' && phaseParts(h.phase)?.groupId?.startsWith(`r${round}-g`) === true && h.data.plan)?.data.plan
  const groupOf = phase => {
    const p = phaseParts(phase)
    const plan = p?.groupId ? planFor(p.round) : undefined
    return plan?.groups?.find(g => g.groupId === p.groupId)
  }
  // Every finding the cycle has ever seen, by id — the rewind carries the real entries, not copies.
  // One derived view per resolution, shared by every reader (US-479 F-RR-06).
  const activeRisksOf = () => (ctx.ledger ? ctx.ledger.filter(r => r.state === 'active') : activeRegressionRisks(list))
  const findingsById = () => {
    const m = new Map()
    for (const h of list.filter(x => x.skill === 'review-phase')) for (const f of h.data.findings ?? []) if (f?.id) m.set(f.id, f)
    return m
  }
  // Every finding id the cycle has ever seen, with its latest severity — the coordinator seeds its
  // identity checks from this on a resume (its own memory is per-run).
  const priorFindings = () => {
    const seen = new Map()
    for (const r of reviews) for (const f of r.data.findings ?? []) if (f?.id) seen.set(f.id, { id: f.id, severity: f.severity })
    return [...seen.values()]
  }
  // Every scope proposal the cycle has ever seen, latest status wins — a `recordType: decision`
  // handoff (applyScopeDecisions) is a review-phase record too, so its updated status is the one
  // seen on resume (US-479 T-22, S5).
  const scopeChangesSeen = () => {
    const seen = new Map()
    for (const r of reviews) for (const c of r.data.scopeChanges ?? []) if (c?.id) seen.set(c.id, c)
    return [...seen.values()]
  }
  const pendingScopeChanges = () => scopeChangesSeen().filter(c => (c.status ?? 'pending') === 'pending')
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
    // US-479 B1 (S3, AC-08, DT-04): a CONTRADICTION with sealed rows is not a dead end — it routes
    // the minimal successor revision of the contract it names, in the same canonical cycle. The
    // target is resolved from the VERIFIED sealed identity of `predecessorContractHash`, never
    // assumed to be the current group's own contract; the predecessor seal and every row the
    // contradiction does not name stay exactly as they are (the sealer enforces that separately).
    if (d.status === 'contradiction') {
      // US-479 F1: the target is resolved in the current cycle FIRST and then among the proven
      // identities of the runs this cycle was bound to — so a seal that lives in the legacy run the
      // acknowledgment named is usable, while an unsealed or digest-changed one still is not.
      const target = resolveSealedContract({ handoffs: list, predecessors: ctx.predecessors ?? [], contractHash: d.predecessorContractHash })
      const targetPhase = target?.phase
      const line = successionLineOf(targetPhase)
      if (!targetPhase || !line || !d.contradictionKey) {
        // Three different causes, never collapsed into one message: the discrepancy that made a
        // predecessor unsearchable, a hash nothing ever sealed, or a handoff published before this
        // engine stamped the key — the last is history, like every pre-3.0.12 acHash, and the cycle
        // answers again under the current engine rather than having its key back-filled here.
        const detail = target?.error
          ? target.error
          : !targetPhase || !line
            ? `no sealed contract identifies ${d.predecessorContractHash ?? 'the named predecessor'}`
            : 'contradiction-key-unstamped: this handoff predates the key `publish` now stamps — re-answer the same phase under this engine'
        return blocked('failed-preparation', { refusal: 'contradiction-unresolvable', detail, phase: last.phase, findings: d.findings?.received ? findingsByIds(d.findings.received) : undefined })
      }
      // ONE revision per contradiction per obligation and succession line (US-479 B1 decision 2).
      // Counted over this cycle AND every sibling run of the same PR, so a new runId cannot buy a
      // second attempt; an equivalent contradiction after it is a human escalation, not autotuning.
      const priorSame = list.filter(h => h !== last && h.skill === 'red-spec' && h.data.status === 'contradiction' && h.data.contradictionKey === d.contradictionKey).length
      const siblingSame = (ctx.siblingContradictionKeys ?? []).filter(k => k === d.contradictionKey).length
      if (priorSame + siblingSame >= 1)
        return blocked('escalate', { budget: 'contradictionRevisions', detail: `the same contractual obligation on line ${line} already spent its one successor revision — a human decides the next step`, phase: last.phase, conflictingRowIds: d.conflictingRowIds, findings: d.findings?.received ? findingsByIds(d.findings.received) : undefined })
      // The successor continues the HISTORICAL line: the revision number counts the phases of that
      // line wherever they were proven, so a legacy `a0-rev3` is followed by `a0-rev4` and never by
      // a fresh `a0-rev2` that would pretend the history did not happen.
      const lineOf = hs => hs.filter(h => h.phase === line || h.phase.startsWith(`${line}-rev`))
      const lineRevision = [...lineOf(list), ...(target.origin === 'predecessor' ? lineOf(target.handoffs ?? []) : [])].reduce((m, h) => Math.max(m, phaseParts(h.phase)?.revision ?? 1), 1)
      const targetParts = phaseParts(targetPhase) ?? {}
      // The descriptor comes from the two proofs `resolveSealedContract` already validated together
      // — never re-searched, so the route cannot disagree with the identity check.
      const resolvedContract = { path: target.spec.data.contractPath, hash: target.spec.data.contractHash, revision: targetParts.revision ?? 1, snapshot: target.sealed.data.snapshot }
      return {
        step: 'prepare',
        mode: 'revision',
        phase: `${line}-rev${lineRevision + 1}`,
        revision: lineRevision + 1,
        round: targetParts.round ?? 0,
        attempt: 1,
        base: d.inputHead,
        contract: resolvedContract,
        group: groupOf(line),
        ...(target.origin === 'predecessor' ? { predecessorRunId: target.runId, predecessorPhase: targetPhase } : {}),
        // What the legacy evidence never carried is RE-DERIVED, never inherited (S10).
        ...(target.missingDimensions?.length ? { revalidate: target.missingDimensions } : {}),
        changedRows: d.changedRows,
        // The remediation that raised it is remembered so the route back is explicit, never lost.
        contradictionFor: { phase: last.phase, findings: d.findings?.received ?? [] },
        findings: d.findings?.received ? findingsByIds(d.findings.received) : undefined,
        detail: `revision of ${targetPhase}: ${(d.conflictingRowIds ?? []).join(', ')} contradict the obligation raised by ${last.phase}`,
      }
    }
    // US-479 F-RR-03: the INDEPENDENT verifier receives the same derived guard set the resolver
    // holds — it cannot check a contract against authority it was never given.
    if (d.status === 'red') return { step: 'validate', mode: d.mode, phase: last.phase, round: parts.round, attempt: last.attempt, base: d.inputHead, contract: contractOf(last.phase), group: groupOf(last.phase), findings: d.findings?.received ? findingsByIds(d.findings.received) : undefined }
    // A refusal whose cause is OUTSIDE the cycle — a dirty worktree, a moved head — is retryable
    // once a human clears it: the same phase, the next attempt. A refusal the cycle owns
    // (`unprovable`, `split-required`) is terminal at once; a second identical external refusal too
    // (canary v4 run 17: a cleared `dirty` had no resume path and the cycle stayed blocked).
    if (EXTERNAL_REFUSALS.has(d.status) && byPhase('red-spec', last.phase).length <= 1)
      return { step: 'prepare', mode: d.mode ?? (parts.kind === 'initial' ? 'initial' : 'remediation'), phase: last.phase, round: parts.round, attempt: byPhase('red-spec', last.phase).length + 1, base: d.inputHead, contract: contractOf(last.phase), group: groupOf(last.phase), findings: d.findings?.received ? findingsByIds(d.findings.received) : undefined, detail: `retry after the ${d.status} refusal: ${d.reason ?? ''}`.trim() }
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
    // The GREEN attempt follows what this phase has already seen: a batch prepared again after a
    // regression rewind (US-479 T-29) fixes forward as attempt n+1, never over its own handoff.
    return { step: 'green', mode: parts.revision > 1 ? 'revision' : 'remediation', phase: last.phase, round: parts.round, attempt: byPhase('green-fix', last.phase).length + 1, base: d.inputHead, contract: contractOf(last.phase), group: groupOf(last.phase), findings: findingsByIds(groupOf(last.phase)?.findings) }
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
    // A GREEN that follows a REGRESSION REWIND of this batch (US-479 T-29) produced a new head:
    // its verification is the next review round, never a second reviewer of the round already
    // judged at the old head. An ordinary approved-test retry keeps the round's own re-review.
    const repaired = list.some(h => h.skill === 'red-spec' && h.phase === last.phase && h.data.regressionRepairOf)
    const reviewRound = repaired ? parts.round + 1 : parts.round
    // US-479 V2 (F-RR-03): the review is the participant that DISCHARGES, so it receives the same
    // derived guard set red-spec, red-verify and green-fix received — attached for every branch by
    // `deriveNext` (R1), never left to the reviewer to infer.
    return { step: 'verify', mode: 're-review', phase: `r${reviewRound}`, round: reviewRound, attempt: byPhase('review-phase', `r${reviewRound}`).length + 1, base: prior?.data.reviewedHead, prior: prior?.name, openIds: (prior?.data.findings ?? []).filter(isBlocking).map(f => f.id), priorFindings: priorFindings() }
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
    // US-479 T-29 (S11) — the LOGICAL rewind. A regression this review proved was introduced by a
    // remediation sends the cycle back to THAT batch's preparation: same run, same cycle, same
    // branch and head, one complete corrective contract carrying every original unresolved finding
    // and every active guard. `lastCleanReviewedHead` is only the behavioural baseline; no Git
    // revert, reset, rebase or seal deletion is part of this, and a new run cannot erase it.
    const activeRisks = activeRisksOf()
    // US-479 F-RR-04: a mandatory human decision — a history rewrite, a missing authority, a safety
    // question — is answered by a human BEFORE any automatic transition. An active regression risk
    // must never hide or consume that request, so this precedes the rewind. (A plain scope proposal
    // is NOT such a request: it stays behind the closure of every quality risk.)
    // US-479 DR-06: ANY mandatory human decision comes before the automatic rewind. Keying on one
    // `humanDecisionKind` let a review that asked for a human without naming a kind be overridden by
    // the very transition the request was meant to hold. The kind, when given, only says WHY.
    if (d.needsHumanDecision === true) return blocked('escalate', { detail: `${d.humanDecisionKind ?? 'human'} decision requested by the review — a human decides before any automatic rewind`, findings: blocking, regressionRisks: activeRisks })
    if (activeRisks.length) {
      if (cycleCounters(list).spentCycles >= (policy.maxFixRounds ?? 3)) return blocked('escalate', { budget: 'maxFixRounds', detail: 'an active regression risk remains and the remediation budget is spent', findings: blocking, regressionRisks: activeRisks })
      // US-479 DR4-01: spending is keyed on the DECISION, never on the batch. The first attempt asked
      // only whether this batch had ever been repaired — true, in the ordinary flow, long before the
      // maintainer names anything — so a first-ever directive was silently discarded, which is worse
      // than the re-firing it replaced: an explicit human instruction vanished without a trace.
      // A directive is spent when the corrective preparation that RECEIVED this exact head echoed it
      // (`reconstructedFrom`, validated as a sha at publish and demanded by the coordinator) and a
      // later `green-fix` of the same batch produced a head from it. A head nobody was handed is
      // therefore never spent, and a DIFFERENT head is a different decision — always owed.
      // US-479 DR5-01: "produced a head FROM IT" is an identity, not an ordering. The second attempt
      // asked only whether SOME later green-fix of the batch reported `fixed`, so a repair the
      // directive was handed to could fail, an ordinary repair could succeed afterwards, and the
      // decision was consumed by work that never restored anything — DR4-01's harm again, one
      // staging further on. The spending fix must be the one dispatched FROM the echoing
      // preparation: same phase, same attempt. That pair is what the coordinator dispatches as one
      // unit (`$phase` + `$attempt`), so nothing downstream has to be trusted to report it.
      const rollbackSpent = (batchId, head) =>
        list.some(e => {
          if (e.skill !== 'red-spec' || batchOf(e) !== batchId || String(e.data.reconstructedFrom ?? '') !== head || e.phase !== phase) return false
          return list.some(g => g.skill === 'green-fix' && g.data.fixed === true && g.phase === e.phase && g.attempt === e.attempt)
        })
      // The earliest introducing batch is repaired first; every active risk travels with it.
      const roundOf = b => phaseParts(`${b}-g1`)?.round ?? 0
      const batch = [...new Set(activeRisks.map(r => String(r.introducedByRemediationBatchId)))].sort((a, b) => roundOf(a) - roundOf(b))[0]
      // US-479 F-RR-05: the group to repair is the one that actually PRODUCED the failing head —
      // derived from persisted history, never assumed to be `-g1`. Ambiguous provenance is a typed
      // refusal: guessing the owner and the allowed paths would hand the fix the wrong scope.
      const failingHeads = new Set(activeRisks.filter(r => String(r.introducedByRemediationBatchId) === batch).map(r => String(r.firstFailingHead)))
      const producers = new Set()
      for (const h of list)
        // US-479 V3: no marker filter here — a repair's own GREEN is exactly the producer when the
        // repair is what introduced the next regression. Provenance is the head, never the label.
        if ((h.skill === 'green-fix' || h.skill === 'implement-phase') && failingHeads.has(String(h.data.outputHead ?? ''))) {
          const gid = phaseParts(h.phase)?.groupId
          if (gid && gid.startsWith(`${batch}-`)) producers.add(gid)
        }
      if (producers.size !== 1)
        return blocked('escalate', { refusal: 'regression-lineage-ambiguous', detail: `regression lineage: ${producers.size} group(s) of ${batch} produced ${[...failingHeads].join(', ')} — the producing group must be unique before a repair can be scoped`, findings: blocking, regressionRisks: activeRisks })
      const phase = [...producers][0]
      // US-479 AC-32 (S13), simplified after three review rounds: the workflow no longer DECIDES
      // whether restoring content is safe, nor where to restore it from. Establishing that — who
      // wrote these paths after which head, across revisions, directories, sibling groups and
      // migrated ledgers — produced four defects in three rounds, and getting it wrong deletes real
      // work. The default is what always existed: fix forward on the current head.
      //
      // A human may instead name the HEAD to roll back to (`policy.rollbackTo`, 40-hex) — ordinarily
      // after the budget escalated and they read the notes. A head is taken as given: there is no
      // resolution step, so nothing is guessed. Naming a ROUND used to be the input, and resolving
      // it matched a non-revision name against its own revisions and kept the last, so `a0` could
      // resolve to `a0-rev2`'s head — a head nobody named, restored over real work (ADL 2026-09-12).
      // Validation is existence: this cycle recorded that sha, or the directive is refused out loud.
      const ofBatch = activeRisks.filter(x => String(x.introducedByRemediationBatchId) === batch)
      const paths = groupOf(phase)?.allowedPaths ?? []
      const notes = rollbackNotes(list, ctx.ledger)
      let reconstruct
      let rollbackRefusal
      let rollbackNote
      if (policy.rollbackTo) {
        const want = String(policy.rollbackTo)
        const known = list.some(h => [h.data.outputHead, h.data.reviewedHead].some(x => String(x ?? '') === want))
        if (!SHA_RE.test(want)) rollbackRefusal = `rollback-head-invalid:${want}`
        else if (!known) rollbackRefusal = `rollback-head-unknown:${want}`
        else if (!paths.length) rollbackRefusal = `rollback-scope-unknown:${phase}`
        // US-479 DR3-04 (M-1): a decision is honoured ONCE. The previous guard asked `notes.active`,
        // which is true by construction everywhere this branch runs — it sits inside
        // `if (activeRisks.length)`, and the view's own `regressions` is that same set — so it could
        // never fire and the identical directive was re-emitted at every later rewind, restoring
        // `paths` at `fromHead` over the rebuild the previous rollback had just produced. Progress
        // could not accumulate: the cycle churned until the budget escalated.
        // The directive is SPENT when it was delivered AND the repair it was delivered to produced a
        // new head: a corrective preparation of this batch carried it, and a later `green-fix` of the
        // same batch reported `fixed`. A repair that produced nothing consumed nothing, so the
        // decision is still owed. Derived from the handoffs in publication order, like every other
        // view — nobody writes a consumption flag and nobody deletes one.
        // US-479 DR5-Q1: spending is stated, never silent. Three rounds of this defect all looked the
        // same from the maintainer's seat — a head typed into nothing — so an honoured decision says
        // so. It is NOT a refusal: the directive was carried out, and the cycle proceeds.
        else if (rollbackSpent(batch, want)) rollbackNote = `rollback-already-honoured:${want}`
        else reconstruct = { fromHead: want, paths, riskIds: ofBatch.map(x => x.riskId), notes: { obligations: notes.obligations.filter(o => o.open), regressions: notes.regressions, worked: notes.worked } }
      }
      const carried = new Map()
      for (const f of blocking) carried.set(f.id, f)
      for (const r of activeRisks) {
        const f = findingsById().get(r.findingId)
        if (f) carried.set(f.id, f)
      }
      return {
        step: 'prepare',
        mode: 'remediation',
        phase,
        round: phaseParts(phase)?.round ?? round,
        attempt: byPhase('red-spec', phase).length + 1,
        base: d.reviewedHead,
        findings: [...carried.values()],
        regressionRisks: activeRisks,
        regressionRepairOf: batch,
        group: groupOf(phase),
        ...(reconstruct ? { reconstruct } : {}),
        ...(rollbackRefusal ? { rollbackRefusal } : {}),
        ...(rollbackNote ? { rollbackNote } : {}),
        detail: `regression-risk rewind of ${batch}: ${activeRisks.length} active guard(s) plus every unresolved finding, fixed forward on the current head`,
      }
    }
    if (!blocking.length) {
      // Readiness is PROVEN only by the remote head the verifier read back at the very end: a
      // 40-hex `readiness.remoteHead` equal to the head it reviewed (T-9 review, t9-3). An
      // omitted or different one is unproven and re-verifies; a `--head` given by the caller
      // must agree as well.
      const remote = String(d.readiness?.remoteHead ?? '').toLowerCase()
      if (d.readiness?.ready === true && SHA_RE.test(remote) && remote === String(d.reviewedHead).toLowerCase()) {
        if (ctx.head && SHA_RE.test(ctx.head) && ctx.head !== d.reviewedHead) return { step: 'verify', mode: 're-review', phase: `r${round + 1}`, round: round + 1, attempt: 1, base: d.reviewedHead, prior: last.name, openIds: [], priorFindings: priorFindings(), headMoved: true }
        // US-479 T-22 (S5): a just-APPLIED extend-current-card decision (this exact handoff, not
        // yet acted on) opens a targeted remediation for its approved delta — on the SAME cycle,
        // before any `done`. Reusing the ordinary remediation path (T-20/T-21) rather than a
        // parallel one keeps validation, counters and budgets uniform.
        if (d.recordType === 'decision' && d.scopeExtension && !byPhase('red-spec', `r${round + 1}-g1`).length) {
          const ac = Array.isArray(d.scopeExtension.ac) ? d.scopeExtension.ac : []
          const findings = ac.map((item, i) => ({ id: item.id ?? `sc-ext-r${round + 1}-${i + 1}`, severity: 'Major', location: 'card', description: item.description ?? item.id ?? 'approved scope extension', recommendation: 'implement the approved AC', blocking: true, transition: 'open', kind: 'defect' }))
          return { step: 'prepare', mode: 'remediation', phase: `r${round + 1}-g1`, round: round + 1, attempt: 1, base: d.reviewedHead, findings, scopeEpoch: d.scopeEpoch }
        }
        // Quality is converged, but pending scope proposals still need the maintainer's explicit
        // ignore/extend-current-card/new-card decision (S2/S5) — never auto-absorbed, never `done`.
        const pending = pendingScopeChanges()
        if (pending.length) return blocked('awaiting-scope-decision', { qualityState: 'converged', reviewedHead: d.reviewedHead, scopeChanges: pending })
        return { step: 'done', reviewedHead: d.reviewedHead, round, verdict: d.verdict }
      }
      return { step: 'verify', mode: 're-review', phase: `r${round + 1}`, round: round + 1, attempt: 1, base: d.reviewedHead, prior: last.name, openIds: [], priorFindings: priorFindings(), headMoved: true, detail: SHA_RE.test(remote) ? 'readiness not confirmed on the remote head' : 'readiness not bound to a 40-hex remote head' }
    }
    if (blocking.every(f => f.external === true)) return blocked('escalate', { detail: 'external blockers need a human disposition or a read-back-verified correction', findings: blocking })
    // US-479 T-21 (S4): the budget bounds COMPLETED corrective cycles, never the raw round
    // counter — a metadata-only re-review (inputsChanged, a moved head) bumps `round` without any
    // actual fix and must not spend the budget a real remediation earns.
    if (cycleCounters(list).spentCycles >= (policy.maxFixRounds ?? 3)) return blocked('escalate', { budget: 'maxFixRounds', findings: blocking })
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

// US-479 R1 (F-RR-03): ONE attachment point for the derived guard set, not one per branch. Every
// dispatch that has to execute the closure assertions — a preparation, its validation, a GREEN and
// EVERY verification, including the k-th reviewer of a multi-reviewer pass and the re-review a
// changed input forces — receives the same active matrix. A branch that already carries its own
// (the rewind) keeps it; `blocked`/`done` are decisions, not dispatches, and are left alone.
const GUARDED_STEPS = new Set(['prepare', 'validate', 'green', 'verify'])
function withActiveGuards(next, active) {
  if (!next || typeof next !== 'object' || next.regressionRisks !== undefined || !GUARDED_STEPS.has(next.step)) return next
  return active.length ? { ...next, regressionRisks: active } : next
}
export function deriveNext(handoffs, policy, ctx = {}) {
  const next = deriveNextStep(handoffs, policy, ctx)
  const active = ctx.ledger ? ctx.ledger.filter(r => r.state === 'active') : activeRegressionRisks(handoffs.filter(h => h.data && h.data.recordType !== 'migration'))
  return withActiveGuards(next, active)
}

// ── counters (US-479 T-21, S4) ──────────────────────────────────────────────────────────────
// Pure derived view over the handoffs — never a second store, never consulted by `deriveNext`.
// Definitions (stated here since S4 does not pin every edge case, so a reader can audit them):
//   - a "cycle" is keyed by round 0 (the initial contract, ONLY when a genuine a0-rev<m>
//     correction exists — a plain a0 implementation is not a remediation) or round n>=1.
//   - attemptedCycles: rounds where a corrective implementation actually STARTED (any green-fix
//     dispatch, fixed or not — an interrupted or failed attempt still spent the round; a plain
//     re-review with no green-fix and no a0-rev<m> implementation is not an attempt at all).
//   - completedCycles: of those, the ones with at least one SUCCESSFUL correction (`fixed: true`,
//     or an a0-rev<m> implementation with `gatesPassed: true`) whose round has since seen a
//     COMPLETE review pass (its last handoff for that phase is not `partial`) — multiple
//     groups/commits/tier reviewers of the same round/phase count once.
//   - reviewExecutions: every review-phase handoff published (raw count, partial included).
//   - reviewBatches: distinct review PHASES dispatched (one batch = every reviewer of one phase).
//   - contractRevisions: distinct red-spec phases that are a revision (`-rev<m>`, m>1).
//   - preparationRepairs: red-spec attempts beyond the first on the SAME non-revision phase.
//   - implementationRetries: implement-phase attempts beyond the first on the same phase.
export function cycleCounters(allHandoffs, precomputedLedger) {
  const handoffs = (allHandoffs ?? []).filter(h => h?.data?.recordType !== 'migration')
  const list = handoffs.filter(h => h.data)
  const attemptedRounds = new Set()
  const succeededRounds = new Set()
  const attemptsByPhase = new Map()
  const revisionPhases = new Set()
  let preparationRepairs = 0
  let implementationRetries = 0
  // US-479 T-29 (S11): a repair of a batch invalidated by a regression is its own counter, not a
  // preparation repair — the earlier one measures a rejected contract, this one a rewind.
  const regressionRepairPhases = new Set()
  for (const h of list) {
    const parts = phaseParts(h.phase) ?? {}
    const key = `${h.skill}:${h.phase}`
    const n = (attemptsByPhase.get(key) ?? 0) + 1
    attemptsByPhase.set(key, n)
    if (h.skill === 'red-spec') {
      if (h.data.regressionRepairOf) regressionRepairPhases.add(`${h.phase}#${n}`)
      else if ((parts.revision ?? 1) > 1) {
        if (n === 1) revisionPhases.add(h.phase)
      } else if (n > 1) preparationRepairs++
    }
    if (h.skill === 'implement-phase' && n > 1) implementationRetries++
    if (h.skill === 'green-fix' && (parts.round ?? 0) >= 1) {
      attemptedRounds.add(parts.round)
      if (h.data.fixed === true) succeededRounds.add(parts.round)
    }
    if (h.skill === 'implement-phase' && parts.kind === 'initial' && (parts.revision ?? 1) > 1 && h.data.status === 'ok') {
      attemptedRounds.add(0)
      if (h.data.gatesPassed === true) succeededRounds.add(0)
    }
  }
  // A mechanical `recordType: decision|migration` record (US-479 T-19 S1, T-22 S5) is not a new
  // review EXECUTION — it fabricates no verdict, so it never inflates reviewExecutions/reviewBatches.
  const allReviews = list.filter(h => h.skill === 'review-phase')
  const reviews = allReviews.filter(h => (h.data.recordType ?? 'judgment') === 'judgment')
  const reviewExecutions = reviews.length
  const reviewPhasesSeen = new Set(reviews.map(h => h.phase))
  const reviewBatches = reviewPhasesSeen.size
  // US-479 T-29 (S11): a batch a review named `invalidatedBatchId` is an ATTEMPTED remediation, not
  // a completed one. It becomes completed only once a later review closes its original findings and
  // leaves no active risk it introduced — which is exactly what the closing review proves.
  // US-479 F-RR-06: a batch identity only counts when the HISTORY can resolve it — a review naming
  // a batch this run never had invalidates nothing. One canonical parser, no local regex.
  const knownBatch = b => list.some(h => String(h.data.remediationBatchId ?? '') === String(b) || phaseParts(h.phase)?.groupId?.startsWith(`${b}-`) === true)
  const invalidatedBatches = new Set()
  for (const h of reviews) if (h.data.invalidatedBatchId && knownBatch(h.data.invalidatedBatchId)) invalidatedBatches.add(String(h.data.invalidatedBatchId))
  const ledger = precomputedLedger ?? regressionRiskLedger(list)
  const activeRisks = ledger.filter(r => r.state === 'active')
  const unresolvedBatches = new Set(activeRisks.map(r => String(r.introducedByRemediationBatchId)))
  const attemptedCycles = attemptedRounds.size
  // Completion is evaluated PER BATCH LINEAGE, not from a global latest-review flag: a later,
  // unrelated dirty review can neither reopen nor erase a batch that was already closed clean.
  // US-479 V4 (F-RR-06): `readHandoffs` already sorts by seq, then mtime, then attempt — that is
  // the ONE publication order. Comparing raw `seq` values instead treated a missing seq as 0, so on
  // a migrated run no review could ever be "after" the last fix and no cycle completed.
  const orderOf = h => list.indexOf(h)
  // US-479 DR-01: the BUDGET counts CONCLUDED corrective cycles, not successful ones. A round that
  // produced a real fix and then received its review has spent a round whatever that review decided
  // — and a remediation that keeps failing is exactly when the budget must stop the cycle and ask a
  // human. Reading `completedCycles` for this made the budget unreachable in its own failure mode:
  // a batch nobody ever closed never counted, so the cycle looped until the engine's blunt dispatch
  // ceiling killed it. `completedCycles` stays what it says: how many corrective cycles CLOSED.
  // US-479 DR2-03/DR2-04 — the third wrong key in a row, so this one is stated as an invariant
  // rather than a list of shapes. Counting ROUND NUMBERS missed every loop that stays in one round;
  // counting GREEN-FIX handoffs missed the initial contract's revision loop (`a0-rev<n>`, whose work
  // goes to implement-phase) and wrongly charged a greenRetries retry, which the story bounds
  // separately. A concluded corrective cycle is neither a phase nor a skill: it is a NEWLY SEALED
  // contract that was judged by a non-partial review. A retry reuses the seal and spends nothing;
  // two groups of one round share the review and spend one (T-21); the initial contract itself is
  // not corrective, so only its revisions count.
  // US-479 DR3-11: `verified` too — every other seal reader requires both, and a seal the routing
  // refuses to recognise must not spend a budget unit either.
  const correctiveSeal = h => h.skill === 'red-verify' && h.data.sealed === true && h.data.verified === true && !(phaseParts(h.phase)?.kind === 'initial' && (phaseParts(h.phase)?.revision ?? 1) === 1)
  let spentCycles = 0
  let lastCounted = -1
  for (const r of reviews.filter(h => h.data.partial !== true)) {
    const at = orderOf(r)
    if (!list.some(h => correctiveSeal(h) && orderOf(h) > lastCounted && orderOf(h) < at)) continue
    spentCycles++
    lastCounted = at
  }
  let completedCycles = 0
  for (const round of succeededRounds) {
    const batch = `r${round}`
    const lastFix = Math.max(-1, ...list.filter(h => h.skill === 'green-fix' && (phaseParts(h.phase)?.round ?? -1) === round).map(orderOf))
    // The review that closed THIS batch: non-partial, after its last fix, leaving none of the
    // batch's OWN obligations blocking. A brand-new defect found there belongs to the next batch —
    // it does not reopen the one just closed (US-479 F-RR-06).
    const obligations = new Set(batchObligations(list, batch))
    // US-479 DR-01 (converse): an EMPTY obligation set closes VACUOUSLY — a batch whose only
    // preparation is a repair (its obligations belong to the batch being repaired) would then be
    // "completed" by any later review at all, a dirty one included. When the history does not say
    // which obligations this batch owned, the only proof left is that the closing review found
    // nothing open at all; when it does say, each of them must be closed by name. T-21's original
    // rule — a successful correction and a non-partial review since — still holds in both shapes.
    const closesObligations = h =>
      obligations.size
        ? [...obligations].every(id => {
            const f = (h.data.findings ?? []).find(x => x.id === id)
            return !!f && !isBlocking(f) && ['resolved', 'superseded'].includes(String(f.transition))
          })
        : !(h.data.findings ?? []).some(isBlocking)
    const closing = reviews.find(h => h.data.partial !== true && orderOf(h) > lastFix && closesObligations(h))
    if (!closing) continue
    if (unresolvedBatches.has(batch)) continue
    completedCycles++
  }
  return {
    attemptedCycles,
    spentCycles,
    completedCycles,
    reviewExecutions,
    reviewBatches,
    contractRevisions: revisionPhases.size,
    preparationRepairs,
    implementationRetries,
    invalidatedRemediations: invalidatedBatches.size,
    regressionRepairs: regressionRepairPhases.size,
    activeRegressionRisks: activeRisks.length,
    dischargedRegressionRisks: ledger.filter(r => r.state === 'discharged').length,
  }
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
  // US-479 B1: the contradiction budget belongs to the CYCLE, not to one run directory — every
  // sibling run of the same story/PR hands in the keys it already spent, so starting a new runId
  // can never buy a second successor revision for the same obligation.
  const siblingContradictionKeys = []
  if (runsRoot && story && existsSync(runsRoot)) {
    for (const r of readdirSync(runsRoot)) {
      const other = join(runsRoot, r, String(story))
      if (other === dir || !existsSync(other)) continue
      for (const h of readHandoffs(other))
        if (h.data && h.skill === 'red-spec' && h.data.status === 'contradiction' && h.data.contradictionKey && (pr === undefined || h.data.pr === undefined || h.data.pr === null || String(h.data.pr) === String(pr)))
          siblingContradictionKeys.push(h.data.contradictionKey)
    }
  }
  // US-479 F-RR-06: the derived ledger is computed ONCE per resolution and handed to every reader
  // — the next step, the counters and the returned active matrix all see the same view.
  const ledger = regressionRiskLedger(handoffs)
  let next = deriveNext(handoffs, policy, { entry, head, siblingContradictionKeys, predecessors: predecessorEvidence(dir), ledger })
  const names = handoffs.map(h => h.name)
  // Changed effective inputs invalidate REVIEW evidence: prior findings + the delta are re-validated
  // from the last reviewed head. Sealed contracts and GREEN commits stay trusted.
  // The card hash is compared only when BOTH sides are canonical (`sha256:<64 hex>` from `ac-hash`):
  // two producers spelling it differently (a free-text summary vs a digest) would otherwise flag a
  // change on every resume and force a re-verification each time (canary run 11).
  const canonicalHash = v => (typeof v === 'string' && /^sha256:[0-9a-f]{64}$/.test(v) ? v : undefined)
  const acNow = canonicalHash(acHash)
  // Only a hash the SCRIPT stamped at publish time is comparable; an agent-spelled value (pre-3.0.12
  // handoffs) is history, never evidence of a change.
  const acThen = last.data.acHashSource === 'publish' ? canonicalHash(last.data.acHash) : undefined
  if (last.skill === 'review-phase' && ((inputs && last.data.inputsDigest && last.data.inputsDigest !== inputs) || (acNow && acThen && acThen !== acNow)) && next.step !== 'blocked') {
    const round = phaseParts(last.phase)?.round ?? 0
    const seen = new Map()
    for (const r of handoffs.filter(h => h.skill === 'review-phase')) for (const f of r.data.findings ?? []) if (f?.id) seen.set(f.id, { id: f.id, severity: f.severity })
    next = withActiveGuards(
      { step: 'verify', mode: 're-review', phase: `r${round + 1}`, round: round + 1, attempt: 1, base: last.data.reviewedHead, prior: last.name, openIds: (last.data.findings ?? []).filter(isBlocking).map(f => f.id), priorFindings: [...seen.values()], inputsChanged: true, invalidated: handoffs.filter(h => h.skill === 'review-phase').map(h => h.name) },
      ledger.filter(r => r.state === 'active'),
    )
  }
  // The PR the cycle is bound to travels with EVERY next: a coordinator resuming a fresh-path card
  // (no prNumber in its args) learns it from here — a verification dispatched without it would
  // key its markers on `PR#null` (canary run 11, finding r1-5).
  const knownPr = handoffs.map(h => h.data.pr ?? h.data.prNumber).find(x => Number.isInteger(x) && x > 0) ?? (Number.isInteger(Number(pr)) && Number(pr) > 0 ? Number(pr) : undefined)
  if (knownPr !== undefined && next && typeof next === 'object' && next.pr === undefined) next = { ...next, pr: knownPr }
  // US-479 B2: the provenance binding travels with EVERY resolve — a resumed cycle never forgets
  // which runs it continues, and a reader never mistakes it for a clean new PR.
  const predecessorRuns = [...new Set(handoffs.filter(h => h.data?.recordType === 'migration').flatMap(h => (h.data.predecessorRuns ?? []).map(r => r.runId)))].sort()
  const status = next.step === 'done' ? 'completed' : next.step === 'blocked' ? 'blocked' : 'in-progress'
  const nextFindingSeq = handoffs.filter(h => h.skill === 'review-phase').reduce((m, h) => Math.max(m, ...(h.data.findings ?? []).map(f => Number(/-(\d+)$/.exec(String(f.id ?? ''))?.[1] ?? 0))), 0) + 1
  return { status, next, handoffs: names, last: last.name, pr: knownPr ?? pr, nextFindingSeq, workflowVersion, counters: cycleCounters(handoffs, ledger), predecessorRuns, activeRegressionRisks: ledger.filter(r => r.state === 'active'), rollbackNotes: rollbackNotes(handoffs, ledger) }
}

// ── migration (US-479 T-19, S10) ───────────────────────────────────────────────────────────
// Read-only inspection of a run directory's evidence against the CURRENT schema. Never rewrites,
// never backfills a fabricated counter/token/timestamp; a caller acknowledges the migration as its
// own new handoff (recordType=migration) only after this reports what is actually usable.
export function migrateInspect({ dir }) {
  if (!existsSync(dir)) return { compatibleEvidenceRefs: [], missingDimensions: ['no-run-directory'], ambiguity: [], next: 'fresh-cycle' }
  const files = readdirSync(dir).filter(f => NAME_RE.test(f))
  const compatibleEvidenceRefs = []
  let legacyCount = 0
  const ambiguity = []
  for (const f of files) {
    let data
    try {
      data = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    } catch {
      ambiguity.push(`${f}:not-json`)
      continue
    }
    if (data.schemaVersion === SCHEMA_VERSION) compatibleEvidenceRefs.push(f)
    else if (Number.isInteger(data.schemaVersion) && data.schemaVersion < SCHEMA_VERSION) legacyCount++
    else ambiguity.push(`${f}:schemaVersion ${JSON.stringify(data.schemaVersion)}`)
  }
  const missingDimensions = legacyCount && !compatibleEvidenceRefs.length ? ['scopeEpoch', 'scopeBaselineHash', 'findings-origin'] : []
  const next = ambiguity.length ? 'blocked' : legacyCount && !compatibleEvidenceRefs.length ? 'migration-acknowledgment-required' : compatibleEvidenceRefs.length ? 'resume' : 'fresh-cycle'
  return { compatibleEvidenceRefs, missingDimensions, ambiguity, next }
}

// ── migration acknowledgment (US-479 B2, S10, AC-27) ───────────────────────────────────────
// A run directory written by an older engine is LEGACY evidence: `resolve` refuses it (its first
// pre-schema-3 handoff is enough) and no record on top can make it executable — the supported
// shape is a NEW run directory started BESIDE it. What was missing is the BINDING: without it the
// new cycle presents as a clean PR and the lifetime metrics silently lose everything already
// measured, which is exactly what S10 forbids ("bind predecessor run references; missing older
// logs yield partial lifetime metrics, not a clean new PR").
//
// This writes that binding, once: a `recordType: migration` record naming every predecessor —
// transitively, so a chain v3 -> v4 -> v5 keeps v3 — with `migrate-inspect`'s read-only finding, a
// verified sha256 per legacy handoff and the path of any metrics the predecessor already persisted.
// It reads the legacy directory and writes NOTHING into it. It fabricates no counter, no token, no
// verdict and no approval: the record is refused by the envelope validator if it carries any.
export function migrateAcknowledge({ dir, legacyDirs = [], workflowVersion, story, pr, run, branch, inputHead, lockWaitMs = 5000 }) {
  const digestOf = p => `sha256:${createHash('sha256').update(readFileSync(p)).digest('hex')}`
  const collect = (legacyDir, seen) => {
    const real = existsSync(legacyDir) ? legacyDir : null
    if (!real) return { error: `predecessor-missing:${legacyDir}` }
    const runId = basename(dirname(real))
    if (seen.has(runId)) return { runs: [] }
    seen.add(runId)
    const files = readdirSync(real).filter(f => NAME_RE.test(f)).sort()
    const handoffs = files.map(f => ({ name: f, sha256: digestOf(join(real, f)) }))
    const parsed = files.map(f => {
      try {
        return JSON.parse(readFileSync(join(real, f), 'utf8'))
      } catch {
        return null
      }
    })
    const metricsPath = existsSync(join(real, 'metrics.json')) ? join(real, 'metrics.json') : null
    const runs = [
      {
        runId,
        dir: real,
        handoffs,
        metricsPath,
        schemaVersions: [...new Set(parsed.map(d => d?.schemaVersion).filter(v => v !== undefined))].sort(),
        workflowVersions: [...new Set(parsed.map(d => d?.workflowVersion).filter(Boolean))].sort(),
        inspection: migrateInspect({ dir: real }),
      },
    ]
    // transitive: whatever THIS predecessor itself acknowledged is still a predecessor of ours
    for (const d of parsed) if (d?.recordType === 'migration') for (const p of d.predecessorRuns ?? []) if (!seen.has(p.runId)) { seen.add(p.runId); runs.push(p) }
    return { runs }
  }
  const seen = new Set()
  const predecessorRuns = []
  for (const l of legacyDirs) {
    const got = collect(l, seen)
    if (got.error) return { applied: false, reason: got.error }
    predecessorRuns.push(...got.runs)
  }
  if (!predecessorRuns.length) return { applied: false, reason: 'no-predecessors' }
  predecessorRuns.sort((a, b) => (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0))
  const migrationKey = `sha256:${createHash('sha256').update(predecessorRuns.map(r => `${r.runId}\u0000${(r.handoffs ?? []).map(h => `${h.name}:${h.sha256}`).join(',')}`).join('\u0000')).digest('hex')}`
  const existing = readHandoffs(dir).filter(h => h.data?.recordType === 'migration')
  for (const e of existing) {
    if (e.data.migrationKey === migrationKey) return { applied: false, reason: 'already-acknowledged', path: e.file, migrationKey }
    // the same predecessors under different digests: the evidence this cycle was bound to moved
    const priorById = new Map((e.data.predecessorRuns ?? []).map(r => [r.runId, r]))
    for (const r of predecessorRuns) {
      const prior = priorById.get(r.runId)
      if (prior && JSON.stringify(prior.handoffs) !== JSON.stringify(r.handoffs)) return { applied: false, reason: `predecessor-evidence-changed:${r.runId}`, path: e.file }
    }
  }
  const n = existing.length
  const phase = `m${n}`
  const draft = { run, story, pr, branch, phase, skill: 'review-phase', inputHead, recordType: 'migration', migrationKey, predecessorRuns, acknowledgedAt: new Date().toISOString() }
  const tmp = join(dir, `.migration-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(tmp, JSON.stringify(draft))
  const out = publish({ dir, file: tmp, phase, skill: 'review-phase', workflowVersion, pr, lockWaitMs })
  return { applied: !!out.published, reason: out.published ? undefined : out.reason, path: out.path, migrationKey, predecessorRuns: predecessorRuns.map(r => r.runId) }
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
      const h = cardHash({ story: opts.story })
      if (h.error) throw new Error(h.error)
      process.stdout.write(JSON.stringify({ acHash: h.acHash }) + '\n')
      process.exit(0)
    } else if (cmd === 'inputs') {
      need('json')
      process.stdout.write(JSON.stringify({ inputsDigest: inputsDigest(JSON.parse(opts.json)) }) + '\n')
      process.exit(0)
    } else if (cmd === 'apply-scope-decisions') {
      need('dir', 'decision-ref', 'repo', 'pr')
      out = applyScopeDecisions({ dir: opts.dir, decisionRef: opts['decision-ref'], repo: opts.repo, pr: Number(opts.pr), maintainer: opts.maintainer, workflowVersion: opts.workflowVersion })
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(out.applied ? 0 : 1)
    } else if (cmd === 'migrate-inspect') {
      need('dir')
      out = migrateInspect({ dir: opts.dir })
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(0)
    } else if (cmd === 'migrate-acknowledge') {
      // US-479 B2: bind a NEW run directory to the legacy run(s) it continues. Read-only on the
      // legacy evidence; `--legacy` repeats, and `,` separates several in one value.
      need('dir', 'legacy', 'workflowVersion', 'story', 'run', 'head')
      const legacyDirs = String(opts.legacy).split(',').map(x => x.trim()).filter(Boolean)
      out = migrateAcknowledge({ dir: opts.dir, legacyDirs, workflowVersion: opts.workflowVersion, story: opts.story, pr: opts.pr ? Number(opts.pr) : undefined, run: opts.run, branch: opts.branch, inputHead: opts.head })
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(out.applied || out.reason === 'already-acknowledged' ? 0 : 1)
    } else if (cmd === 'test-identity') {
      need('cwd', 'command')
      const keys = (opts['env-keys'] ?? 'CI,NODE_ENV,TZ').split(',').filter(Boolean)
      const env = Object.fromEntries(keys.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]))
      out = testIdentity({ cwd: opts.cwd, command: opts.command, env, toolchain: opts.toolchain ?? `node ${process.version}` })
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(0)
    } else throw new Error(`unknown command: ${cmd} (expected resolve | publish | hash | inputs | migrate-inspect | apply-scope-decisions | test-identity)`)
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(2)
  }
}
