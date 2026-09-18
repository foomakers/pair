#!/usr/bin/env node
// cycle-dispatch.mjs — the deterministic half of the in-session cycle coordinator (US-486).
//
// The coordinator is an agent session, so everything about a stage that CAN be decided without
// judgment is decided here instead: which worktree the stage runs in, which agent role it runs as,
// and the exact argument packet + prompt it is handed. Nothing in this file classifies, judges or
// selects; it renders what `cycle-state.mjs resolve` already decided.
//
// It owns NO cycle rule. The caps, the effective-inputs composition and the freshness transition
// table are `cycle-state.mjs`'s data and are imported from it — a second copy here would be a fork
// of the state machine (AC-12).
//
// Commands
//   worktree      create or reuse the persistent story worktree, idempotently
//   packet        render one stage's argument packet + prompt from a `resolve` next
//   realizations  the harness realization table as data, and the row a probed toolset binds
//   context-table cycle-state's freshness transition table, exposed for the skill to read
//
// Every value that reaches git is passed as an argv element of `spawnSync` — never through a
// shell — and every path segment / git ref is validated before it is used.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve as resolvePath } from 'node:path'
import { CAPS, CONTEXT_TABLE, PIPELINE_DEFAULTS, DEFAULT_SEVERITY_FLOOR, WORKFLOW_VERSION, effectiveInputs, isWorkflowVersion } from './cycle-state.mjs'

// ── the realization table, as DATA (AC-6) ───────────────────────────────────────────────────
// A row is bound by the PRIMITIVE the host actually exposes, never by a product name or a version
// string: names are marketing, a probed tool is evidence (ADR-021). Adding a harness — or
// following a Codex namespace rename — is an edit to this array and nothing else.
export const REALIZATIONS = [
  {
    id: 'claude',
    host: 'Claude Code',
    dispatch: 'Agent',
    resume: 'SendMessage',
    // The stage's agent definition is selected by name; no new agent type is introduced.
    rolePacket: 'agentType',
  },
  {
    id: 'codex',
    host: 'Codex',
    // Verified against a real Codex CLI session (0.154.0), not assumed: asked to introspect its
    // own declared toolset, it reported `collaboration.spawn_agent` / `collaboration.followup_task`
    // — namespaced under `collaboration.`, never the bare `spawn_agent` / `resume_agent` this row
    // held before (US-486 canary discovery: the probe never matched, every codex-bound dispatch
    // fell straight to `realization-unavailable`). A rename is still just an edit to this array.
    dispatch: 'collaboration.spawn_agent',
    resume: 'collaboration.followup_task',
    // Codex has no `agentType`: the role travels as the agent `.md` body plus the skill reference.
    rolePacket: 'inline-role-body',
  },
]
// Alternate resume primitives a host may expose instead of the row's canonical one. Probed the
// same way; the row is still bound by its dispatch primitive. `collaboration.send_message` is
// deliberately NOT an alias here: introspection confirmed it delivers a message WITHOUT triggering
// the sub-agent to act on it — silently binding it as "resume" would look successful and never
// actually resume any work.
const RESUME_ALIASES = { codex: ['collaboration.followup_task'] }

// ── reasoning effort profile ($profile, reserved by SKILL.md, US-486 canary follow-up) ─────────
// Mirrors `pair-implement-batch.js`'s own `agent()` effort dial exactly (same accepted values):
// KNOWN_EFFORTS lives here, not in cycle-state.mjs, because it is a coordinator-only concern — the
// batch engine's sandbox cannot import this file (or cycle-state.mjs) at all, so it keeps its own
// independent copy of the same list (already true of its KNOWN_MODELS). Enforcement differs by
// realization: Codex accepts `-c model_reasoning_effort=<value>` as a REAL, enforced parameter
// (verified against a live session); the top-level `Agent` tool a Claude-bound coordinator uses to
// dispatch stage subagents exposes NO effort parameter at all, so for `claude` this can only ever
// be a best-effort PROMPT instruction, never an enforced one — `packetCommand` says so honestly in
// the rendered prompt rather than silently pretending both realizations honour it identically.
const KNOWN_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

