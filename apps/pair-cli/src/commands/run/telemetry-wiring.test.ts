// #661 review r0 (r1-g1): production-path witnesses — real driver, reader and report; only host processes and engine output are stubbed.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { hostname, tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { afterEach, expect, it, vi } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { readTelemetryRecords, summarizeTelemetry } from './telemetry-report'
import {
  appendTelemetry,
  readTelemetry,
  stageTelemetryRecord,
  telemetryFile,
  type TelemetryRecord,
} from './telemetry'
import { envelope } from './telemetry-trace'

vi.mock('child_process', async importOriginal => ({
  ...(await importOriginal<typeof import('child_process')>()),
}))

const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  roots.splice(0).forEach(root => {
    rmSync(root, { recursive: true, force: true })
  })
})

const usageStream =
  [
    { type: 'thread.started', thread_id: 't' },
    {
      type: 'turn.completed',
      usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 0 },
    },
  ]
    .map(event => JSON.stringify(event))
    .join('\n') + '\n'

type Answer = Record<string, unknown>
type Signal = 'SIGTERM' | 'SIGINT'

interface Options {
  resolves: (call: number, fire: (signal: Signal) => void) => Answer
  request?: Record<string, unknown>
  telemetry?: boolean
  hang?: boolean
  packet?: Answer | ((n: number, root: string) => Answer)
  recover?: (call: number) => Answer
  root?: string
  setup?: (root: string) => void
  exitCode?: number
  timeoutSeconds?: number
  /** A stage running on a second engine: `green` runs on `claude` (the same stub executable). */
  secondEngine?: boolean
}

