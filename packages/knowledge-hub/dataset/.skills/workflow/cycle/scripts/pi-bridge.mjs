#!/usr/bin/env node
// pi-bridge.mjs — the `pi` realization's translation layer over `pi-subagents` (US-503 T-4).
//
// Inside an interactive `pi` session the coordinator has no `Agent`/`SendMessage`: its subagent
// primitive is the `subagent` tool of the third-party `pi-subagents` package. This script turns
// the two operations the cycle needs — "dispatch a fresh stage" and "resume the same stage agent"
// — into the exact `subagent` tool arguments, and remembers the retained run id per role. It holds
// NO cycle rule (ADR-024 §7): which stage, which context (`fresh` / `reuse`) and which prompt all
// come from `cycle-state.mjs resolve` and `cycle-dispatch.mjs packet`, verbatim.
//
// It never spawns a process and never calls the tool itself: the coordinator's own session does,
// with the arguments printed here. Nothing is installed from here either — `probe` only reads.
//
// Commands
//   pin     the pinned package, its tool shape and the install lines, as data
//   probe   whether pi-subagents is installed (project, then user scope) and at which version
//   check   verify the `subagent` tool's name and parameters against the pinned version
//   call    render the `subagent` arguments for one stage packet (fresh, or resume on `reuse`)
//   record  store the run id a finished stage returned, for the next `reuse` of that role
//
// Every fact below was read off the pinned package itself (pi-subagents@0.71.0,
// `src/extension/index.js` registers the tool `subagent` with `createSubagentParamsSchema()`;
// `src/extension/tool-activation.js` names the loader `subagents_enable`; `docs/tool-reference.md`
// documents `runs.run(key, { agent, task })`, `runs.run(key, { resume: runId, task })` and that a
// revived child is a NEW process that is only told where the old session file is;
// `src/workflows/scripted-workflow.d.ts` declares the `WorkflowScriptChildResult` it resolves to —
// `runId` and `resumability`, NO session file; a retained run is resolvable only from the parent
// session that created it, `src/runs/background/async-resume.js`) and off pi's own
// package manager (`@earendil-works/pi-coding-agent@0.84.3`, `dist/core/package-manager.js`:
// npm packages install under `<agentDir>/npm/node_modules/<name>` for the user scope and
// `<cwd>/.pi/npm/node_modules/<name>` for the project scope).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── the pin, as DATA ────────────────────────────────────────────────────────────────────────
// The version #503's live probe verified (2026-09-23). Changing it is a data edit here plus the
// `verifiedAgainst` line in agent-harness/pi.md — never an inference from what is installed.
export const PIN = {
  package: 'pi-subagents',
  version: '0.71.0',
  tool: 'subagent',
  // Present in a fresh parent session before the full tool is: calling it makes `subagent`
  // available on the next request without launching work.
  activation: 'subagents_enable',
  // The top-level parameters `call` renders. A tool missing any of them cannot run what the bridge
  // hands it, whatever it is named.
  params: ['workflowScript', 'args', 'async', 'cwd'],
  // `pi-subagents@0.71.0` declares `@earendil-works/pi-ai >=0.86.1`; below it, dynamic tool
  // activation is unavailable (warned by the package itself during the probe on pi 0.84.3).
  piMin: '0.86.1',
  // The packaged, fresh-by-default writer agent with read/bash/edit/write — the pair role travels
  // inline in the prompt (`inline-role-body`), as it does for Codex.
  agent: 'worker',
}
const SPEC = `npm:${PIN.package}@${PIN.version}`
export const INSTALL = { user: `pi install ${SPEC}`, project: `pi install ${SPEC} -l` }

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
// Installed layout: <skills>/pair-workflow-cycle/scripts/pi-bridge.mjs ⇒ <skills>/<skill>/SKILL.md.
const SKILLS_DIR = resolvePath(SCRIPT_DIR, '..', '..')

function emit(obj, code = 0) {
  process.stdout.write(JSON.stringify(obj) + '\n')
  process.exitCode = code
  return obj
}
function fail(halt, detail, extra = {}) {
  emit({ halt, detail, ...extra }, 1)
  throw new Halted()
}
class Halted extends Error {}

const readJson = (path, what) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    fail('input-invalid', `${what} is not readable JSON: ${path} (${e.message})`, { path })
  }
}
const parseJson = (text, what) => {
  try {
    return JSON.parse(text)
  } catch (e) {
    fail('input-invalid', `${what} is not JSON: ${e.message}`)
  }
}

