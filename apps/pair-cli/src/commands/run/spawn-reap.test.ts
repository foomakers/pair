import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnIteration } from './spawn'
import { ENGINES } from './engines'

// US-600 AC3 (r0-1): after idle expiry, work the engine owns (its descendants) is terminated.
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
afterEach(() => {
  for (const pid of pids.splice(0)) if (alive(pid)) process.kill(pid, 'SIGKILL')
})

// The engine exits on SIGTERM; the descendant inherits stdio and (per case) ignores SIGTERM.
const engineWithDescendant = (descendantTrapsSigterm: boolean) => {
  const descendant = `require("fs").writeFileSync("dpid",String(process.pid));${
    descendantTrapsSigterm ? 'process.on("SIGTERM",()=>{});' : ''
  }setInterval(()=>{},1000)`
  return `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'inherit'});process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)`
}

// The engine ignores SIGTERM (still alive at hardStop) and records its pid; the descendant inherits stdio.
const stubbornEngineWithDescendant = () => {
  const descendant = `require("fs").writeFileSync("dpid",String(process.pid));setInterval(()=>{},1000)`
  return `require("fs").writeFileSync("epid",String(process.pid));require('child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'inherit'});process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`
}

describe('spawnIteration — owned work is gone once the idle timeout settles (US-600 AC3)', () => {
  it.each([
    ['a descendant with default SIGTERM handling', false],
    ['a descendant ignoring SIGTERM', true],
  ])(
    '%s is not alive within 1s of settlement',
    async (_label, traps) => {
      const cwd = mkdtempSync(join(tmpdir(), 'pair-reap-'))
      const file = join(cwd, 'engine.js')
      writeFileSync(file, engineWithDescendant(traps))
      const engine = { ...ENGINES.claude, command: process.execPath, headlessArgs: [file] }

      const result = await spawnIteration({
        engine,
        cwd,
        promptText: 'go',
        autonomyArgs: [],
        idleTimeoutSeconds: 1,
      })

      const dpid = join(cwd, 'dpid')
      expect(existsSync(dpid)).toBe(true)
      const pid = Number(readFileSync(dpid, 'utf8'))
      pids.push(pid)
      expect(result).toMatchObject({ outcome: 'failed', cause: 'timed-out', stalled: true })
      expect(await deadWithin(pid, 1000)).toBe(true)
    },
    15000,
  )

  it('an engine ignoring SIGTERM and its descendant are both not alive within 1s of settlement', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pair-reap-'))
    const file = join(cwd, 'engine.js')
    writeFileSync(file, stubbornEngineWithDescendant())
    const engine = { ...ENGINES.claude, command: process.execPath, headlessArgs: [file] }

    const result = await spawnIteration({
      engine,
      cwd,
      promptText: 'go',
      autonomyArgs: [],
      idleTimeoutSeconds: 1,
    })

    expect(existsSync(join(cwd, 'dpid'))).toBe(true)
    const epid = Number(readFileSync(join(cwd, 'epid'), 'utf8'))
    const dpid = Number(readFileSync(join(cwd, 'dpid'), 'utf8'))
    pids.push(epid, dpid)
    expect(result).toMatchObject({ outcome: 'failed', cause: 'timed-out', stalled: true })
    expect(await deadWithin(epid, 1000)).toBe(true)
    expect(await deadWithin(dpid, 1000)).toBe(true)
  }, 20000)
})