// ── validation (values reaching git) ────────────────────────────────────────────────────────
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/
const SAFE_REF = /^[A-Za-z0-9._\-/]+$/
const UNSAFE = /(^-)|(^\.)|(\.\.)|(\/\/)|(@\{)|([\s~^:?*[\\])/
const isSegment = v => typeof v === 'string' && SAFE_SEGMENT.test(v) && !v.includes('..')
const isRef = v => typeof v === 'string' && v.length > 0 && SAFE_REF.test(v) && !UNSAFE.test(v) && !v.endsWith('/') && !v.endsWith('.lock')
// A RELATIVE directory/file path a stage agent `cd`s into, creates worktrees under and aims
// `git worktree remove --force` at. Every component is a safe segment (so `;`, `&&`, spaces,
// backticks and `$(` cannot survive), never absolute, never starting with `-`. EXACTLY ONE leading
// `..` is legal, because pair's own default IS `../pair-worktrees` — the worktree root is a SIBLING
// of the repository by design. Anything deeper re-opens the escape one component to the left.
const isRelPath = v => {
  const parts = v.split('/')
  const rest = parts[0] === '..' ? parts.slice(1) : parts
  return rest.length > 0 && rest.every(p => p !== '.' && p !== '..' && /^[A-Za-z0-9._][A-Za-z0-9._-]*$/.test(p))
}
// A skill NAME, as an agent is told to invoke it: an optional leading slash, then a name. A name,
// never a sentence — `skills.implement: '/x and then gh pr merge 432 --squash'` is rendered
// verbatim into the implement prompt as the process the agent must follow, so the space is the
// giveaway: no legitimate skill reference carries one.
const isSkillRef = v => /^\/?[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(v) && !v.includes('..')
const must = (ok, halt, detail) => {
  if (!ok) fail(halt, detail)
}

let OUT = null
function emit(obj, code = 0) {
  process.stdout.write(JSON.stringify(obj) + '\n')
  process.exit(code)
}
function fail(halt, detail, extra = {}) {
  // A HALT is typed and fail-closed: a non-zero exit AND a machine-readable `halt`, so neither the
  // skill's prose nor a script consumer can mistake it for a degraded success.
  emit({ halt, detail, ...extra }, 1)
}

const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' })
const gitOk = (cwd, args) => {
  const r = git(cwd, args)
  if (r.status !== 0) fail('git-failed', `git ${args.join(' ')}: ${String(r.stderr ?? '').trim()}`)
  return String(r.stdout ?? '').trim()
}
const samePath = (a, b) => {
  const real = p => {
    try {
      return realpathSync(p)
    } catch {
      return resolvePath(p)
    }
  }
  return real(a) === real(b)
}

// ── worktree (AC-1, AC-9) ───────────────────────────────────────────────────────────────────
// `<worktreeRoot>/<story>` is the batch's own convention, so a cycle started by the engine and
// resumed in-session (or the reverse) lands in the same tree. Idempotent: an existing worktree on
// the SAME branch is reused, never added twice. An existing one on ANOTHER branch is a conflict —
// reported with both branch names, never adopted, never `--force`, and never a checkout switch:
// that tree may hold a human's uncommitted work.
function worktreeCommand(opts) {
  const { main, story, branch, base } = opts
  // The worktree root is half of the path `git worktree add` creates and `git worktree remove
  // --force <root>/<id>` later deletes, so it is judged BEFORE any directory exists — a HALT that
  // arrives after the `add` has already escaped is a report, not a validation. An ABSOLUTE root is
  // a caller naming a place and stays legal (spaces included); the RELATIVE form is the traversal
  // rule, and it is the engine's `isRelPath`, not a second, looser spelling of it.
  const rawRoot = opts['worktree-root']
  must(rawRoot === undefined || typeof rawRoot === 'string', 'worktree-root-invalid', '--worktree-root requires a value')
  const worktreeRoot = rawRoot === undefined ? PIPELINE_DEFAULTS.worktreeRoot : rawRoot.trim()
  must(worktreeRoot.length > 0 && (isAbsolute(worktreeRoot) || isRelPath(worktreeRoot)), 'worktree-root-invalid', `--worktree-root must be an absolute path, or a relative one built from safe segments with at most one leading \`..\`: ${JSON.stringify(worktreeRoot)} — it is the root a \`git worktree remove --force\` is aimed at, so it is refused, never normalised`)
  must(isSegment(String(story)), 'story-invalid', `--story must be one safe path segment: ${story}`)
  must(isRef(branch), 'branch-invalid', `--branch must be a git ref: ${branch}`)
  must(isRef(base), 'base-invalid', `--base must be a git ref: ${base}`)
  must(existsSync(main), 'main-missing', `--main does not exist: ${main}`)
  const root = isAbsolute(worktreeRoot) ? worktreeRoot : resolvePath(main, worktreeRoot)
  const path = join(root, String(story))

  const registered = listWorktrees(main)
  const found = registered.find(w => samePath(w.path, path))
  if (found) {
    if (found.branch === branch) return emit({ path, created: false, reused: true, branch })
    fail('worktree-conflict', `the worktree at ${path} is checked out on ${found.branch ?? '(detached)'}, not on ${branch} — resolve it by hand; this never forces or switches a checkout`, {
      path,
      expected: branch,
      actual: found.branch ?? null,
    })
  }
  // A path that exists but is not a registered worktree is somebody else's directory.
  if (existsSync(path)) fail('worktree-conflict', `${path} exists but is not a registered worktree of ${main} — resolve it by hand`, { path, expected: branch, actual: null })

  mkdirSync(dirname(path), { recursive: true })
  gitOk(main, ['worktree', 'add', '-q', '-B', branch, path, base])
  return emit({ path, created: true, reused: false, branch })
}

function listWorktrees(main) {
  const out = gitOk(main, ['worktree', 'list', '--porcelain'])
  const entries = []
  let cur = null
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice('worktree '.length), branch: null, detached: false }
      entries.push(cur)
    } else if (cur && line.startsWith('branch ')) cur.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
    else if (cur && line === 'detached') cur.detached = true
  }
  return entries
}