// ── probe: installed or not, and at which version ───────────────────────────────────────────
// `inPi` is a PROCESS MARKER, not a product name: pi sets `PI_CODING_AGENT=true` on every command
// its shell tools run (pi 0.84.3 `docs/environment-variables.md`), so a coordinator that runs this
// script through its own shell learns it is inside pi — and can offer the install instead of a
// bare `realization-unavailable`.
function probeCommand(opts) {
  const inPi = process.env.PI_CODING_AGENT === 'true'
  const project = resolvePath(opts.project ?? process.cwd())
  const agentDir = resolvePath(opts['agent-dir'] ?? join(homedir(), '.pi', 'agent'))
  const scopes = [
    ['project', join(project, '.pi', 'npm', 'node_modules', PIN.package, 'package.json')],
    ['user', join(agentDir, 'npm', 'node_modules', PIN.package, 'package.json')],
  ]
  for (const [scope, path] of scopes) {
    if (!existsSync(path)) continue
    const version = readJson(path, `${PIN.package} package.json`).version
    const status = version === PIN.version ? 'pinned' : 'drift'
    return emit({ inPi, status, scope, installed: version ?? null, pinned: PIN.version, path, install: INSTALL })
  }
  return emit({ inPi, status: 'missing', pinned: PIN.version, looked: scopes.map(([, p]) => p), install: INSTALL })
}

// ── check: the tool's shape, before any dispatch ───────────────────────────────────────────
// `--tool` is the tool definition as THIS session sees it: `{ name, parameters }`, `parameters`
// being the JSON schema object (its `properties` are what is checked). A name is never assumed.
function shapeOf(toolJson) {
  const tool = parseJson(toolJson, '--tool')
  const name = tool && typeof tool === 'object' ? tool.name : undefined
  const props = tool?.parameters?.properties
  const present = props && typeof props === 'object' ? Object.keys(props) : []
  const missing = PIN.params.filter(p => !present.includes(p))
  return { name, missing }
}
function assertShape(toolJson) {
  if (toolJson === undefined || toolJson === true) fail('usage', '--tool <JSON {name, parameters}> is required: the shape is checked before every dispatch, never assumed')
  const { name, missing } = shapeOf(toolJson)
  if (name !== PIN.tool || missing.length) {
    fail(
      'subagent-tool-mismatch',
      `the ${PIN.package} tool does not have the shape this bridge was verified against: expected a tool named \`${PIN.tool}\` with parameters ${PIN.params.join(', ')} (${PIN.package}@${PIN.version}); got ${name === undefined ? 'no name' : `\`${name}\``}${missing.length ? `, missing ${missing.join(', ')}` : ''}. Align it with \`${INSTALL.user}\` (or \`${INSTALL.project}\`) through /pair-capability-setup-harness with $harness: pi`,
      { expected: { tool: PIN.tool, params: PIN.params, version: PIN.version }, actual: { name: name ?? null, missing } },
    )
  }
  return { ok: true, tool: PIN.tool, version: PIN.version }
}

// ── the ledger: the latest retained run id per role, bound to its parent pi session ─────────
// pi exports the current session id to every command its shell tools run (`PI_SESSION_ID`,
// pi 0.84.3 `docs/environment-variables.md`); pi-subagents resumes a retained run only inside the
// parent session that created it. An entry is therefore resumable only when the session that
// records it and the session that calls are provably the same.
const currentSession = () => {
  const id = process.env.PI_SESSION_ID
  return typeof id === 'string' && id.trim() ? id.trim() : null
}
const readLedger = path => (existsSync(path) ? readJson(path, 'ledger') : { dispatches: 0, roles: {} })
const writeLedger = (path, ledger) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n')
}
const ledgerPath = (opts, packet) => {
  if (typeof opts.ledger === 'string') return resolvePath(opts.ledger)
  if (!packet?.runDir) fail('usage', '--ledger is required when the packet carries no runDir')
  return resolvePath(packet.runDir, 'pi-bridge.json')
}

