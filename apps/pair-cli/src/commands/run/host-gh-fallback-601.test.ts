import { spawn } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { readCardDocumentViaGh, readPrLabels } from './cycle-wiring'
import { withHostRetryContext } from './host-retry-audit'
import { telemetryFile } from './telemetry'
import * as hostProcess from './host-process'

it.each(['card', 'pr'] as const)(
  '#601 AC1: fallback %s retains timeout when stderr has progress',
  async kind => {
    const root = mkdtempSync(join(tmpdir(), 'pair-601-fallback-timeout-'))
    const host = vi.spyOn(hostProcess, 'runHostProcess').mockResolvedValue({
      status: null,
      stdout: '',
      stderr: 'progress',
      error: new Error('host command timed out after 30000ms'),
    })
    try {
      const result = kind === 'card' ? readCardDocumentViaGh('601', root) : readPrLabels('7', root)
      await expect(result).rejects.toThrow(/host-transient/)
    } finally {
      host.mockRestore()
    }
  },
)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function fixture(mode: string) {
  const root = mkdtempSync(join(tmpdir(), 'pair-601-gh-fallback-'))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const calls = join(root, 'calls')
  writeFileSync(calls, '')
  const executable = join(bin, 'gh')
  writeFileSync(
    executable,
    `#!${process.execPath}
const fs=require('fs'), args=process.argv.slice(2), file=${JSON.stringify(calls)}
const before=fs.readFileSync(file,'utf8').trim(), n=before ? before.split('\\n').length + 1 : 1
fs.appendFileSync(file,JSON.stringify(args)+'\\n')
const mode=${JSON.stringify(mode)}
if (mode==='permanent') { process.stderr.write('HTTP 403 Forbidden'); process.exit(1) }
if (mode==='exhaust') { process.stderr.write('HTTP 503 Retry-After: 31'); process.exit(1) }
if (mode==='interrupt') { process.stderr.write('HTTP 503 Retry-After: 10'); process.exit(1) }
if (mode==='four' || (mode==='recover' && n===1)) { process.stderr.write('HTTP 503 Retry-After: 0'); process.exit(1) }
if (mode==='schema' && n===1) { process.stderr.write('Unknown JSON field: "projectItems"'); process.exit(1) }
process.stdout.write(JSON.stringify(args[0]==='issue' ? { title:'Story', body:'', labels:[], state:'OPEN' } : { labels:[{name:'risk:red'}] }))
`,
  )
  chmodSync(executable, 0o755)
  vi.stubEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`)
  return {
    root,
    calls: () =>
      readFileSync(calls, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as string[]),
  }
}

it.each(['card', 'pr'] as const)(
  '#601 AC1: fallback %s read retries a transient failure and records recovery',
  async kind => {
    const f = fixture('recover')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const value = await withHostRetryContext(
      { root: f.root, card: '601', run: 'story-601', enabled: true },
      async () =>
        kind === 'card'
          ? await readCardDocumentViaGh('601', f.root)
          : await readPrLabels('7', f.root),
    )
    expect(value).toEqual(
      kind === 'card' ? expect.objectContaining({ title: 'Story' }) : ['risk:red'],
    )
    expect(f.calls()).toHaveLength(2)
    expect(
      f.calls().every(args => args[0] === (kind === 'card' ? 'issue' : 'pr') && args[1] === 'view'),
    ).toBe(true)
    expect(log.mock.calls.flat().join('\n')).toContain(
      `operation=gh:${kind === 'card' ? 'issue' : 'pr'}:read attempt=2 outcome=recovered`,
    )
    const records = readFileSync(telemetryFile(f.root), 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(records).toContainEqual(
      expect.objectContaining({
        event: 'host-retry',
        card: '601',
        run: 'story-601',
        attempt: 2,
        outcome: 'recovered',
      }),
    )
  },
)

it.each(['card', 'pr'] as const)(
  '#601 AC3: fallback %s exhaustion stays host-transient',
  async kind => {
    const f = fixture('exhaust')
    const result =
      kind === 'card' ? readCardDocumentViaGh('601', f.root) : readPrLabels('7', f.root)
    await expect(result).rejects.toThrow(/host-transient/)
    expect(f.calls()).toHaveLength(1)
  },
)

it.each(['card', 'pr'] as const)('#601 AC1: fallback %s stops after four attempts', async kind => {
  const f = fixture('four')
  const result = kind === 'card' ? readCardDocumentViaGh('601', f.root) : readPrLabels('7', f.root)
  await expect(result).rejects.toThrow(/host-transient/)
  expect(f.calls()).toHaveLength(4)
})

it.each(['card', 'pr'] as const)(
  '#601 AC4: fallback %s does not retry permanent errors',
  async kind => {
    const f = fixture('permanent')
    if (kind === 'card') await expect(readCardDocumentViaGh('601', f.root)).rejects.toThrow(/403/)
    else await expect(readPrLabels('7', f.root)).resolves.toBeUndefined()
    expect(f.calls()).toHaveLength(1)
  },
)

it('#601 control: unsupported projectItems falls back to the supported issue fields', async () => {
  const f = fixture('schema')
  expect(await readCardDocumentViaGh('601', f.root)).toMatchObject({ title: 'Story' })
  expect(f.calls()).toHaveLength(2)
  expect(f.calls()[0]!.join(' ')).toContain('projectItems')
  expect(f.calls()[1]!.join(' ')).not.toContain('projectItems')
})

it('#601 AC1: schema fallback shares the original 30-second deadline', async () => {
  const f = fixture('schema')
  let calls = 0
  vi.spyOn(Date, 'now').mockImplementation(() => (++calls <= 3 ? 0 : 31_000))
  await expect(readCardDocumentViaGh('601', f.root)).rejects.toThrow(/host-transient/)
  expect(f.calls()).toHaveLength(1)
})

it('#601 AC3: SIGINT interrupts fallback retry without replaying the read', async () => {
  const f = fixture('interrupt')
  const runner = `
const {whileInterruptible}=require(${JSON.stringify(resolve(process.cwd(), 'dist/commands/run/interrupt.js'))})
const {readPrLabels}=require(${JSON.stringify(resolve(process.cwd(), 'dist/commands/run/cycle-wiring.js'))})
whileInterruptible(()=>{},()=>readPrLabels('7',${JSON.stringify(f.root)})).then(()=>process.exit(0))
`
  const child = spawn(process.execPath, ['-e', runner], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  )
  try {
    const started = await new Promise<boolean>(resolve => {
      const timer = setTimeout(() => {
        watcher.close()
        resolve(false)
      }, 5000)
      const watcher = watch(f.root, () => {
        if (f.calls().length > 0) {
          watcher.close()
          clearTimeout(timer)
          resolve(true)
        }
      })
      if (f.calls().length > 0) {
        watcher.close()
        clearTimeout(timer)
        resolve(true)
      }
    })
    expect(started).toBe(true)
    child.kill('SIGINT')
    expect(await exit).toEqual({ code: 130, signal: null })
    expect(f.calls()).toHaveLength(1)
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL')
  }
}, 10000)
