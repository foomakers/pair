import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnIteration } from './spawn'
import { ENGINES } from './engines'

// US-600 guard-strength (r0-2, r0-3, r0-4): production is correct; these fail on an injected regression.
const stub = (script: string) => {
  const cwd = mkdtempSync(join(tmpdir(), 'pair-idle-guard-'))
  const file = join(cwd, 'engine.js')
  writeFileSync(file, script)
  return { engine: { ...ENGINES.claude, command: process.execPath, headlessArgs: [file] }, cwd }
}
const run = ({ engine, cwd }: ReturnType<typeof stub>) =>
  spawnIteration({ engine, cwd, promptText: 'go', autonomyArgs: [], idleTimeoutSeconds: 1 })

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const pids: number[] = []
// Safety net only: never part of an assertion path.
afterEach(() => {
  for (const pid of pids.splice(0)) if (alive(pid)) process.kill(pid, 'SIGKILL')
})

describe('spawnIteration idle guards (US-600)', () => {
  it('AC3: an engine ignoring SIGTERM is SIGKILLed — pid not alive once spawnIteration settles', async () => {
    const s = stub(
      `require('fs').writeFileSync('epid',String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`,
    )
    const result = await run(s)
    const epid = Number(readFileSync(join(s.cwd, 'epid'), 'utf8'))
    pids.push(epid)
    expect(result).toMatchObject({ outcome: 'failed', cause: 'timed-out', stalled: true })
    const until = Date.now() + 1000
    while (alive(epid) && Date.now() < until) await new Promise(done => setTimeout(done, 25))
    expect(alive(epid)).toBe(false)
  }, 20000)

  it.each([
    ['stderr output only', `process.stderr.write('tick\\n')`],
    ['malformed JSON lines', `process.stdout.write('{not json\\n')`],
    ['partial lines without newline', `process.stdout.write('{"type":"system"')`],
  ])(
    'AC2: %s every 300ms does not reset the idle clock',
    async (_label, emit) => {
      const result = await run(stub(`setInterval(()=>{${emit}},300)`))
      expect(result).toMatchObject({ outcome: 'failed', cause: 'timed-out', stalled: true })
    },
    20000,
  )

  it('AC5: a silent engine times out while a concurrent healthy engine still succeeds', async () => {
    const healthy = stub(
      `let n=0;const t=setInterval(()=>{process.stdout.write(JSON.stringify({type:'system',n:n++})+'\\n');if(n===8){clearInterval(t);process.stdout.write(JSON.stringify({type:'result',subtype:'success'})+'\\n')}},300)`,
    )
    const silent = stub(`setInterval(()=>{},1000)`)
    const [ok, stalled] = await Promise.all([run(healthy), run(silent)])
    expect(stalled).toMatchObject({ outcome: 'failed', cause: 'timed-out', stalled: true })
    expect(ok.outcome).toBe('success')
  }, 20000)
})
