import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ENGINES } from './engines'
import { spawn, spawnSync } from 'node:child_process'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

it.each(['return', 'throw'])(
  '#601 AC3: queued SIGINT wins when a synchronous host read ends with %s',
  outcome => {
    const dir = mkdtempSync(join(tmpdir(), 'pair-601-signal-'))
    const source = readFileSync(join(process.cwd(), 'src/commands/run/interrupt.ts'), 'utf8')
    const compiled = transpileModule(source, {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    }).outputText
    writeFileSync(join(dir, 'interrupt.cjs'), compiled)
    writeFileSync(join(dir, 'pooled-card.js'), 'exports.pooledCard = undefined\n')
    const script = `
    const { spawnSync } = require('node:child_process')
    const { whileInterruptible } = require('./interrupt.cjs')
    const host = { on: (s, f) => process.on(s, f), off: (s, f) => process.off(s, f), exit: c => process.exit(c) }
    void whileInterruptible(() => process.stdout.write('interrupted\\n'), async () => {
      const result = spawnSync(process.execPath, ['-e', 'process.kill(process.ppid, "SIGINT")'])
      if (result.status !== 0) throw new Error('signal sender failed')
      ${outcome === 'throw' ? "throw new Error('read failed')" : "return 'complete'"}
    }, host).then(() => process.exit(0))
  `
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 5000,
    })
    expect(result.status).toBe(130)
    expect(result.stdout).toContain('interrupted')
  },
)

it('#601 AC3: SIGINT interrupts a blocked host read promptly', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pair-601-live-signal-'))
  const source = readFileSync(join(process.cwd(), 'src/commands/run/interrupt.ts'), 'utf8')
  writeFileSync(
    join(dir, 'interrupt.js'),
    transpileModule(source, {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    }).outputText,
  )
  const hostSource = readFileSync(join(process.cwd(), 'src/commands/run/host-process.ts'), 'utf8')
  writeFileSync(
    join(dir, 'host-process.js'),
    transpileModule(hostSource, {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    }).outputText,
  )
  writeFileSync(join(dir, 'host-retry-audit.js'), 'exports.relayHostRetries = () => {}\n')
  writeFileSync(join(dir, 'pooled-card.js'), 'exports.pooledCard = undefined\n')
  const descendant =
    'process.on("SIGTERM",()=>{});console.log(process.pid);setInterval(()=>{},1000)'
  const readScript = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'inherit'});setInterval(()=>{},1000)`
  const script = `
    const { whileInterruptible } = require('./interrupt.js')
    const { runHostProcess } = require('./host-process.js')
    const host = { on: (s, f) => process.on(s, f), off: (s, f) => process.off(s, f), exit: c => process.exit(c) }
    void whileInterruptible(() => {}, async () => {
      await runHostProcess(process.execPath, ['-e', ${JSON.stringify(readScript)}], process.cwd(), { timeout: 30000, onStdout: data => process.stdout.write(data) })
    }, host)
  `
  const child = spawn(process.execPath, ['-e', script], {
    cwd: dir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let diagnostic = ''
  child.stderr.on('data', data => {
    diagnostic += String(data)
  })
  try {
    const pid = await new Promise<number>((resolve, reject) => {
      child.stdout.once('data', data => resolve(Number(String(data).trim())))
      child.once('error', reject)
      child.stderr.once('data', data => reject(new Error(String(data))))
      child.once('exit', code => reject(new Error(`host exited before ready: ${String(code)}`)))
    })
    const exited = new Promise<number | null>(resolve => child.once('exit', resolve))
    child.kill('SIGINT')
    const outcome = await Promise.race([
      exited,
      new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 1000)),
    ])
    expect(outcome).toBe(130)
    expect(pid).toBeGreaterThan(0)
    expect(await deadWithin(pid, 1000), diagnostic).toBe(true)
  } finally {
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        /* already exited */
      }
    }
  }
})

// US-600 r1-1: interrupting the driver leaves no engine descendant running (same as AC3 on timeout).
const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const deadWithin = async (pid: number, ms: number) => {
  const until = Date.now() + ms
  while (alive(pid) && Date.now() < until) await new Promise(done => setTimeout(done, 50))
  return !alive(pid)
}

const pids: number[] = []
beforeEach(() => vi.resetModules())
afterEach(() => {
  for (const pid of pids.splice(0)) if (alive(pid)) process.kill(pid, 'SIGKILL')
})

// The engine exits on SIGTERM; its descendant inherits stdio and (per case) ignores SIGTERM.
const engineScript = (descendantTrapsSigterm: boolean) => {
  const descendant = `require("fs").writeFileSync("dpid",String(process.pid));${
    descendantTrapsSigterm ? 'process.on("SIGTERM",()=>{});' : ''
  }setInterval(()=>{},1000)`
  return `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'inherit'});process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)`
}

describe('whileInterruptible — engine descendants are gone once the interrupt handler settles (US-600 r1-1)', () => {
  it.each([
    ['a descendant with default SIGTERM handling', false],
    ['a descendant ignoring SIGTERM', true],
  ])(
    '%s is not alive within 1s of the handler settling',
    async (_label, traps) => {
      const { whileInterruptible } = await import('./interrupt.js')
      const { spawnIteration } = await import('./spawn.js')
      const cwd = mkdtempSync(join(tmpdir(), 'pair-intr-'))
      const file = join(cwd, 'engine.js')
      writeFileSync(file, engineScript(traps))
      const engine = { ...ENGINES.claude, command: process.execPath, headlessArgs: [file] }

      let fire: (signal: 'SIGINT') => void = () => {}
      const exited = new Promise<void>(done => {
        const host = {
          on: (_s: string, listener: typeof fire) => void (fire = listener),
          off: () => {},
          exit: () => void done(),
        }
        void whileInterruptible(
          () => {},
          () => spawnIteration({ engine, cwd, promptText: 'go', autonomyArgs: [] }),
          host as never,
        )
      })

      const dpid = join(cwd, 'dpid')
      const until = Date.now() + 5000
      while (!existsSync(dpid) && Date.now() < until) await new Promise(r => setTimeout(r, 50))
      expect(existsSync(dpid)).toBe(true)
      const pid = Number(readFileSync(dpid, 'utf8'))
      pids.push(pid)

      fire('SIGINT')
      await exited
      expect(await deadWithin(pid, 1000)).toBe(true)
    },
    20000,
  )
})
