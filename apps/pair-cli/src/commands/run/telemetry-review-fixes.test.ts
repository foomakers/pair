// #645 review fixes r0-1/3/4/5/6/7/9/10: real driver/reader/report; only host processes and engine output are stubbed.
import * as childProcess from 'child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, expect, it, vi } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createDefaultCycleDriver } from './cycle-wiring'
import { ENGINES } from './engines'
import { readTelemetryRecords, summarizeTelemetry } from './telemetry-report'
import {
  cardTelemetryRecord,
  readInterventions,
  readTelemetry,
  type TelemetryRecord,
} from './telemetry'

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
    { type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 0 } },
  ]
    .map(event => JSON.stringify(event))
    .join('\n') + '\n'

type Answer = Record<string, unknown>

async function drive(options: {
  resolves: (call: number, dir: string) => Answer
  request?: Record<string, unknown>
  merge?: boolean
  setup?: (root: string) => void
}) {
  const root = mkdtempSync(join(tmpdir(), 'pair-645-'))
  roots.push(root)
  options.setup?.(root)
  const executable = join(root, 'stub-engine')
  writeFileSync(
    executable,
    `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(usageStream)})\n`,
  )
  chmodSync(executable, 0o755)
  vi.spyOn(childProcess, 'execFileSync').mockImplementation((command, args) => {
    const argv = args as readonly string[]
    if (command === 'gh' && argv[0] === 'issue')
      return JSON.stringify({ title: 'T', body: '', labels: options.merge ? [{ name: 'risk:green' }] : [] })
    if (command === 'git' && argv[0] === 'rev-parse') return join(root, '.git')
    if (command === 'git') return ''
    throw new Error(`Unexpected host process: ${String(command)}`)
  })
  let resolves = 0
  const answers: Answer = {
    'bind-hosts': { action: 'bound', binding: { pmTool: 'github', codeHost: null } },
    inputs: { inputsDigest: 'x' },
    'ac-hash': { acHash: 'x' },
    worktree: { path: root, reused: true, created: false, branch: 'fixture' },
    packet: { step: 'implement', phase: 'a0', worktree: root, prompt: 'probe' },
    check: { mergeAllowed: false, reason: 'parked' },
  }
  vi.spyOn(childProcess, 'spawnSync').mockImplementation((command, args) => {
    const argv = args as readonly string[]
    if (command === 'git') return { pid: 0, output: [], stdout: '', stderr: '', status: 0, signal: null }
    const cmd = argv[1]!
    const answer =
      cmd === 'resolve'
        ? options.resolves((resolves += 1), String(argv[argv.indexOf('--dir') + 1] ?? ''))
        : answers[cmd]
    if (answer === undefined) throw new Error(`Unexpected coordinator command: ${cmd}`)
    return { pid: 0, output: [], stdout: JSON.stringify(answer), stderr: '', status: 0, signal: null }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  let time = 0
  vi.spyOn(Date, 'now').mockImplementation(() => (time += 10))
  const outcome = await createDefaultCycleDriver({
    telemetryEnabled: true,
    engine: { ...ENGINES.codex, command: executable },
    cwd: root,
    fs: new InMemoryFileSystemService({}, root, root),
    location: { scriptsDir: join(root, 'scripts') },
    autonomyArgs: [],
    timeoutSeconds: 5,
    workflowVersion: '4.0.1',
    baseBranch: 'origin/main',
  })({ runId: 'requested', card: '645', ...options.request } as never)
  return { root, outcome }
}

const implement = { step: 'implement', phase: 'a0', attempt: 1 }
function readTelemetryCard(root: string, run: string): TelemetryRecord | undefined {
  return readTelemetryRecords(root).find(r => r.kind === 'card' && r['run'] === run)
}

it('AC-1 r0-1: adopting another run keeps stages and tokens on the adopted run', async () => {
  const { root } = await drive({
    resolves: call =>
      call === 1
        ? { status: 'other-run', runId: 'adopted' }
        : { status: 'in-progress', policy: { deadDispatchRetries: 0 }, next: call > 3 ? { step: 'done' } : implement },
  })
  expect(readTelemetry(root, 'requested', '645')).toHaveLength(0)
  expect(readTelemetry(root, 'adopted', '645')).toHaveLength(1)
  expect(readTelemetryCard(root, 'adopted')).toMatchObject({
    dispatches: 1,
    tokens: { freshIn: 10 },
  })
})

it('AC-1 r0-3: dispatches rejected by resolve are failed and fully wasted', async () => {
  const { root, outcome } = await drive({
    resolves: () => ({ status: 'in-progress', policy: { deadDispatchRetries: 1 }, next: implement }),
  })
  expect(outcome.status).toBe('failed-implement')
  expect(readTelemetry(root, 'requested', '645').map(s => s['outcomeClass'])).toEqual([
    'failed',
    'failed',
  ])
  const summary = summarizeTelemetry(readTelemetryRecords(root))
  expect(summary['codex']?.wastedTokenShare).toMatchObject({ mean: 1 })
})

it('AC-1 r0-7: a fresh card records the PR its final resolve names', async () => {
  const { root } = await drive({
    resolves: call =>
      call > 2 ? { status: 'done', next: { step: 'done', pr: 651 } } : { status: 'in-progress', policy: {}, next: implement },
  })
  expect(readTelemetryCard(root, 'requested')).toMatchObject({ pr: 651 })
})

it('AC-1 r0-10: the deterministic merge stage is recorded with measured time', async () => {
  const { root, outcome } = await drive({
    merge: true,
    request: { pr: 651 },
    resolves: () => ({
      status: 'ready',
      policy: {},
      next: { step: 'merge', reviewedHead: 'abc' },
    }),
  })
  expect(outcome.status).toBe('merge-parked')
  const merges = readTelemetry(root, 'requested', '645').filter(s => s['step'] === 'merge')
  expect(merges).toHaveLength(1)
  expect(Number(merges[0]!['durationMs'])).toBeGreaterThan(0)
  expect(readTelemetryCard(root, 'requested')).toMatchObject({ dispatches: 1 })
})

it('AC-1 r0-5: unreadable intervention file does not fail the delivery', async () => {
  const { root, outcome } = await drive({
    resolves: call =>
      call > 2 ? { status: 'done', next: { step: 'done' } } : { status: 'in-progress', policy: { deadDispatchRetries: 0 }, next: implement },
    setup: root => {
      const dir = join(root, '.pair/working/runs/requested/645')
      mkdirSync(dir, { recursive: true })
      const file = join(dir, 'maintainer-interventions.md')
      writeFileSync(file, '| a | b | c | d | e |\n')
      chmodSync(file, 0o000)
    },
  })
  expect(outcome.status).toBe('ready-for-merge')
  expect(readTelemetryCard(root, 'requested')).toMatchObject({ outcome: 'ready-for-merge' })
})

it('AC-2 r0-4: producer decision file names and escaped pipes survive the reader', () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-645-'))
  roots.push(root)
  writeFileSync(
    join(root, 'r0-review-phase.attempt-2.json'),
    JSON.stringify({ recordType: 'decision', humanDecisions: [{ by: 'rucka', decision: 'use strict' }] }),
  )
  writeFileSync(
    join(root, 'maintainer-interventions.md'),
    '| file | what | why | by | next |\n| --- | --- | --- | --- | --- |\n| `x.json` | w | accept A \\| B | rucka, d | n |\n',
  )
  expect(readInterventions(root)).toEqual([
    { kind: 'supersede', who: 'rucka, d', reason: 'accept A | B' },
    { kind: 'decision', who: 'rucka', reason: 'use strict' },
  ])
})

it('AC-1 r0-6: retries count dispatches beyond the first per logical stage', () => {
  const stage = (n: number) =>
    ({ kind: 'stage', id: `s${n}`, step: 'implement', phase: 'a0', start: n, durationMs: 1, retries: n }) as TelemetryRecord
  const card = cardTelemetryRecord({
    id: 'c', card: '645', run: 'r', pairVersion: 'v', workflowVersion: 'w', profile: 'p', engine: 'e',
    outcome: 'done', start: 0, end: 10, stages: [stage(0), stage(1), stage(2)], interventions: [],
  })
  expect(card['retries']).toBe(2)
})

it('AC-7 r0-9: local telemetry never reaches the CLI pack or the dataset', () => {
  const repo = join(__dirname, '../../../../..')
  const dir = join(repo, '.pair/working/telemetry')
  const sentinel = join(dir, `sentinel-${process.pid}.jsonl`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(sentinel, 'local-only\n')
  try {
    expect(existsSync(sentinel)).toBe(true)
    const packed = childProcess.execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: join(repo, 'apps/pair-cli'),
      encoding: 'utf8',
    })
    expect(packed).not.toMatch(/sentinel-|\.pair\/working/)
    const paths = readdirSync(join(repo, 'packages/knowledge-hub/dataset'), {
      recursive: true,
    }) as string[]
    expect(paths.filter(path => /sentinel-|working[\\/]telemetry/.test(path))).toEqual([])
  } finally {
    rmSync(sentinel, { force: true })
  }
})
