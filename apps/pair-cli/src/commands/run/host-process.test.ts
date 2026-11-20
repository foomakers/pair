import { expect, it } from 'vitest'
import { runHostProcess } from './host-process'
import { spawnSync, type SpawnSyncOptions } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

it('#601 AC3: deadline kills a host process and its SIGTERM-resistant descendant', async () => {
  const descendant =
    'process.on("SIGTERM",()=>{});console.log(process.pid);setInterval(()=>{},1000)'
  const leader = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'inherit'});process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`
  const result = await runHostProcess(process.execPath, ['-e', leader], process.cwd(), {
    timeout: 3000,
  })
  expect(result.error?.message).toContain('timed out')
  const pid = Number(result.stdout.trim())
  expect(pid).toBeGreaterThan(0)
  expect(() => process.kill(pid, 0)).toThrow()
})
async function assertGone(pids: number[]): Promise<void> {
  for (const pid of pids) {
    const deadline = Date.now() + 1000
    let alive = true
    while (alive && Date.now() < deadline) {
      try {
        process.kill(pid, 0)
      } catch {
        alive = false
      }
      if (alive) await new Promise<void>(resolve => setImmediate(resolve))
    }
    expect(alive).toBe(false)
  }
}

function cleanupProcesses(pid: number | undefined, pidFile: string): void {
  if (pid)
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      /* exited */
    }
  if (existsSync(pidFile))
    for (const pid of JSON.parse(readFileSync(pidFile, 'utf8')) as number[]) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* exited */
      }
    }
}

it('#601 AC1: adapter deadline terminates a host that ignores SIGTERM and its descendant', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pair-601-sync-deadline-'))
  const pidFile = join(dir, 'pids.json')
  const descendant = 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'
  const host = `const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'inherit'});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},JSON.stringify([process.pid,c.pid]));process.on('SIGTERM',()=>{});setTimeout(()=>process.exit(0),3000)`
  const adapter = pathToFileURL(
    join(process.cwd(), '../../.claude/skills/pair-workflow-cycle/scripts/host/adapter-kit.mjs'),
  ).href
  const script = `import {runCli} from ${JSON.stringify(adapter)};let n=0;try{runCli({bin:process.execPath,args:['-e',${JSON.stringify(host)}],replaySafe:true,now:()=>n++===0?0:29500})}catch(e){if(e.kind==='transient-exhausted')process.exit(0);throw e}`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    timeout: 2000,
    killSignal: 'SIGKILL',
    detached: true,
  } as SpawnSyncOptions)
  try {
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    const pids = JSON.parse(readFileSync(pidFile, 'utf8')) as number[]
    await assertGone(pids)
  } finally {
    cleanupProcesses(result.pid, pidFile)
  }
})