/** Starts the production driver; `result` settles with the outcome. Modules are fresh per launch (interrupt state is process-global). */
async function launch(options: Options) {
  vi.resetModules()
  const childProcess = await import('child_process')
  const hostProcess = await import('./host-process.js')
  const { createDefaultCycleDriver } = await import('./cycle-wiring.js')
  const { ENGINES } = await import('./engines.js')
  const { whileInterruptible } = await import('./interrupt.js')
  const root = options.root ?? mkdtempSync(join(tmpdir(), 'pair-661w-'))
  mkdirSync(join(root, '.git'), { recursive: true })
  if (options.root === undefined) roots.push(root)
  options.setup?.(root)
  const seen = join(root, 'engine-saw.txt')
  const release = join(root, 'release')
  const executable = join(root, 'stub-engine')
  writeFileSync(
    executable,
    `#!${process.execPath}\nconst fs = require('fs')\n` +
      `fs.writeFileSync(${JSON.stringify(seen)}, fs.existsSync(${JSON.stringify(telemetryFile(root))}) ? fs.readFileSync(${JSON.stringify(telemetryFile(root))}, 'utf8') : '')\n` +
      (options.hang === true
        ? `while (!fs.existsSync(${JSON.stringify(release)})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)\n`
        : '') +
      `process.stdout.write(${JSON.stringify(usageStream)})\nprocess.exitCode = ${options.exitCode ?? 0}\n`,
  )
  chmodSync(executable, 0o755)
  const gitCalls: string[][] = []
  vi.spyOn(childProcess, 'execFileSync').mockImplementation((command, args) => {
    const argv = args as readonly string[]
    if (command === 'gh' && argv[0] === 'issue')
      return JSON.stringify({ title: 'T', body: '', labels: [] })
    if (command === 'git' && argv[0] === 'rev-parse')
      return argv.includes('--show-toplevel') ? root : join(root, '.git')
    if (command === 'git') {
      gitCalls.push([...argv])
      return ''
    }
    throw new Error(`Unexpected host process: ${String(command)}`)
  })
  const listeners = new Map<Signal, (signal: Signal) => void>()
  let exit: (code: number) => void = () => undefined
  const exited = new Promise<number>(resolve => {
    exit = resolve
  })
  void whileInterruptible(
    () => undefined,
    () => new Promise<never>(() => undefined),
    {
      on: (signal, listener) => listeners.set(signal, listener),
      off: () => undefined,
      exit: code => exit(code),
    },
  )
  const fire = (signal: Signal) => listeners.get(signal)?.(signal)
  let resolves = 0
  let recovers = 0
  let packets = 0
  const packetFor = (): Answer => {
    const given = options.packet
    return typeof given === 'function'
      ? given((packets += 1), root)
      : (given ?? { step: 'implement', phase: 'a0', worktree: root, prompt: 'probe' })
  }
  const answers: Answer = {
    'bind-hosts': { action: 'bound', binding: { pmTool: 'github', codeHost: null } },
    inputs: { inputsDigest: 'x' },
    'ac-hash': { acHash: 'x' },
    bind: { action: 'bound' },
    worktree: { path: root, reused: true, created: false, branch: 'fixture' },
    check: { mergeAllowed: false, reason: 'parked' },
  }
  vi.spyOn(childProcess, 'spawnSync').mockImplementation((command, args) => {
    const argv = args as readonly string[]
    if (command === 'git')
      return { pid: 0, output: [], stdout: '', stderr: '', status: 0, signal: null }
    const cmd = argv[1]!
    const answer =
      cmd === 'resolve'
        ? options.resolves((resolves += 1), fire)
        : cmd === 'recover'
          ? (options.recover?.((recovers += 1)) ?? { allowed: false, round: 0, budget: 0 })
          : cmd === 'packet'
            ? packetFor()
            : answers[cmd]
    if (answer === undefined) throw new Error(`Unexpected coordinator command: ${cmd}`)
    return {
      pid: 0,
      output: [],
      stdout: JSON.stringify(answer),
      stderr: '',
      status: 0,
      signal: null,
    }
  })
  vi.spyOn(hostProcess, 'runHostProcess').mockImplementation(async (bin, args) => {
    if (bin === 'gh')
      return { status: 0, stdout: String(childProcess.execFileSync(bin, [...args])), stderr: '' }
    const result = childProcess.spawnSync(bin, [...args], { encoding: 'utf8' })
    return { status: result.status, stdout: result.stdout, stderr: result.stderr }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  let time = 0
  vi.spyOn(Date, 'now').mockImplementation(() => (time += 10))
  const result = createDefaultCycleDriver({
    telemetryEnabled: options.telemetry ?? true,
    engine: { ...ENGINES.codex, command: executable },
    ...(options.secondEngine === true && {
      profile: {
        name: 'p',
        stages: {
          green: {
            engine: { value: 'claude' },
            model: { resolved: { id: null } },
            effort: { value: 'default' },
            context: { value: undefined },
          },
        },
      } as never,
      stageEngines: {
        claude: { engine: { ...ENGINES.claude, command: executable }, autonomyArgs: [] },
      },
    }),
    cwd: root,
    fs: new InMemoryFileSystemService({}, root, root),
    location: { scriptsDir: join(root, 'scripts') },
    autonomyArgs: [],
    timeoutSeconds: options.timeoutSeconds ?? 5,
    workflowVersion: '4.0.1',
    baseBranch: 'origin/main',
  })({ runId: 'run-a', card: '661', ...options.request } as never)
  return { root, result, fire, exited, gitCalls, seen, release }
}

const drive = async (options: Options) => {
  const run = await launch(options)
  return { ...run, outcome: await run.result }
}

const implement = { step: 'implement', phase: 'a0', attempt: 1 }
const doneAfter =
  (calls: number, next: Answer = implement): Options['resolves'] =>
  call =>
    call > calls
      ? { status: 'done', next: { step: 'done' } }
      : { status: 'in-progress', policy: {}, next }

const all = (root: string, kind: string): TelemetryRecord[] =>
  readTelemetryRecords(root).filter(r => r.kind === kind)

// r0-1 (a) AC-2/AC-5: a signal during the resolve that follows a finished stage must not turn it into an interrupted failure.
it('AC-5 r0-1: signal in the next resolve ⇒ finished stage ends ok with its tokens, one end', async () => {
  const { root } = await drive({
    resolves: (call, fire) => {
      if (call === 3) fire('SIGTERM')
      return doneAfter(2)(call, fire)
    },
  })
  const ends = all(root, 'end')
  expect(ends).toHaveLength(1)
  expect(ends[0]).toMatchObject({ outcome: 'ok', tokens: { freshIn: 10 } })
  expect(ends[0]!['cause'] ?? null).toBeNull()
})

// r0-1 (b) AC-5: a throw in the next resolve still leaves the stage ended and the crash listener removed.
it('AC-5 r0-1: throw in the next resolve ⇒ one end before the driver rejects, listener removed', async () => {
  const before = process.listenerCount('uncaughtExceptionMonitor')
  const run = await launch({
    resolves: call => {
      if (call === 3) throw new Error('boom-resolve')
      return doneAfter(2)(call, () => undefined)
    },
  })
  await expect(run.result).rejects.toThrow()
  const ends = all(run.root, 'end')
  expect(ends).toHaveLength(1)
  expect(ends[0]!['outcome'] === 'ok' || ends[0]!['cause'] === 'crashed').toBe(true)
  expect(process.listenerCount('uncaughtExceptionMonitor')).toBe(before)
})

// r0-1 (c) AC-2: end.durationMs is the engine's own, equal to the v1 stage record of the same dispatch.
it('AC-2 r0-1: end durationMs equals the v1 stage durationMs of the same dispatch', async () => {
  const { root } = await drive({ resolves: doneAfter(2) })
  const stage = readTelemetry(root, 'run-a', '661')[0]!
  expect(all(root, 'end')[0]).toMatchObject({ durationMs: stage['durationMs'] })
})

// r0-1 (d) AC-2/AC-5: the end's outcome and cause are the engine's own result, not a constant: a failed or timed-out engine is never recorded ok.
it.each([
  [
    'engine exits non-zero (exit code never read, #451 AC7: complete stream = ok)',
    { exitCode: 3 },
    'ok',
    null,
  ],
  ['engine times out (stalled)', { hang: true, timeoutSeconds: 1 }, 'failed', 'stalled'],
])('AC-2 r0-1: %s ⇒ one end, outcome as v1, cause per C4', async (_name, extra, outcome, cause) => {
  const { root } = await drive({ ...extra, resolves: doneAfter(2) })
  const ends = all(root, 'end')
  expect(ends).toHaveLength(1)
  const stage = readTelemetry(root, 'run-a', '661')[0]!
  expect(stage['outcomeClass']).toBe(outcome)
  expect(ends[0]).toMatchObject({ outcome, durationMs: stage['durationMs'] })
  expect(ends[0]!['cause'] ?? null).toBe(cause)
})

// r0-2 AC-8: a single-engine card still reads its measures per engine.
it('AC-8 r0-2: summarizeTelemetry attributes card rounds, wallMs, activeMs, idleMs to the engine that ran its stages', async () => {
  const { root } = await drive({ resolves: doneAfter(2) })
  const codex = summarizeTelemetry(readTelemetryRecords(root))['codex']
  for (const key of ['rounds', 'wallMs', 'activeMs', 'idleMs'] as const)
    expect(codex?.[key], key).toMatchObject({ mean: expect.any(Number) })
})

// r0-2 AC-8 (+C5: no single engine per card). The spec states no rule for a card whose stages ran on two engines;
// A-1 (most restrictive reading): each engine that ran at least one stage of the card receives the card's own
// rounds/wallMs/activeMs/idleMs (the card counted in each of its engines' cohorts), an engine that ran none receives nothing.
it('AC-8 r0-2: a card with stages on two engines is attributed to each of them, to no other', async () => {
  const { root } = await drive({
    secondEngine: true,
    packet: (n, root) => ({
      step: n === 1 ? 'implement' : 'green',
      phase: n === 1 ? 'a0' : 'r1-g1',
      worktree: root,
      prompt: 'probe',
    }),
    resolves: (call): Answer =>
      call > 4
        ? { status: 'done', next: { step: 'done' } }
        : {
            status: 'in-progress',
            policy: {},
            next: call <= 2 ? implement : { step: 'green', phase: 'r1-g1', round: 1, attempt: 1 },
          },
  })
  const card = all(root, 'card')[0]!
  const summary = summarizeTelemetry(readTelemetryRecords(root))
  expect(Object.keys(summary).sort()).toEqual(['claude', 'codex'])
  for (const engine of ['codex', 'claude'])
    for (const key of ['rounds', 'wallMs', 'activeMs', 'idleMs'] as const)
      expect(summary[engine]?.[key], `${engine}.${key}`).toMatchObject({ mean: card[key] })
})

// r0-3 AC-6 C2 / AC-7 C5: the stage's round is carried on its end and on the card's stageRecords.
it('AC-6/7 r0-3: round 1 on the stage end and on the card stageRecords', async () => {
  const green = { step: 'green', phase: 'r1-g1', round: 1, attempt: 1 }
  const { root } = await drive({
    resolves: doneAfter(2, green),
    packet: { step: 'green', phase: 'r1-g1', prompt: 'probe' },
  })
  expect(all(root, 'end')[0]).toMatchObject({ step: 'green', phase: 'r1-g1', round: 1 })
  const card = all(root, 'card')[0]!
  expect(card['stageRecords']).toMatchObject([{ round: 1 }])
})

const recovering = (): Options => ({
  resolves: () => ({ status: 'in-progress', policy: { deadDispatchRetries: 0 }, next: implement }),
  recover: call =>
    call === 1 ? { allowed: true, round: 1, budget: 2 } : { allowed: false, round: 0, budget: 2 },
})
const recoveryEvents = (root: string) =>
  all(root, 'event').filter(r => r['event'] === 'recovery-round')

// r0-5 AC-3: a granted recovery round is exactly one recovery-round event.
it('AC-3 r0-5: a granted recovery round writes one recovery-round event', async () => {
  const { root } = await drive(recovering())
  expect(recoveryEvents(root)).toHaveLength(1)
})

// r0-3 AC-6 C2: that event carries the granted round as its key.
it('AC-6 r0-3: the recovery-round event carries round 1', async () => {
  const { root } = await drive(recovering())
  expect(recoveryEvents(root)[0]).toMatchObject({ round: 1, budget: 2 })
})

// r0-4 story edge: telemetry off ⇒ nothing — the two telemetry-only sha lookups (base, head) are not made.
it('Edge r0-4: telemetry off makes two fewer git ls-remote calls than telemetry on', async () => {
  const lsRemote = async (telemetry: boolean) =>
    (await drive({ telemetry, resolves: doneAfter(2) })).gitCalls.filter(
      argv => argv[0] === 'ls-remote',
    ).length
  const on = await lsRemote(true)
  expect(await lsRemote(false)).toBe(on - 2)
})

// r0-5 AC-1: the start is on disk before the engine is spawned.
it('AC-1 r0-5: the stage start is already on disk when the engine runs', async () => {
  const { seen } = await drive({ resolves: doneAfter(2) })
  expect(readFileSync(seen, 'utf8')).toContain('"kind":"start"')
})

// r0-5 AC-3: a non-park, non-success stop is a halt event.
it('AC-3 r0-5: a blocked terminal is one halt event', async () => {
  const { root } = await drive({
    resolves: call =>
      call > 1
        ? { status: 'in-progress', next: { step: 'blocked', reason: 'boom-halt' } }
        : { status: 'in-progress', policy: {}, next: implement },
  })
  expect(all(root, 'event')).toMatchObject([{ event: 'halt', status: 'boom-halt' }])
})

// r0-5 AC-5: a SIGTERM through whileInterruptible mid-stage ends the open stage once, interrupted + signal.
it('AC-5 r0-5: SIGTERM mid-stage ⇒ one end failed, cause interrupted, signal SIGTERM', async () => {
  const run = await launch({ hang: true, resolves: doneAfter(2) })
  await vi.waitFor(() => expect(all(run.root, 'start')).toHaveLength(1))
  run.fire('SIGTERM')
  await run.exited
  const ends = all(run.root, 'end')
  expect(ends).toHaveLength(1)
  expect(ends[0]).toMatchObject({ outcome: 'failed', cause: 'interrupted', signal: 'SIGTERM' })
  await run.result.catch(() => undefined)
})

// r0-5 AC-5: an uncaught exception mid-stage ends the open stage once, cause crashed.
it('AC-5 r0-5: uncaught exception mid-stage ⇒ one end failed, cause crashed', async () => {
  const run = await launch({ hang: true, resolves: doneAfter(2) })
  await vi.waitFor(() => expect(all(run.root, 'start')).toHaveLength(1))
  const monitor = process as NodeJS.EventEmitter
  monitor.emit('uncaughtExceptionMonitor', new Error('boom'), 'uncaughtException')
  writeFileSync(run.release, '')
  await run.result.catch(() => undefined)
  const ends = all(run.root, 'end')
  expect(ends).toHaveLength(1)
  expect(ends[0]).toMatchObject({ outcome: 'failed', cause: 'crashed' })
})

// r0-5 AC-5: an orphan start with a dead pid left by an earlier run is swept as lost when the next run starts.
it('AC-5 r0-5: an orphan start of a dead pid is ended lost by the next run', async () => {
  const { root } = await drive({
    resolves: doneAfter(2),
    setup: dir =>
      appendTelemetry(
        dir,
        envelope(
          { kind: 'start', id: 'old:661:implement:a0:start:0.1000', ts: 1000 },
          { run: 'old', card: '661', step: 'implement', phase: 'a0' },
          { pid: 2 ** 31 - 2, host: hostname() },
        ),
      ),
  })
  expect(
    all(root, 'end').find(r => r['startId'] === 'old:661:implement:a0:start:0.1000'),
  ).toMatchObject({
    outcome: 'failed',
    cause: 'lost',
  })
})

// r0-5 AC-7: the card aggregates its stages across runs.
it('AC-7 r0-5: a second run of the card records stageRecords of both runs', async () => {
  const first = await drive({ resolves: doneAfter(2) })
  const second = await drive({
    root: first.root,
    request: { runId: 'run-b' },
    resolves: doneAfter(2),
  })
  const card = all(second.root, 'card').find(r => r['run'] === 'run-b')!
  expect(card['stageRecords']).toHaveLength(2)
})

const report = (argv: string[]) =>
  spawnSync(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', join(__dirname, 'telemetry-report.ts'), ...argv],
    { encoding: 'utf8' },
  )
const reportRoot = (seed = false) => {
  const root = mkdtempSync(join(tmpdir(), 'pair-661r-'))
  roots.push(root)
  if (seed)
    appendTelemetry(
      root,
      stageTelemetryRecord({
        id: 'seed-1',
        run: 'run-in-root',
        card: '661',
        step: 'implement',
        start: 0,
        end: 10,
        previousEnd: 0,
        engine: 'codex',
        processOutcome: 'success',
        retries: 0,
        observation: {},
      }),
    )
  return root
}

// r0-6 AC-8: `--by` without a value is invalid like a bad value; a valid view is accepted.
it.each([
  ['trailing --by', ['--by'], 1, '--by: expected one of'],
  ['bad value', ['--by', 'bogus'], 1, '--by: expected one of'],
  ['valid value', ['--by', 'run'], 0, ''],
])('AC-8 r0-6: %s ⇒ exit %i', (_name, extra, status, message) => {
  const out = report([reportRoot(), ...extra])
  expect(out.status).toBe(status)
  expect(out.stderr).toContain(message)
})

// r0-6 AC-8 (--by position × positional root): the root is the positional argument wherever --by sits; it is never the --by value.
it('AC-8 r0-6: root after the --by value is the report root (output derived from it, not cwd)', () => {
  const out = report(['--by', 'run', reportRoot(true)])
  expect(out.status).toBe(0)
  expect(out.stdout).toContain('run-in-root')
})

it('AC-8 r0-6: --by directly followed by the root takes the root as the (invalid) value', () => {
  const out = report(['--by', reportRoot(true)])
  expect(out.status).toBe(1)
  expect(out.stderr).toContain('--by: expected one of')
})
