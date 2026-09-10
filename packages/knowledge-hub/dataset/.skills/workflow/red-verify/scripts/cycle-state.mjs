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
import { join, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const SCHEMA_VERSION = 3
// Pinned once here (US-479 T-19, S1) so no caller re-spells it: workflow 4.0.0 / handoff schema 3
// consume this; cycle-metrics.mjs (T-24) stamps its own views with METRICS_SCHEMA_VERSION.
export const METRICS_SCHEMA_VERSION = 1
export const SKILLS = ['red-spec', 'red-verify', 'implement-phase', 'green-fix', 'review-phase']
export const STEPS = ['prepare', 'validate', 'implement', 'green', 'verify', 'done', 'blocked']
export const PREPARE_REFUSALS = ['stale', 'split-required', 'unprovable', 'dirty']
// Schema-3 taxonomy (US-479 T-19, S1/S2/S5) — the ONE spelling every handoff and comment must use.
export const FINDING_TRANSITIONS = ['open', 'resolved', 'superseded', 'human']
// US-479 T-24 (S2/S9, AC-23): late-defect origin — never inferred from file age or LLM confidence,
// only from a replay at the baseline head vs the defective head (originEvidence).
export const FINDING_ORIGINS = ['preexisting-missed', 'introduced-by-remediation', 'unknown']
export const RECORD_TYPES = ['decision', 'migration', 'judgment']
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
  for (const k of REQUIRED_BY_SKILL[skill] ?? []) if (data[k] === undefined) errs.push(`missing-field:${k}`)
  if (data.phase !== undefined && data.skill !== undefined && (String(data.phase) !== String(phase) || String(data.skill) !== String(skill))) errs.push('identity-mismatch')
  if (data.scopeEpoch !== undefined && (!Number.isInteger(data.scopeEpoch) || data.scopeEpoch < 1)) errs.push('scopeEpoch-invalid')
  if (data.scopeBaselineHash !== undefined && !/^sha256:[0-9a-f]{64}$/.test(String(data.scopeBaselineHash))) errs.push('scopeBaselineHash-invalid')
  if (data.firstReviewHead !== undefined && !SHA_RE.test(String(data.firstReviewHead))) errs.push('firstReviewHead-invalid')
  if (data.remediationBatchId !== undefined && (typeof data.remediationBatchId !== 'string' || data.remediationBatchId === '')) errs.push('remediationBatchId-invalid')
  if (data.recordType !== undefined && !RECORD_TYPES.includes(data.recordType)) errs.push(`recordType-invalid:${data.recordType}`)
  if (data.findings !== undefined) {
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

// US-479 remediation (Finding 6, residual): an AC line is `<id>: <description>` on its own line,
// optionally bulleted/bolded (both a human-authored `AC-1: old` and our own `- **AC-1**: new` match).
// The id token is captured to its FULL word boundary — `AC-10` is never mistaken for a prefix match
// against `AC-1` — and every match keeps its exact position, so a targeted line can be replaced
// in place without disturbing any other AC or human prose around it.
//
// US-479 remediation (Finding 6, residual — Caso A): the ADOPTED card formats are recognized
// explicitly, never guessed by a generic parser. Two dialects are real: #479's own checkbox
// convention `- [ ] **AC-01 — Title.** Description.` (one line per AC), and the delivery template's
// numbered Given/When/Then blocks (`N. **Given** … / **When** … / **Then** …`, three lines,
// user-story-template.md). A card recognized as neither dialect never has a "genuinely new" AC
// guessed into it via the GWT convention — a parser miss is NOT proof an id is new; it is proof
// this id could not be resolved, and resolution failing is refused, never silently treated as an
// insertion instruction.
const CHECKBOX_AC_RE = /^(-\s*\[[ xX]\]\s*)?\*\*(AC-[\w.-]*\w)(?:\s+—\s+([^*\n]*?))?\.\*\*(?:[ \t]+(.*))?$/gm
const GWT_AC_RE = /^(\d+)\.[ \t]+\*\*Given\*\*[ \t]+(.*)\n[ \t]+\*\*When\*\*[ \t]+(.*)\n[ \t]+\*\*Then\*\*[ \t]+(.*)$/gm
function parseAcCard(body) {
  const text = String(body ?? '')
  const checkboxById = new Map()
  let m
  CHECKBOX_AC_RE.lastIndex = 0
  while ((m = CHECKBOX_AC_RE.exec(text))) {
    const entry = { id: m[2], checkbox: m[1] ?? '', title: m[3], description: (m[4] ?? '').trim(), start: m.index, end: m.index + m[0].length }
    checkboxById.set(m[2], [...(checkboxById.get(m[2]) ?? []), entry])
  }
  const gwtById = new Map()
  GWT_AC_RE.lastIndex = 0
  while ((m = GWT_AC_RE.exec(text))) {
    const entry = { number: m[1], given: m[2].trim(), when: m[3].trim(), then: m[4].trim(), start: m.index, end: m.index + m[0].length }
    gwtById.set(m[1], [...(gwtById.get(m[1]) ?? []), entry])
  }
  return { dialect: checkboxById.size ? 'checkbox' : gwtById.size ? 'gwt' : 'unknown', checkboxById, gwtById }
}
const renderCheckboxLine = (id, description) => `- [ ] **${id}.** ${description}`
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
    const entries = card.checkboxById.get(a.id) ?? []
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
  // Resolve every targeted id BEFORE any edit: existing (either dialect), genuinely new (checkbox
  // dialect only — a card with no recognized structure at all is treated the same way, since there
  // is no competing convention to violate), or unresolvable — refused, never guessed.
  const resolved = []
  for (const a of ac) {
    const cb = card.checkboxById.get(a.id) ?? []
    if (cb.length > 1) return { error: `ambiguous-ac-id:${a.id}` }
    if (cb.length === 1) {
      resolved.push({ a, kind: 'checkbox-existing', entry: cb[0] })
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
    resolved.push({ a, kind: 'checkbox-new' })
  }
  const isSatisfied = r => {
    if (r.kind === 'checkbox-existing') return r.entry.description === r.a.description
    if (r.kind === 'gwt-existing') return r.entry.given === r.parsed.given && r.entry.when === r.parsed.when && r.entry.then === r.parsed.then
    return false
  }
  const needsWork = resolved.filter(r => !isSatisfied(r))
  if (needsWork.length) {
    const replacements = []
    const toAppend = []
    for (const r of needsWork) {
      if (r.kind === 'checkbox-existing') replacements.push({ start: r.entry.start, end: r.entry.end, text: renderCheckboxLine(r.a.id, r.a.description) })
      else if (r.kind === 'gwt-existing') replacements.push({ start: r.entry.start, end: r.entry.end, text: renderGwtBlock(r.entry.number, r.parsed) })
      else toAppend.push(r.a)
    }
    replacements.sort((x, y) => y.start - x.start)
    let nextBody = currentBody
    for (const rep of replacements) nextBody = nextBody.slice(0, rep.start) + rep.text + nextBody.slice(rep.end)
    if (toAppend.length) {
      const marker = '## Scope extension (US-479 S5)'
      const lines = toAppend.map(a => renderCheckboxLine(a.id, a.description)).join('\n')
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
      const cb = writtenCard.checkboxById.get(r.a.id) ?? []
      if (cb.length !== 1 || cb[0].description !== r.a.description) return { error: `gh-issue-edit-readback-mismatch:${r.a.id}` }
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
    if (d.needsHumanDecision === true && d.humanDecisionKind === 'history-rewrite') return blocked('escalate', { detail: 'history-rewrite decision', findings: blocking })
    if (blocking.every(f => f.external === true)) return blocked('escalate', { detail: 'external blockers need a human disposition or a read-back-verified correction', findings: blocking })
    // US-479 T-21 (S4): the budget bounds COMPLETED corrective cycles, never the raw round
    // counter — a metadata-only re-review (inputsChanged, a moved head) bumps `round` without any
    // actual fix and must not spend the budget a real remediation earns.
    if (cycleCounters(list).completedCycles >= (policy.maxFixRounds ?? 3)) return blocked('escalate', { budget: 'maxFixRounds', findings: blocking })
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
export function cycleCounters(handoffs) {
  const list = handoffs.filter(h => h.data)
  const attemptedRounds = new Set()
  const succeededRounds = new Set()
  const attemptsByPhase = new Map()
  const revisionPhases = new Set()
  let preparationRepairs = 0
  let implementationRetries = 0
  for (const h of list) {
    const parts = phaseParts(h.phase) ?? {}
    const key = `${h.skill}:${h.phase}`
    const n = (attemptsByPhase.get(key) ?? 0) + 1
    attemptsByPhase.set(key, n)
    if (h.skill === 'red-spec') {
      if ((parts.revision ?? 1) > 1) {
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
  const completedReviewRounds = new Set()
  for (const phase of new Set(allReviews.map(h => h.phase))) {
    const ofPhase = allReviews.filter(h => h.phase === phase)
    const last = ofPhase[ofPhase.length - 1]
    if (last.data.partial !== true) completedReviewRounds.add(phaseParts(phase)?.round ?? 0)
  }
  const attemptedCycles = attemptedRounds.size
  let completedCycles = 0
  for (const round of succeededRounds) if (completedReviewRounds.has(round)) completedCycles++
  return { attemptedCycles, completedCycles, reviewExecutions, reviewBatches, contractRevisions: revisionPhases.size, preparationRepairs, implementationRetries }
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
  // Only a hash the SCRIPT stamped at publish time is comparable; an agent-spelled value (pre-3.0.12
  // handoffs) is history, never evidence of a change.
  const acThen = last.data.acHashSource === 'publish' ? canonicalHash(last.data.acHash) : undefined
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
  return { status, next, handoffs: names, last: last.name, pr: knownPr ?? pr, nextFindingSeq, workflowVersion, counters: cycleCounters(handoffs) }
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