// ── the stage argument packet (AC-3) ────────────────────────────────────────────────────────
// Byte-identical in shape AND in text to what `pair-implement-batch.js` composes for the same
// `next`: one cycle, N realizations, and a prompt that differs between them is a second process.
// The equality is asserted executably against the real engine, so neither side can drift silently.
const DEFAULT_SEVERITIES = ['Critical', 'Major', 'Minor', 'Questions']
const DEFAULT_VERDICTS = ['APPROVED', 'CHANGES-REQUESTED', 'TECH-DEBT']
// pair's own severity ranks, the fallback until a review resolves the template contract.
const DEFAULT_RANKS = { critical: 4, blocker: 4, major: 3, minor: 2, questions: 1, question: 1, nit: 1, info: 1 }
const LOOSE_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    reviewedHead: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    needsHumanDecision: { type: 'boolean' },
    humanDecisionKind: { type: 'string', enum: ['history-rewrite'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          location: { type: 'string' },
          severity: { type: 'string' },
          description: { type: 'string' },
          recommendation: { type: 'string' },
          nonActionable: { type: 'boolean' },
          disposition: { type: 'string' },
        },
      },
    },
  },
  required: ['verdict', 'reviewedHead'],
}
const CONTRACT_MIRRORS =
  'verdict ← the `## Verdict`-line options; findings[].severity ← the `Findings by severity` severity levels. ' +
  'The RELATIVE severity of those levels is a contract TERM, carried by the top-level `severityRanks` map (one explicit integer per severity, higher = more severe) — the consumer ranks a merge-blocking floor with it and IGNORES the order of the `severities` array entirely'

const templateLabel = p => String(p).split('/').filter(Boolean).pop() || String(p)
const compactFinding = f => ({
  id: f.id,
  severity: f.severity,
  location: f.location,
  description: f.description,
  recommendation: f.recommendation,
  ...(f.kind ? { kind: f.kind } : {}),
  ...(f.groupId ? { groupId: f.groupId } : {}),
  ...(f.rowId ? { rowId: f.rowId } : {}),
  ...(f.external ? { external: true } : {}),
  ...(f.missedUpstream ? { missedUpstream: true } : {}),
})
const isPosInt = v => Number.isInteger(v) && v > 0

