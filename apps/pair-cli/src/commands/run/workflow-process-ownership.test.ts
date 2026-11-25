import { expect, it } from 'vitest'
import { spawnSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ENGINES } from './engines'
import { spawnIteration } from './spawn'

it('#704 F3: a crashed workflow engine leaves no live worker when the attempt settles (AC-2)', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pair-crash-reap-'))
  const file = join(cwd, 'engine.js')
  const descendant = `process.on('SIGTERM', () => {}); process.send(process.pid); setInterval(() => {}, 1000)`
  writeFileSync(
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
    const pid = Number(readFileSync(join(cwd, 'dpid'), 'utf8'))
    expect(result).toMatchObject({ outcome: 'failed', process: { exitCode: 1 } })
    // An orphan may remain as a zombie until the OS reaps it. It can no longer touch the worktree.
    expect(
      spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim(),
    ).toMatch(/^(?:Z|$)/)
  } finally {
    const pidFile = join(cwd, 'dpid')
    if (existsSync(pidFile)) {
      const pid = Number(readFileSync(pidFile, 'utf8'))
      try {
        process.kill(pid, 'SIGKILL')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    }
    rmSync(cwd, { recursive: true, force: true })
  }
})