// ── call: one packet ⇒ one `subagent` invocation ────────────────────────────────────────────
// The workflow scripts are constant text; every variable travels in `args` (plain JSON), so no
// prompt byte is ever spliced into JavaScript.
// They return only fields `WorkflowScriptChildResult` declares (pi-subagents@0.71.0).
const RETURN_LINE = 'return { runId: r.runId ?? null, ok: r.ok !== false, resumability: r.resumability ?? null };'
const FRESH_SCRIPT = ['const r = await runs.run(args.key, { agent: args.agent, context: "fresh", task: args.task });', RETURN_LINE].join('\n')
const RESUME_SCRIPT = ['const r = await runs.run(args.key, { resume: args.runId, task: args.task });', RETURN_LINE].join('\n')

function skillFileFor(skill, skillsDir) {
  const bare = String(skill ?? '').replace(/^\//, '')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(bare)) fail('packet-invalid', `the packet names no usable skill: ${JSON.stringify(skill)}`)
  const path = join(skillsDir, bare, 'SKILL.md')
  if (!existsSync(path)) fail('skill-missing', `the stage skill \`${bare}\` is not installed at ${path}: a pi-subagents child does not inherit the skills catalog, so it is pointed at the file — install the skills alongside this one`, { skill: bare, path })
  return path
}

// Deterministic rehydration. A pi-subagents resume is a NEW child that is told where the previous
// session file is and then left to decide whether to read it (observed in #503's live probe: the model
// chose to; a weaker one might not). The bridge removes that choice: the first instruction is
// always to read the file. The pinned result returns no session file, so the instruction points at
// the "Original session file: <path>" line the host's revive header prints above the follow-up
// (async-resume.js buildRevivedAsyncTask).
function rehydration(prev) {
  return [
    `You are the SAME ${prev.role} agent that ran \`${prev.label}\` (run ${prev.runId}). Your memory of that work is in your previous session file, named on the "Original session file" line above.`,
    'FIRST ACTION, before any other tool call: read that session file in full with the read tool. Then state in one line the last step you completed there. Only then continue with the task below.',
  ].join('\n')
}

function callCommand(opts) {
  if (opts.packet === undefined || opts.packet === true) fail('usage', '--packet <file with the cycle-dispatch.mjs packet JSON> is required')
  const shape = assertShape(opts.tool)
  const packet = readJson(resolvePath(opts.packet), '--packet')
  for (const k of ['step', 'phase', 'skill', 'agentType', 'prompt', 'worktree'])
    if (typeof packet[k] !== 'string' || !packet[k]) fail('packet-invalid', `the packet has no \`${k}\`: render it with cycle-dispatch.mjs packet --style instruction, never by hand`)
  const skillFile = skillFileFor(packet.skill, typeof opts['skills-dir'] === 'string' ? resolvePath(opts['skills-dir']) : SKILLS_DIR)
  const path = ledgerPath(opts, packet)
  const ledger = readLedger(path)
  const n = (ledger.dispatches ?? 0) + 1
  // A new stable workflow key per pass: pi-subagents reuses a key only for identical launches.
  const key = `${packet.step}-${packet.phase}-${n}`.replace(/[^A-Za-z0-9._-]/g, '-')
  const prev = ledger.roles?.[packet.agentType]
  const session = currentSession()
  const cwd = isAbsolute(packet.worktree) ? packet.worktree : resolvePath(packet.worktree)
  const task = `Read the stage skill first: ${skillFile}\n\n${packet.prompt}`
  let op = packet.context === 'reuse' ? 'resume' : 'fresh'
  const rejected = op === 'resume' && ledger.pending?.op === 'resume' && ledger.pending.role === packet.agentType
  // `reuse` degrades to a fresh stage whenever the retained run cannot be resumed here. The cycle is
  // re-entrant, so fresh is correct — and said once, never silent.
  const why =
    op !== 'resume'
      ? null
      : rejected
        ? // the previous resume of this role was never recorded: the host rejected it (the call
          // errored, no JSON) — a retry never re-resumes the same id
          `the previous resume of run ${ledger.pending.runId ?? '?'} was never recorded (rejected by the host)`
        : !prev?.runId
          ? `no retained ${packet.agentType} run in ${path}`
          : !prev.parentSession
            ? `retained run ${prev.runId} has no parent-session binding`
            : !session
              ? `no PI_SESSION_ID in this shell: run ${prev.runId} cannot be proven to belong to this pi session`
              : prev.parentSession !== session
                ? `run ${prev.runId} was retained by another pi session (${prev.parentSession}), not this one (${session})`
                : prev.resumability?.state === 'not-resumable'
                  ? `run ${prev.runId} is not-resumable: ${prev.resumability.reason ?? 'no reason given'}`
                  : null
  let degraded
  if (why) {
    op = 'fresh'
    degraded = `reuse→fresh: ${why}`
  }
  // A host-rejected run stays rejected: drop it from the role in this same write, so a later
  // overwrite of `pending` (an unrecorded fresh retry, another role's call) cannot revive it.
  if (rejected && ledger.roles?.[packet.agentType]?.runId === ledger.pending.runId) delete ledger.roles[packet.agentType]
  const args =
    op === 'resume'
      ? { key, runId: prev.runId, task: `${rehydration({ ...prev, role: packet.agentType })}\n\n${task}` }
      : { key, agent: PIN.agent, task }
  ledger.dispatches = n
  ledger.pending = { key, role: packet.agentType, label: packet.label ?? `${packet.step} ${packet.phase}`, op, parentSession: session, ...(op === 'resume' ? { runId: prev.runId } : {}) }
  writeLedger(path, ledger)
  return emit({
    tool: shape.tool,
    verifiedAgainst: `${PIN.package}@${PIN.version}`,
    op,
    ...(degraded ? { degraded } : {}),
    ledger: path,
    arguments: { workflowScript: op === 'resume' ? RESUME_SCRIPT : FRESH_SCRIPT, args, async: false, cwd },
  })
}

// ── record: what the finished stage returned ────────────────────────────────────────────────
function recordCommand(opts) {
  if (typeof opts.ledger !== 'string') fail('usage', '--ledger is required')
  if (typeof opts.result !== 'string') fail('usage', '--result <the JSON the workflow returned> is required')
  const path = resolvePath(opts.ledger)
  const ledger = readLedger(path)
  const pending = ledger.pending
  if (!pending) fail('nothing-pending', `no dispatch is pending in ${path}: record follows a call`)
  const result = parseJson(opts.result, '--result')
  const runId = typeof result?.runId === 'string' && result.runId.trim() ? result.runId.trim() : null
  const notResumable = result?.resumability?.state === 'not-resumable'
  // The run belongs to the session that dispatched it; a record from a different shell session binds nothing.
  const session = currentSession()
  const parentSession = pending.parentSession ?? session
  delete ledger.pending
  ledger.roles = ledger.roles ?? {}
  if (!runId || notResumable) {
    // Nothing to resume later: drop any stale id of that role, so a `reuse` cannot revive the wrong run.
    delete ledger.roles[pending.role]
    writeLedger(path, ledger)
    const reason = !runId
      ? 'the stage returned no runId'
      : `the host reported run ${runId} not-resumable (${result.resumability.reason ?? 'no reason given'})`
    return emit({ recorded: false, role: pending.role, reason: `${reason} — the next reuse of this role runs fresh` })
  }
  const bound = parentSession && (!session || session === parentSession) ? parentSession : null
  ledger.roles[pending.role] = { runId, parentSession: bound, label: pending.label }
  writeLedger(path, ledger)
  return emit({ recorded: true, role: pending.role, runId })
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────
const FLAGS = {
  pin: [],
  probe: ['project', 'agent-dir'],
  check: ['tool'],
  call: ['packet', 'tool', 'ledger', 'skills-dir'],
  record: ['ledger', 'result'],
}
function parseCli(argv) {
  const cmd = argv[0]
  const opts = {}
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) throw new Error(`unexpected argument: ${a}`)
    const nextArg = argv[i + 1]
    if (nextArg === undefined || nextArg.startsWith('--')) opts[a.slice(2)] = true
    else {
      opts[a.slice(2)] = nextArg
      i++
    }
  }
  return { cmd, opts }
}

if (process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { cmd, opts } = parseCli(process.argv.slice(2))
    if (!FLAGS[cmd]) throw new Error(`unknown command: ${cmd} (expected ${Object.keys(FLAGS).join(' | ')})`)
    const unknown = Object.keys(opts).filter(k => !FLAGS[cmd].includes(k))
    if (unknown.length) throw new Error(`unknown flag(s) for ${cmd}: ${unknown.map(k => `--${k}`).join(', ')}`)
    if (cmd === 'pin') emit({ ...PIN, install: INSTALL })
    else if (cmd === 'probe') probeCommand(opts)
    else if (cmd === 'check') emit(assertShape(opts.tool))
    else if (cmd === 'call') callCommand(opts)
    else if (cmd === 'record') recordCommand(opts)
  } catch (e) {
    if (!(e instanceof Halted)) emit({ error: e.message }, 2)
  }
}