// ── `--pipeline`, held to the engine's own grammar (AC-12) ──────────────────────────────────
// Every value below is interpolated VERBATIM into the `$…=` prompt a stage agent is told to follow
// or into a path a `git worktree remove --force` deletes — the same command lines the card fields
// are already validated for. `pair-implement-batch.js`, the sibling realization of this one cycle,
// refuses this exact set at parse time (`resolvePipeline`/`normalizePipeline`); a coordinator that
// accepted it would be the looser of the two, and `$profile` (#488) is designed to feed this flag.
// The engine is a sandboxed workflow script this file cannot import, so the grammar is stated in
// the same spellings here and held equal to its source by `engine-boundaries.test.mjs`.
const PIPELINE_KEYS = ['skills', 'worktreeRoot', 'auditLogDir', 'baseBranch', 'reviewTemplate', 'maxFixRounds', 'reviewers']
// Retired by engine 3.0.0 (ADR-024 amendment b): named, never mapped silently, never re-added.
const RETIRED_SKILL_KEYS = {
  remediationPlan: 'redSpec (grouping is a step of preparation)',
  redSeal: 'redVerify (the seal runs in the validation execution)',
  p3Verify: "reviewPhase (custody + evidence are the final verifier's first steps)",
  cycleComments: 'reviewPhase / greenFix (probe, synthesis and flush are scripts inside those stages)',
  prPhase: 'implementPhase (the implementer publishes the PR)',
}
const rejectUnknownKeys = (obj, allowed, where) => {
  for (const k of Object.keys(obj ?? {}))
    // An unrecognised key is an unvalidated value by another name: dropped in silence, it leaves
    // the caller believing they overrode something while pair's own default runs.
    if (!allowed.includes(k)) fail('pipeline-invalid', `unknown \`${where}.${k}\`; expected one of ${allowed.join(', ')}. An unrecognised key would be dropped in silence and the cycle would run pair's default while the caller believed otherwise.`)
}
function resolvePipeline(raw) {
  // `undefined`/`null` is ABSENT, not a bad value — one spelling for an unset optional key across
  // the whole contract, and the engine takes its default here rather than refusing.
  if (raw === undefined || raw === null) return PIPELINE_DEFAULTS
  if (typeof raw !== 'object' || Array.isArray(raw)) fail('pipeline-invalid', `--pipeline must be an object; received ${JSON.stringify(raw).slice(0, 60)}. Omit it entirely to run on pair's defaults.`)
  rejectUnknownKeys(raw, PIPELINE_KEYS, 'pipeline')
  const str = (v, key, fallback, ok, what) => {
    if (v === undefined || v === null) return fallback
    // `String(v)` on an object yields '[object Object]' and on a number a bare digit string, either
    // of which interpolates into a prompt as a name no agent can follow — and a predicate applied
    // to a raw value is unsound anyway (`isRelPath(5)` throws, `isSkillRef(5)` passes by coercion).
    // The TYPE is rejected first, never coerced.
    if (typeof v !== 'string') fail('pipeline-invalid', `\`pipeline.${key}\` must be a string; received ${typeof v}.`)
    const t = v.trim()
    // Trimmed, exactly as the engine's `str()` trims: '  main  ' is a value the engine ACCEPTS and
    // normalises, so halting on it would refuse what the other realization renders.
    if (!t) fail('pipeline-invalid', `\`pipeline.${key}\` is empty — omit the key to keep the default (${fallback}).`)
    if (!ok(t)) fail('pipeline-invalid', `\`pipeline.${key}\` is ${JSON.stringify(t)}, which is not ${what}. Pipeline values are interpolated verbatim into the prompts and command lines the agents run, so a value carrying shell syntax or a path escape would EXECUTE rather than name a ${key}. Rejected, never quoted.`)
    return t
  }
  // The NUMERIC keys, rejected rather than coerced: a cap that cannot be honoured must not silently
  // become pair's default — the discarded setting is the one deciding how much autonomous work
  // happens before a human is asked. `'2'` is the shape a hand-written JSON arg produces.
  const posInt = (v, key, fallback) => {
    if (v === undefined || v === null) return fallback
    if (!isPosInt(v)) fail('pipeline-invalid', `\`pipeline.${key}\` must be an integer >= 1; received ${JSON.stringify(v)}. Omit the key to keep pair's default (${fallback}) — it is never inferred from a bad value.`)
    return v
  }
  if (raw.skills !== undefined && raw.skills !== null && (typeof raw.skills !== 'object' || Array.isArray(raw.skills)))
    fail('pipeline-invalid', `\`pipeline.skills\` must be an object; received ${Array.isArray(raw.skills) ? 'array' : typeof raw.skills}. A non-object would be silently ignored and pair's own skill names would run instead. Omit the key to keep them deliberately.`)
  for (const k of Object.keys(raw.skills ?? {}))
    if (RETIRED_SKILL_KEYS[k]) fail('pipeline-invalid', `\`pipeline.skills.${k}\` was retired by engine 3.0.0 (ADR-024 amendment b) — its work now runs inside ${RETIRED_SKILL_KEYS[k]}. Remove the key; a retired dispatch is never mapped silently and never re-added.`)
  rejectUnknownKeys(raw.skills, Object.keys(PIPELINE_DEFAULTS.skills), 'pipeline.skills')
  const skills = { ...PIPELINE_DEFAULTS.skills }
  for (const [k, v] of Object.entries(raw.skills ?? {})) skills[k] = str(v, `skills.${k}`, PIPELINE_DEFAULTS.skills[k], isSkillRef, 'a skill name as an agent invokes one — no spaces, no shell syntax, no `..`')
  return {
    skills,
    worktreeRoot: str(raw.worktreeRoot, 'worktreeRoot', PIPELINE_DEFAULTS.worktreeRoot, isRelPath, 'a relative path built from safe segments (at most one leading `..`; it is the root a `--force` worktree remove is aimed at)'),
    auditLogDir: str(raw.auditLogDir, 'auditLogDir', PIPELINE_DEFAULTS.auditLogDir, isRelPath, 'a relative path built from safe segments (at most one leading `..`)'),
    baseBranch: str(raw.baseBranch, 'baseBranch', PIPELINE_DEFAULTS.baseBranch, isRef, "a valid git ref (it is the `<base>` argument of `git worktree add`, exactly like a card's `base`)"),
    reviewTemplate: str(raw.reviewTemplate, 'reviewTemplate', PIPELINE_DEFAULTS.reviewTemplate, isRelPath, 'a relative path built from safe segments (at most one leading `..`)'),
    maxFixRounds: posInt(raw.maxFixRounds, 'maxFixRounds', PIPELINE_DEFAULTS.maxFixRounds),
    reviewers: posInt(raw.reviewers, 'reviewers', PIPELINE_DEFAULTS.reviewers),
  }
}

