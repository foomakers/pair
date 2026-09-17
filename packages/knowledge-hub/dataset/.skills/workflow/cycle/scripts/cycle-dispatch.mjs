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
import { CAPS, CONTEXT_TABLE, PIPELINE_DEFAULTS, DEFAULT_SEVERITY_FLOOR, effectiveInputs } from './cycle-state.mjs'

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
    dispatch: 'spawn_agent',
    resume: 'resume_agent',
    // Codex has no `agentType`: the role travels as the agent `.md` body plus the skill reference.
    rolePacket: 'inline-role-body',
  },
]
// Alternate resume primitives a host may expose instead of the row's canonical one. Probed the
// same way; the row is still bound by its dispatch primitive.
const RESUME_ALIASES = { codex: ['resume_agent', 'send_input'] }

// ── validation (values reaching git) ────────────────────────────────────────────────────────
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/
const SAFE_REF = /^[A-Za-z0-9._\-/]+$/
const UNSAFE = /(^-)|(^\.)|(\.\.)|(\/\/)|(@\{)|([\s~^:?*[\\])/
const isSegment = v => typeof v === 'string' && SAFE_SEGMENT.test(v) && !v.includes('..')
const isRef = v => typeof v === 'string' && v.length > 0 && SAFE_REF.test(v) && !UNSAFE.test(v) && !v.endsWith('/') && !v.endsWith('.lock')
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
  const worktreeRoot = opts['worktree-root'] ?? PIPELINE_DEFAULTS.worktreeRoot
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

function packetCommand(opts) {
  const next = JSON.parse(opts.next)
  const card = JSON.parse(opts.card)
  const policy = JSON.parse(opts.policy ?? '{}')
  const workflowVersion = opts['workflow-version']
  const pipeline = { ...PIPELINE_DEFAULTS, ...(opts.pipeline ? JSON.parse(opts.pipeline) : {}), skills: { ...PIPELINE_DEFAULTS.skills, ...(opts.pipeline ? (JSON.parse(opts.pipeline).skills ?? {}) : {}) } }
  const SK = pipeline.skills
  const runId = opts.run ?? `story-${card.id}`
  must(isSegment(String(card.id)), 'card-invalid', `card.id must be one safe path segment: ${card.id}`)
  must(isSegment(runId), 'run-invalid', `--run must be one safe path segment: ${runId}`)
  must(isRef(card.branch), 'card-invalid', `card.branch must be a git ref: ${card.branch}`)
  must(typeof workflowVersion === 'string' && workflowVersion.length > 0, 'workflow-version-missing', '--workflow-version is required')

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
  const invoke = (skill, args) =>
    `Invoke **${skill}** for story ${tag} with ${args} $workflowVersion=${workflowVersion}. The skill is the process of record: execute its steps exactly, do not improvise or skip one, and return exactly the structured result it defines — its Step 0 resolves the durable cycle state and returns \`{ status: "redirect", next }\` when another step is due, spending no judgment. Do NOT read ${blindPaths} except the checkpoint and the run directory \`${runDir}/\` the skill names; that directory lives in the MAIN checkout — the working directory you were started in, before any cd — never inside a story or review worktree. Do NOT merge.`
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
  packet: ['next', 'card', 'policy', 'run', 'workflow-version', 'pipeline', 'contract-resolved', 'required', 'severity-floor', 'severities', 'verdicts', 'ranks'],
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
    need('next', 'card', 'workflow-version')
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
