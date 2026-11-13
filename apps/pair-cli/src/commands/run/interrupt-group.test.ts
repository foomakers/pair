import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ENGINES } from './engines'

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