function packetCommand(opts) {
  const next = JSON.parse(opts.next)
  const card = JSON.parse(opts.card)
  const policy = JSON.parse(opts.policy ?? '{}')
  // Omitted ⇒ the ONE pin, imported from cycle-state (never a literal here: a second spelling of
  // the state machine's identity is a fork of it — AC-12). The coordinator is an agent session, and
  // a value it has no producer for is a value it invents.
  const workflowVersion = opts['workflow-version'] ?? WORKFLOW_VERSION
  const pipeline = resolvePipeline(opts.pipeline === undefined ? undefined : JSON.parse(opts.pipeline))
  const SK = pipeline.skills
  // `$profile` (SKILL.md's reserved argument): absent ⇒ no override, exactly today's behavior.
  // Present but its `effort` unknown ⇒ HALT `profile-unresolved`, never a silent default — the
  // HALT this argument was reserved under before any consumer existed.
  const profile = opts.profile === undefined ? {} : JSON.parse(opts.profile)
  if (profile.effort !== undefined && !KNOWN_EFFORTS.includes(profile.effort))
    fail('profile-unresolved', `$profile.effort ${JSON.stringify(profile.effort)} is not one of ${KNOWN_EFFORTS.join(' | ')}`, { profile })
  const effort = profile.effort
  const runId = opts.run ?? `story-${card.id}`
  must(isSegment(String(card.id)), 'card-invalid', `card.id must be one safe path segment: ${card.id}`)
  must(isSegment(runId), 'run-invalid', `--run must be one safe path segment: ${runId}`)
  must(isRef(card.branch), 'card-invalid', `card.branch must be a git ref: ${card.branch}`)
  must(typeof workflowVersion === 'string' && workflowVersion.length > 0, 'workflow-version-missing', '--workflow-version is required')
  // Held to the grammar its own state machine owns, HERE — where the value enters. It is rendered
  // verbatim into the stage prompt an agent reads as its process of record AND keys the `$inputs`
  // digest both realizations must agree on, so `publish` would refuse it at the END of that whole
  // stage, with a contract written and no handoff recorded. Refused before a packet exists instead.
  must(isWorkflowVersion(workflowVersion), 'workflow-version-invalid', `--workflow-version must be <major>.<minor>.<patch>; received ${JSON.stringify(workflowVersion)}. Rejected, never rendered: no argument packet and no prompt are built from a version \`publish\` will refuse one agent dispatch from now.`)

  const tag = `#${card.id}`
  const worktreePath = `${pipeline.worktreeRoot}/${card.id}`
  const reviewWorktreePath = `${pipeline.worktreeRoot}/${card.id}-review`
  const storyBase = String(card.base ?? '').trim() || pipeline.baseBranch
  const stacked = storyBase !== pipeline.baseBranch
  const runDir = `.pair/working/runs/${runId}/${card.id}`
  const reviewLog = `${pipeline.auditLogDir}/${card.id}.md`
  const pr = isPosInt(next.pr) ? next.pr : isPosInt(card.prNumber) ? card.prNumber : null
  const firstReviewMarker = `<!-- pair:first-review #${card.id} PR#${pr} run:${runId} -->`
  const synthesisMarker = `<!-- pair:synthesis #${card.id} PR#${pr} run:${runId} -->`
  const inputs = effectiveInputs(card, { workflowVersion, pipeline, severityFloor: opts['severity-floor'] ?? DEFAULT_SEVERITY_FLOOR })
  const severityFloor = opts['severity-floor'] ?? DEFAULT_SEVERITY_FLOOR
  const blindPaths = [...new Set(['.pair/working/', pipeline.auditLogDir])].map(p => `\`${p}\``).join(' or ')

  const common = `$run=${runId} $story=${card.id} $branch=${card.branch} $worktree=${worktreePath} $base=${storyBase} $stacked=${stacked}${pr ? ` $pr=${pr}` : ''} $entry=${pr ? 'pr' : 'fresh'} $policy=${JSON.stringify(policy)} $inputs=${inputs}`
  // Best-effort only: an enforced dial exists for Codex (`-c model_reasoning_effort=<value>` on
  // the realization's own dispatch call, never rendered into the prompt text itself) but NOT for
  // Claude (the `Agent` tool the coordinator dispatches through has no effort parameter at all) —
  // so the SAME instruction line is honest about being a request, never a guarantee, whichever
  // realization is bound.
  const effortNote = effort
    ? ` Requested reasoning effort for this dispatch: **${effort}** (a process/mechanics run, not a quality bar — spend only the deliberation this step's Check/Act/Verify beats actually need). This is a request, not an enforced setting: honour it as best you can within your own harness's controls.`
    : ''
  const invoke = (skill, args) =>
    `Invoke **${skill}** for story ${tag} with ${args} $workflowVersion=${workflowVersion}. The skill is the process of record: execute its steps exactly, do not improvise or skip one, and return exactly the structured result it defines — its Step 0 resolves the durable cycle state and returns \`{ status: "redirect", next }\` when another step is due, spending no judgment. Do NOT read ${blindPaths} except the checkpoint and the run directory \`${runDir}/\` the skill names; that directory lives in the MAIN checkout — the working directory you were started in, before any cd — never inside a story or review worktree. Do NOT merge.${effortNote}`
  const notesArg = card.notes ? ` $notes=${JSON.stringify(card.notes)}` : ''
  const findingsArg = list => (list && list.length ? ` $findings=${JSON.stringify(list.map(compactFinding))}` : '')
  const n = next

  let skill
  let agentType
  let args
  let phaseLabel
  let worktree = worktreePath
  if (n.step === 'prepare') {
    skill = SK.redSpec
    agentType = 'pair-fix-test-author'
    phaseLabel = 'Prepare'
    args = `${common} $mode=${n.mode} $phase=${n.phase}${(n.attempt ?? 1) > 1 ? ` $attempt=${n.attempt}` : ''}${n.base ? ` $head=${n.base}` : ''}${n.mode === 'initial' ? ` $title=${JSON.stringify(card.title)}` : ''}${findingsArg(n.findings)}${n.group ? ` $scope=${JSON.stringify({ groupId: n.group.groupId, owner: n.group.owner, mode: n.group.mode, allowedPaths: n.group.allowedPaths, oracle: n.group.oracle })}` : ''}${n.rejection?.length ? ` $rejection=${JSON.stringify(n.rejection)}` : ''}${n.contract ? ` $contract=${JSON.stringify(n.contract.path)} $contractHash=${n.contract.hash}` : ''}${n.revision ? ` $revision=${n.revision}` : ''}${n.changedRows?.length ? ` $changedRows=${JSON.stringify(n.changedRows)}` : ''}${n.contradictionFor ? ` $contradictionFor=${JSON.stringify(n.contradictionFor)}` : ''}${n.revalidate?.length ? ` $revalidate=${JSON.stringify(n.revalidate)}` : ''}${n.regressionRisks?.length ? ` $regressionGuards=${JSON.stringify(n.regressionRisks)}` : ''}${n.regressionRepairOf ? ` $regressionRepairOf=${n.regressionRepairOf}` : ''}${n.reconstruct ? ` $reconstruct=${JSON.stringify(n.reconstruct)}` : ''}${n.predecessorRunId ? ` $predecessorRun=${JSON.stringify({ runId: n.predecessorRunId, phase: n.predecessorPhase })}` : ''}${notesArg}`
  } else if (n.step === 'validate') {
    skill = SK.redVerify
    agentType = 'pair-red-contract-verifier'
    phaseLabel = 'Validate'
    args = `${common} $phase=${n.phase}${(n.attempt ?? 1) > 1 ? ` $attempt=${n.attempt}` : ''}${n.regressionRisks?.length ? ` $regressionGuards=${JSON.stringify(n.regressionRisks)}` : ''} $head=${n.base} $contract=${JSON.stringify(n.contract.path)} $contractHash=${n.contract.hash}${findingsArg(n.findings)}${n.group ? ` $scope=${JSON.stringify({ groupId: n.group.groupId, owner: n.group.owner, mode: n.group.mode, allowedPaths: n.group.allowedPaths })}` : ''}`
  } else if (n.step === 'implement') {
    skill = SK.implementPhase
    agentType = 'pair-implementer'
    phaseLabel = 'Implement'
    args = `${common} $phase=${n.phase} $head=${n.base} $attempt=${n.attempt ?? 1} $snapshot=${n.contract.snapshot} $contract=${JSON.stringify(n.contract.path)} $title=${JSON.stringify(card.title)} $implementSkill=${SK.implement} $verifyQuality=${SK.verifyQuality} $recordDecision=${SK.recordDecision} $checkpoint=${SK.checkpoint} $publishPr=${SK.publishPr}${notesArg}`
  } else if (n.step === 'green') {
    skill = SK.greenFix
    agentType = 'pair-implementer'
    phaseLabel = 'Implement'
    args = `${common} $phase=${n.phase} $head=${n.base} $attempt=${n.attempt} $snapshot=${n.contract.snapshot} $contract=${JSON.stringify(n.contract.path)}${findingsArg(n.findings)}${n.regressionRisks?.length ? ` $regressionGuards=${JSON.stringify(n.regressionRisks)}` : ''}${n.reconstruct ? ` $reconstruct=${JSON.stringify(n.reconstruct)}` : ''} $reviewLog=${reviewLog} $marker=${JSON.stringify(firstReviewMarker)} $writeIssue=${SK.writeIssue}${notesArg}`
  } else if (n.step === 'verify') {
    skill = SK.reviewPhase
    agentType = 'pair-reviewer'
    phaseLabel = 'Verify'
    // The final verifier inspects from a DETACHED throwaway worktree: it must not see — and must
    // not be able to touch — the author's tree. The second `$worktree` deliberately overrides the
    // first, exactly as the engine composes it.
    worktree = reviewWorktreePath
    const required = opts.required ? JSON.parse(opts.required) : []
    const ranksArg = JSON.stringify(opts.ranks ? JSON.parse(opts.ranks) : DEFAULT_RANKS)
    const severities = opts.severities ?? DEFAULT_SEVERITIES.join(', ')
    const verdicts = opts.verdicts ?? DEFAULT_VERDICTS.join(', ')
    // The template contract is resolved BY the first review dispatch (no generator-only dispatch):
    // until the coordinator has seen one come back, every verify packet carries `$contractSpec`.
    const contractResolved = opts['contract-resolved'] === true || opts['contract-resolved'] === 'true'
    const contractSpec = {
      name: 'code-review',
      template: pipeline.reviewTemplate,
      contract: '.claude/workflows/pair-contracts/code-review.contract.json',
      skeleton: LOOSE_REVIEW_SCHEMA,
      mirrors: CONTRACT_MIRRORS,
      contractSkill: SK.contractPhase,
      workflowVersion,
    }
    args = `${common} $phase=${n.phase} $mode=${n.mode} $head=${n.base ?? ''} $worktree=${reviewWorktreePath} $reviewLog=${reviewLog} $marker=${JSON.stringify(firstReviewMarker)} $synthesisMarker=${JSON.stringify(synthesisMarker)} $template=${templateLabel(pipeline.reviewTemplate)} $severities=${JSON.stringify(severities)} $verdicts=${JSON.stringify(verdicts)}${severityFloor ? ` $floor=${severityFloor}` : ''} $ranks=${ranksArg} $attempt=${n.attempt ?? 1} $reviewer=${n.reviewer ?? 1} $reviewers=${pipeline.reviewers} $reviewSkill=${SK.review} $writeIssue=${SK.writeIssue}${n.prior ? ` $prior=${n.prior}` : ''}${n.openIds?.length ? ` $openIds=${JSON.stringify(n.openIds)}` : ''}${n.headMoved ? ' $headMoved=true' : ''}${n.inputsChanged ? ' $inputsChanged=true' : ''}${n.regressionRisks?.length ? ` $regressionGuards=${JSON.stringify(n.regressionRisks)}` : ''}${required.length ? ` $required=${JSON.stringify(required)}` : ''}${contractResolved ? '' : ` $contractSpec=${JSON.stringify(contractSpec)}`}`
  } else {
    fail('step-not-dispatchable', `\`${n.step}\` is a terminal state, not a stage — the coordinator reports it, it never dispatches it`, { step: n.step })
  }

  return emit({
    step: n.step,
    phase: n.phase,
    mode: n.mode ?? null,
    skill,
    agentType,
    phaseLabel,
    // `next.context` is the cycle state's decision, carried through untouched: the coordinator
    // honours it (fresh ⇒ spawn, reuse ⇒ resume the previous subagent of this role), never decides it.
    context: n.context ?? CONTEXT_TABLE.default,
    label: `${n.step}:${tag} ${n.phase}`,
    worktree,
    runDir,
    pr,
    // Present only when `$profile.effort` was given — absent (never `null`) preserves today's
    // behavior exactly for every caller that has not adopted a profile yet.
    ...(effort ? { effort } : {}),
    args,
    prompt: invoke(skill, args),
  })
}

