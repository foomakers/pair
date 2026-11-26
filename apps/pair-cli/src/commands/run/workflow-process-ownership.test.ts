import { expect, it } from 'vitest'
import { spawnSync } from 'child_process'
import { fileSystemService as disk } from '@pair/content-ops'
import { tmpdir } from 'os'
import { join } from 'path'
import { ENGINES } from './engines'
import { spawnIteration } from './spawn'

function stopWorker(pidFile: string) {
  if (!disk.existsSync(pidFile)) return
  const pid = Number(disk.readFileSync(pidFile))
  try {
    process.kill(pid, 'SIGKILL')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

it('#704 F3: a crashed workflow engine leaves no live worker when the attempt settles (AC-2)', async () => {
  const cwd = disk.mkdtempSync(join(tmpdir(), 'pair-crash-reap-'))
  const file = join(cwd, 'engine.js')
  const descendant = `process.on('SIGTERM', () => {}); process.send(process.pid); setInterval(() => {}, 1000)`
  disk.writeFileSync(
    file,
    `const child = require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
     child.once('message', pid => {
       require('fs').writeFileSync('dpid', String(pid))
       process.exit(1)
     })`,
  )
  try {
    const result = await spawnIteration({
      engine: { ...ENGINES.claude, command: process.execPath, headlessArgs: [file] },
      cwd,
      promptText: 'go',
      autonomyArgs: [],
      diagnoseProcess: true,
    })
    const pid = Number(disk.readFileSync(join(cwd, 'dpid')))
    expect(result).toMatchObject({ outcome: 'failed', process: { exitCode: 1 } })
    // An orphan may remain as a zombie until the OS reaps it. It can no longer touch the worktree.
    expect(
      spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim(),
    ).toMatch(/^(?:Z|$)/)
  } finally {
    stopWorker(join(cwd, 'dpid'))
    disk.rmSync(cwd, { recursive: true, force: true })
  }
})
