// #645 r0-8: real driver/runner/reader/storage; only host processes and engine output are stubbed.
import * as childProcess from 'child_process'
import { chmodSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { vi } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createDefaultCycleDriver } from '../cycle-wiring'
import { ENGINES, type EngineId } from '../engines'

vi.mock('child_process', async importOriginal => ({
  ...(await importOriginal<typeof import('child_process')>()),
}))

function stubHost(root: string) {
  mkdirSync(join(root, '.git'), { recursive: true })
  return vi.spyOn(childProcess, 'execFileSync').mockImplementation((command, args) => {
    const argv = args as readonly string[]
    if (command === 'gh' && argv[0] === 'issue' && argv[1] === 'view')
      return JSON.stringify({ title: 'Session telemetry', body: '', labels: [] })
    if (command === 'git' && argv[0] === 'rev-parse')
      return argv.includes('--show-toplevel') ? root : join(root, '.git')
    if (command === 'git' && ['branch', 'ls-remote'].includes(argv[0]!)) return ''
    throw new Error(`Unexpected host process: ${command} ${argv.join(' ')}`)
  })
}

function stubCoordinator(root: string) {
  let resolves = 0
  const answers: Record<string, unknown> = {
    'bind-hosts': { action: 'bound', binding: { pmTool: 'github', codeHost: null } },
    inputs: { inputsDigest: 'session-probe' },
    'ac-hash': { acHash: 'session-probe' },
    worktree: { path: root, reused: true, created: false, branch: 'fixture' },
    packet: { step: 'implement', phase: 'a0', worktree: root, prompt: 'probe' },
  }
  return vi.spyOn(childProcess, 'spawnSync').mockImplementation((command, args) => {
    const argv = args as readonly string[]
    if (command !== 'node' || !argv[0]?.startsWith(join(root, 'scripts')))
      throw new Error(`Unexpected coordinator process: ${command} ${argv.join(' ')}`)
    const cmd = argv[1]!
    let answer = answers[cmd]
    if (cmd === 'resolve') {
      resolves += 1
      answer = {
        status: 'in-progress',
        policy: { deadDispatchRetries: 0 },
        next: resolves > 2 ? { step: 'done' } : { step: 'implement', phase: 'a0', attempt: 1 },
      }
    }
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
}

export async function driveSessionStream(
  root: string,
  engine: EngineId,
  events: readonly unknown[],
) {
  const executable = join(root, 'stub-engine')
  const stream = events.map(event => JSON.stringify(event)).join('\n') + '\n'
  writeFileSync(
    executable,
    `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(stream)})\n`,
  )
  chmodSync(executable, 0o755)
  const host = stubHost(root)
  const coordinator = stubCoordinator(root)
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  let time = 0
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => (time += 10))
  try {
    return await createDefaultCycleDriver({
      telemetryEnabled: true,
      engine: { ...ENGINES[engine], command: executable },
      cwd: root,
      fs: new InMemoryFileSystemService({}, root, root),
      location: { scriptsDir: join(root, 'scripts') },
      autonomyArgs: [],
      timeoutSeconds: 1,
      workflowVersion: '4.0.1',
      baseBranch: 'origin/main',
    })({ runId: 'session-probe', card: '645' })
  } finally {
    host.mockRestore()
    coordinator.mockRestore()
    log.mockRestore()
    clock.mockRestore()
  }
}
