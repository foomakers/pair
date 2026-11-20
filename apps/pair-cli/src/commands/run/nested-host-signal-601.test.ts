import { spawnSync, type SpawnSyncOptions } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { expect, it } from 'vitest'
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
    for (const pid of JSON.parse(readFileSync(pidFile, 'utf8')) as number[])
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* exited */
      }
}

it('#601 AC3: interrupt also stops the nested adapter host process group', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pair-601-nested-signal-'))
  const source = (name: string) =>
    readFileSync(join(process.cwd(), `src/commands/run/${name}.ts`), 'utf8')
  for (const name of ['interrupt', 'host-process'])
    writeFileSync(
      join(dir, `${name}.js`),
      transpileModule(source(name), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
      }).outputText,
    )
  writeFileSync(join(dir, 'pooled-card.js'), 'exports.pooledCard = undefined\n')
  writeFileSync(join(dir, 'host-retry-audit.js'), 'exports.relayHostRetries = () => {}\n')
  const pidFile = join(dir, 'pids.json')
  const descendant = 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'
  const host = `const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'ignore'});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},JSON.stringify([process.pid,c.pid]));setTimeout(()=>process.kill(Number(process.env.TEST_ANCESTOR),'SIGINT'),100);setInterval(()=>{},1000)`
  const adapter = pathToFileURL(
    join(process.cwd(), '../../.claude/skills/pair-workflow-cycle/scripts/host/adapter-kit.mjs'),
  ).href
  const cycle = `import {runCli} from ${JSON.stringify(adapter)};runCli({bin:process.execPath,args:['-e',${JSON.stringify(host)}],replaySafe:true})`
  const wrapper = `const {whileInterruptible}=require('./interrupt');const {runHostProcess}=require('./host-process');process.env.TEST_ANCESTOR=String(process.pid);const host={on:(s,f)=>process.on(s,f),off:(s,f)=>process.off(s,f),exit:c=>process.exit(c)};void whileInterruptible(()=>{},async()=>runHostProcess(process.execPath,['--input-type=module','-e',${JSON.stringify(cycle)}],process.cwd()),host)`
  const result = spawnSync(process.execPath, ['-e', wrapper], {
    cwd: dir,
    timeout: 5000,
    killSignal: 'SIGKILL',
    detached: true,
  } as SpawnSyncOptions)
  try {
    expect(result.status).toBe(130)
    const pids = JSON.parse(readFileSync(pidFile, 'utf8')) as number[]
    await assertGone(pids)
  } finally {
    cleanupProcesses(result.pid, pidFile)
  }
})
