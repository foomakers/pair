import { spawnSync } from 'child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createCycleScriptsBridge } from './cycle-scripts'

// #654 r1-2 regression: real dispatch producers must drain JSON before exiting, including
// typed refusals. No engine or tracker is invoked; direct probes have an empty PATH.
const root = join(__dirname, '..', '..', '..', '..', '..')
const agentsDir = join(root, '.claude/agents')
const representations = [
  ['dataset', 'packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts'],
  ['installed', '.claude/skills/pair-workflow-cycle/scripts'],
] as const
const card = { id: '654', branch: 'feature/US-654-stdout', title: 'stdout', prNumber: 655 }
const head = 'a'.repeat(40)
const next = (step: string) => ({
  step,
  phase: 'r2-g1',
  mode: 'remediation',
  base: head,
  attempt: 1,
  contract: { path: '/contract.json', hash: `sha256:${'b'.repeat(64)}`, snapshot: head },
})

function invoke(scripts: string, args: string[]) {
  const result = spawnSync(process.execPath, [join(root, scripts, 'cycle-dispatch.mjs'), ...args], {
    encoding: 'utf8',
    env: { PATH: '' },
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
  })
  expect(result.error).toBeUndefined()
  expect(result.signal).toBeNull()
  expect(result.stderr).toBe('')
  return result
}

function packetArgs(step: string, run: string, style: string) {
  const args = [
    'packet',
    '--next',
    JSON.stringify(next(step)),
    '--card',
    JSON.stringify(card),
    '--run',
    run,
    '--agents-dir',
    agentsDir,
  ]
  if (style !== 'omitted') args.push('--style', style)
  return args
}

describe.each(representations)('#654 r1-2 regression %s stdout', (_name, scripts) => {
  it.each([8191, 8192, 8193, 65536])('B-%i: complete exact byte-boundary branch JSON', bytes => {
    // Hand-calculated public branch grammar; JSON envelope + newline included in the target size.
    const envelope = Buffer.byteLength(JSON.stringify({ branch: 'feature/US-654-' }) + '\n')
    const title = 'x'.repeat(bytes - envelope)
    const result = invoke(scripts, ['branch', '--id', '654', '--title', title])
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(JSON.stringify({ branch: `feature/US-654-${title}` }) + '\n')
  })

  describe.each(['omitted', 'slash', 'instruction'])('style %s', style => {
    it.each(['prepare', 'validate', 'implement', 'green', 'verify'])(
      'W-%s: complete large stage packet',
      step => {
        const run = 'r'.repeat(12000)
        const result = invoke(scripts, packetArgs(step, run, style))
        expect(result.status).toBe(0)
        expect(result.stdout.endsWith('\n')).toBe(true)
        const packet = JSON.parse(result.stdout)
        expect(packet).toMatchObject({
          step,
          phase: 'r2-g1',
          runDir: `.pair/working/runs/${run}/654`,
        })
        expect(packet.args).toContain(`$run=${run} `)
        expect(packet.prompt).toContain(`$run=${run} `)
      },
    )
  })

  it('C-file: large JSON is complete through a regular file descriptor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pair-stdout-'))
    const file = join(dir, 'out.json')
    const fd = openSync(file, 'w')
    const title = 'x'.repeat(16000)
    try {
      const result = spawnSync(
        process.execPath,
        [join(root, scripts, 'cycle-dispatch.mjs'), 'branch', '--id', '654', '--title', title],
        { stdio: ['ignore', fd, 'pipe'], env: { PATH: '' }, timeout: 5_000 },
      )
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(0)
      expect(readFileSync(file, 'utf8')).toBe(
        JSON.stringify({ branch: `feature/US-654-${title}` }) + '\n',
      )
    } finally {
      closeSync(fd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('W-unicode: escaped multibyte notes survive the pipe intact', () => {
    const notes = 'é😀\n"\\'.repeat(3000)
    const args = packetArgs('implement', 'unicode', 'omitted')
    args[args.indexOf('--card') + 1] = JSON.stringify({ ...card, notes })
    const result = invoke(scripts, args)
    expect(result.status).toBe(0)
    const packet = JSON.parse(result.stdout)
    expect(packet.args).toContain(`$notes=${JSON.stringify(notes)}`)
    expect(packet.prompt).toContain(`$notes=${JSON.stringify(notes)}`)
  })

  it.each([1, 12000])('E-%i: typed refusal remains complete and terminates with status 1', size => {
    const run = '?'.repeat(size)
    const result = invoke(scripts, packetArgs('implement', run, 'omitted'))
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      halt: 'run-invalid',
      detail: `--run must be one safe path segment: ${run}`,
    })
    expect(result.stdout.endsWith('\n')).toBe(true)
  })

  it.each([1, 12000])('X-%i: CLI exception remains complete and exits 2', size => {
    const command = '?'.repeat(size)
    const result = invoke(scripts, [command])
    expect(result.status).toBe(2)
    expect(JSON.parse(result.stdout)).toEqual({
      error: `unknown command: ${command} (expected worktree | packet | realizations | context-table)`,
    })
    expect(result.stdout.endsWith('\n')).toBe(true)
  })

  it.each(['slash', 'instruction'] as const)(
    'I-%s: real bridge accepts large verify packets',
    style => {
      const run = 'r'.repeat(12000)
      const bridge = createCycleScriptsBridge({ scriptsDir: join(root, scripts), agentsDir })
      const packet = bridge.packet({ next: next('verify'), card, run, style })
      expect(packet).toMatchObject({ step: 'verify', phase: 'r2-g1' })
      expect(packet.prompt).toContain(`$run=${run} `)
    },
  )

  it.each([1, 12000])('I-refusal-%i: bridge preserves the typed refusal', size => {
    const run = '?'.repeat(size)
    const bridge = createCycleScriptsBridge({ scriptsDir: join(root, scripts), agentsDir })
    expect(() => bridge.packet({ next: next('implement'), card, run })).toThrow(
      `run-invalid: --run must be one safe path segment: ${run}`,
    )
  })

  it('C-worktree: invalid story is refused before git or filesystem changes', () => {
    const result = invoke(scripts, [
      'worktree',
      '--main',
      root,
      '--story',
      '?',
      '--branch',
      card.branch,
      '--base',
      'origin/main',
    ])
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      halt: 'story-invalid',
      detail: '--story must be one safe path segment: ?',
    })
  })

  it('C-cli: small data commands retain JSON objects', () => {
    for (const command of ['context-table', 'realizations']) {
      const result = invoke(scripts, [command])
      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout)).toBeTypeOf('object')
      expect(result.stdout.endsWith('\n')).toBe(true)
    }
  })
})
