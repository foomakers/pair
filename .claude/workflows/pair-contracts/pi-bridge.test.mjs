// US-503 T-4 — `pi-bridge.mjs`, the `pi` realization's translation layer over `pi-subagents`.
//
// Hermetic: no `pi`, no `pi-subagents`, no network. The package's tool is stood in for by
// `stubSubagent` below, which holds the bridge to the documented contract of the pinned version
// (pi-subagents@0.71.0 `docs/tool-reference.md`): a `subagent` call carrying a `workflowScript`
// whose `runs.run(key, { agent, task })` starts a child and `runs.run(key, { resume, task })`
// revives a retained one — as a NEW child told only where the old session file is — returning a
// NEW `runId` each time. The stub child does what a stage does last: it publishes its handoff.
//
// RUNS FROM `.claude/workflows` ONLY, like cycle-coordinator.test.mjs: it drives the INSTALLED
// skill script through `../../skills/`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SKILLS = fileURLToPath(new URL('../../skills/', import.meta.url))
const BRIDGE = join(SKILLS, 'pair-workflow-cycle/scripts/pi-bridge.mjs')
const DISPATCH_CLI = join(SKILLS, 'pair-workflow-cycle/scripts/cycle-dispatch.mjs')

const run = (cli, args) => {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  let json = null
  try {
    json = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {}
  return { status: r.status, json, out: r.stdout + r.stderr }
}
const bridge = args => run(BRIDGE, args)

// The tool as a pi session lists it: name + JSON-schema parameters (pinned shape).
const PINNED_TOOL = {
  name: 'subagent',
  parameters: {
    type: 'object',
    properties: Object.fromEntries(['agent', 'task', 'action', 'id', 'message', 'workflowScript', 'args', 'context', 'async', 'cwd'].map(k => [k, {}])),
  },
}
const toolJson = (t = PINNED_TOOL) => JSON.stringify(t)

// ── the stub of pi-subagents' `subagent` tool ───────────────────────────────────────────────
function stubSubagent(argumentsObj, world) {
  assert.equal(typeof argumentsObj.workflowScript, 'string', 'a workflowScript call')
  assert.equal(argumentsObj.async, false, 'the coordinator blocks on the stage')
  const children = []
  const runs = {
    run: async (key, opts) => {
      assert.ok(!('agent' in opts && 'resume' in opts), '`resume` and `agent` are mutually exclusive')
      let task = opts.task
      if (opts.resume) {
        const prev = world.retained.get(opts.resume)
        assert.ok(prev, `resume names a retained run: ${opts.resume}`)
        // pi-subagents' own revive header (src/runs/background/async-resume.js).
        task = `You are reviving a previous subagent conversation.\n\nOriginal run: ${opts.resume}\nOriginal agent: ${prev.agent}\nOriginal session file: ${prev.sessionFile}\n\nFollow-up:\n${opts.task}`
      } else assert.equal(opts.context, 'fresh')
      const runId = `run-${++world.seq}`
      const sessionFile = join(world.sessions, `${runId}.jsonl`)
      const agent = opts.agent ?? world.retained.get(opts.resume).agent
      world.retained.set(runId, { agent, sessionFile })
      children.push({ key, runId, task, resume: opts.resume ?? null })
      // The stage's last act: publish its handoff where its prompt says the run dir is.
      const m = /run directory `([^`]+)\/`/.exec(task)
      assert.ok(m, 'the task carries the run directory the stage publishes to')
      mkdirSync(join(world.main, m[1]), { recursive: true })
      writeFileSync(join(world.main, m[1], `${key}.handoff.json`), JSON.stringify({ runId, key }))
      return { runId, sessionFile, ok: true, output: 'done' }
    },
  }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  return new AsyncFunction('runs', 'args', argumentsObj.workflowScript)(runs, argumentsObj.args).then(result => ({ result, children }))
}

function world() {
  const main = mkdtempSync(join(tmpdir(), 'us503-'))
  const sessions = join(main, 'sessions')
  mkdirSync(sessions)
  return { main, sessions, seq: 0, retained: new Map() }
}

function packetFor(w, next) {
  const r = run(DISPATCH_CLI, [
    'packet', '--next', JSON.stringify(next),
    '--card', JSON.stringify({ id: '42', title: 'T', branch: 'feature/US-42-x' }),
    '--policy', JSON.stringify({ maxFixRounds: 3 }), '--run', 'story-42', '--workflow-version', '4.0.1',
    '--style', 'instruction',
  ])
  assert.equal(r.status, 0, r.out)
  const file = join(w.main, `packet-${w.seq}-${next.step}.json`)
  writeFileSync(file, JSON.stringify(r.json))
  return { file, packet: r.json }
}

// ── pin / probe ─────────────────────────────────────────────────────────────────────────────
test('T4-pin: the pinned version is data, with the install lines for both scopes', () => {
  const r = bridge(['pin'])
  assert.equal(r.status, 0, r.out)
  assert.equal(r.json.package, 'pi-subagents')
  assert.equal(r.json.version, '0.71.0')
  assert.equal(r.json.tool, 'subagent')
  assert.equal(r.json.install.user, 'pi install npm:pi-subagents@0.71.0')
  assert.equal(r.json.install.project, 'pi install npm:pi-subagents@0.71.0 -l')
})

test('T4-probe: missing, pinned and drifted installs are told apart, project scope first', () => {
  const w = world()
  const agentDir = join(w.main, 'agent')
  const missing = bridge(['probe', '--project', w.main, '--agent-dir', agentDir])
  assert.equal(missing.json.status, 'missing')
  const put = (dir, version) => {
    mkdirSync(join(dir, 'node_modules', 'pi-subagents'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'pi-subagents', 'package.json'), JSON.stringify({ name: 'pi-subagents', version }))
  }
  put(join(agentDir, 'npm'), '0.72.1')
  const drift = bridge(['probe', '--project', w.main, '--agent-dir', agentDir])
  assert.deepEqual([drift.json.status, drift.json.scope, drift.json.installed, drift.json.pinned], ['drift', 'user', '0.72.1', '0.71.0'])
  put(join(w.main, '.pi', 'npm'), '0.71.0')
  const pinned = bridge(['probe', '--project', w.main, '--agent-dir', agentDir])
  assert.deepEqual([pinned.json.status, pinned.json.scope], ['pinned', 'project'])
})

// ── AC8: the shape check ────────────────────────────────────────────────────────────────────
test('AC8: the pinned tool shape passes the check', () => {
  const r = bridge(['check', '--tool', toolJson()])
  assert.equal(r.status, 0, r.out)
  assert.equal(r.json.ok, true)
})

test('AC8: a renamed tool or a missing parameter is refused, typed, naming the expected version', () => {
  const renamed = bridge(['check', '--tool', toolJson({ ...PINNED_TOOL, name: 'subagents' })])
  assert.equal(renamed.status, 1)
  assert.equal(renamed.json.halt, 'subagent-tool-mismatch')
  assert.equal(renamed.json.expected.version, '0.71.0')
  assert.match(renamed.json.detail, /pi-subagents@0\.71\.0/)
  const props = { ...PINNED_TOOL.parameters.properties }
  delete props.workflowScript
  const narrowed = bridge(['check', '--tool', toolJson({ name: 'subagent', parameters: { properties: props } })])
  assert.equal(narrowed.json.halt, 'subagent-tool-mismatch')
  assert.deepEqual(narrowed.json.actual.missing, ['workflowScript'])
  const absent = bridge(['check'])
  assert.equal(absent.json.halt, 'usage', 'no tool given is never an assumed shape')
})

test('AC8: `call` checks the shape before rendering anything, and writes no ledger on a mismatch', () => {
  const w = world()
  const { file } = packetFor(w, { step: 'implement', mode: 'initial', phase: 'a0', round: 0, attempt: 1, context: 'fresh' })
  const ledger = join(w.main, 'ledger.json')
  const r = bridge(['call', '--packet', file, '--ledger', ledger, '--tool', toolJson({ name: 'task' })])
  assert.equal(r.json.halt, 'subagent-tool-mismatch')
  assert.equal(existsSync(ledger), false)
})

// ── fresh, then resume on `reuse`: both publish the handoff, the resume is the SAME agent ────
test('T4: fresh dispatch then same-agent resume — both publish the handoff; the resume revives the retained run and rehydrates deterministically', async () => {
  const w = world()
  const ledger = join(w.main, 'ledger.json')
  // implement (fresh)
  const impl = packetFor(w, { step: 'implement', mode: 'initial', phase: 'a0', round: 0, attempt: 1, context: 'fresh' })
  const c1 = bridge(['call', '--packet', impl.file, '--ledger', ledger, '--tool', toolJson()])
  assert.equal(c1.status, 0, c1.out)
  assert.equal(c1.json.op, 'fresh')
  assert.equal(c1.json.tool, 'subagent')
  assert.equal(c1.json.arguments.args.agent, 'worker')
  assert.match(c1.json.arguments.args.task, /pair-workflow-implement-phase\/SKILL\.md/, 'the child is pointed at the skill file')
  assert.ok(c1.json.arguments.args.task.includes(impl.packet.prompt), 'the packet prompt travels verbatim')
  const s1 = await stubSubagent(c1.json.arguments, w)
  assert.equal(s1.children.length, 1)
  assert.ok(existsSync(join(w.main, '.pair/working/runs/story-42/42', `${s1.children[0].key}.handoff.json`)), 'fresh stage published its handoff')
  const r1 = bridge(['record', '--ledger', ledger, '--result', JSON.stringify(s1.result)])
  assert.equal(r1.json.recorded, true)
  // green (reuse ⇒ resume the implementer)
  const green = packetFor(w, { step: 'green', mode: 'remediation', phase: 'r1', round: 1, attempt: 1, context: 'reuse', snapshot: 'a'.repeat(40), contract: '/c.json', base: 'b'.repeat(40), pr: 7 })
  assert.equal(green.packet.agentType, impl.packet.agentType, 'green runs as the same role')
  const c2 = bridge(['call', '--packet', green.file, '--ledger', ledger, '--tool', toolJson()])
  assert.equal(c2.status, 0, c2.out)
  assert.equal(c2.json.op, 'resume')
  assert.equal(c2.json.arguments.args.runId, s1.result.runId, 'resumes the retained run, not a new agent')
  assert.notEqual(c2.json.arguments.args.key, s1.children[0].key, 'a new workflow key per pass')
  const task = c2.json.arguments.args.task
  assert.ok(task.startsWith('You are the SAME'), 'rehydration leads the task')
  assert.ok(task.includes(s1.result.sessionFile), 'names the prior session file by path')
  assert.match(task, /FIRST ACTION, before any other tool call: read that session file in full/)
  const s2 = await stubSubagent(c2.json.arguments, w)
  assert.equal(s2.children[0].resume, s1.result.runId)
  assert.ok(existsSync(join(w.main, '.pair/working/runs/story-42/42', `${s2.children[0].key}.handoff.json`)), 'resumed stage published its handoff')
  bridge(['record', '--ledger', ledger, '--result', JSON.stringify(s2.result)])
  // a second green resumes from the LATEST run id
  const c3 = bridge(['call', '--packet', green.file, '--ledger', ledger, '--tool', toolJson()])
  assert.equal(c3.json.arguments.args.runId, s2.result.runId)
})

test('T4: `reuse` with no retained run of that role degrades to fresh and says so', () => {
  const w = world()
  const green = packetFor(w, { step: 'green', mode: 'remediation', phase: 'r1', round: 1, attempt: 1, context: 'reuse', snapshot: 'a'.repeat(40), contract: '/c.json', base: 'b'.repeat(40), pr: 7 })
  const r = bridge(['call', '--packet', green.file, '--ledger', join(w.main, 'l.json'), '--tool', toolJson()])
  assert.equal(r.status, 0, r.out)
  assert.equal(r.json.op, 'fresh')
  assert.match(r.json.degraded, /reuse→fresh/)
})

test('T4: a stage that returns no runId clears the role, so a later reuse never revives a stale run', () => {
  const w = world()
  const ledger = join(w.main, 'l.json')
  writeFileSync(ledger, JSON.stringify({ dispatches: 1, roles: { 'pair-implementer': { runId: 'old', sessionFile: null, label: 'x' } }, pending: { key: 'k', role: 'pair-implementer', label: 'y', op: 'fresh' } }))
  const r = bridge(['record', '--ledger', ledger, '--result', JSON.stringify({ runId: null })])
  assert.equal(r.json.recorded, false)
  assert.equal(JSON.parse(readFileSync(ledger, 'utf8')).roles['pair-implementer'], undefined)
})

test('T4: the bridge spawns nothing — no process, so no stdin to leave open', () => {
  const src = readFileSync(BRIDGE, 'utf8')
  assert.doesNotMatch(src, /node:child_process|require\(['"]child_process/)
})