// ── realization probe (AC-6) ────────────────────────────────────────────────────────────────
function realizationsCommand(opts) {
  const rows = REALIZATIONS.map(r => ({ ...r }))
  if (opts.tools === undefined) return emit({ realizations: rows, caps: CAPS })
  const tools = new Set(JSON.parse(opts.tools).map(String))
  // The row is bound by the PRIMITIVE, never by `--product`: a product name is an assertion about
  // the host, a present tool is evidence of it. `--product` is accepted and reported so the HALT
  // can say what claimed to be there, and it can never bind a row on its own.
  const bound = rows.find(r => tools.has(r.dispatch))
  if (!bound) {
    // AC-6's fallback command. The `--pr` half of `pair-cli run --card N [--pr P]` is OPTIONAL and
    // omitted when there is no PR: a line reading `--pr undefined` hands the operator a command
    // that does not run, which is the whole remedy this HALT owes them.
    const story = opts.story ?? '<card>'
    const fallback = `pair-cli run --card ${story}${opts.pr === undefined ? '' : ` --pr ${opts.pr}`}`
    fail('realization-unavailable', `no subagent primitive is present in this session (probed: ${[...tools].join(', ') || 'none'}${opts.product ? `; the host names itself "${opts.product}", which is not evidence` : ''}). Run the cycle from the command line instead: ${fallback}`, { fallback })
  }
  const resumeCandidates = RESUME_ALIASES[bound.id] ?? [bound.resume]
  const resume = resumeCandidates.find(t => tools.has(t)) ?? bound.resume
  return emit({ bound: bound.id, realization: { ...bound, resume }, realizations: rows })
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────
const FLAGS = {
  worktree: ['main', 'story', 'branch', 'base', 'worktree-root'],
  packet: ['next', 'card', 'policy', 'run', 'workflow-version', 'pipeline', 'profile', 'contract-resolved', 'required', 'severity-floor', 'severities', 'verdicts', 'ranks'],
  realizations: ['tools', 'product', 'story', 'pr'],
  'context-table': [],
}
function parseCli(argv) {
  const cmd = argv[0]
  const opts = {}
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) throw new Error(`unexpected argument: ${a}`)
    const key = a.slice(2)
    const nextArg = argv[i + 1]
    if (nextArg === undefined || nextArg.startsWith('--')) opts[key] = true
    else {
      opts[key] = nextArg
      i++
    }
  }
  return { cmd, opts }
}

try {
  const { cmd, opts } = parseCli(process.argv.slice(2))
  if (!FLAGS[cmd]) throw new Error(`unknown command: ${cmd} (expected worktree | packet | realizations | context-table)`)
  const unknown = Object.keys(opts).filter(k => !FLAGS[cmd].includes(k))
  if (unknown.length) throw new Error(`unknown flag(s) for ${cmd}: ${unknown.map(k => `--${k}`).join(', ')}`)
  const need = (...ks) => {
    for (const k of ks) if (opts[k] === undefined) throw new Error(`--${k} is required`)
  }
  if (cmd === 'worktree') {
    need('main', 'story', 'branch', 'base')
    OUT = worktreeCommand(opts)
  } else if (cmd === 'packet') {
    need('next', 'card')
    OUT = packetCommand(opts)
  } else if (cmd === 'realizations') {
    OUT = realizationsCommand(opts)
  } else if (cmd === 'context-table') {
    // Exposed, never copied: this prints cycle-state's own table (AC-12).
    OUT = emit({ ...CONTEXT_TABLE })
  }
} catch (e) {
  process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
  process.exit(2)
}
void OUT
