import { describe, it, expect, vi } from 'vitest'
import { spawn } from 'child_process'
import { resolve } from 'path'

// B6: `pair-cli --help | head -1` — reader closes the pipe early; no EPIPE stack on stderr.
const CLI_CWD = resolve(__dirname, '..')
const ARGS = ['-r', 'ts-node/register/transpile-only', 'src/cli.ts']

const earlyClosed = (...args: string[]) =>
  new Promise<{ status: number | null; stderr: string }>((done, fail) => {
    const c = spawn('node', [...ARGS, ...args], {
      cwd: CLI_CWD,
      env: { ...process.env, NO_COLOR: '1' },
    })
    let stderr = ''
    c.stderr.setEncoding('utf-8').on('data', d => (stderr += d))
    c.stdout.destroy() // the reader (`head`) is gone before the CLI writes
    c.on('error', fail)
    c.on('close', status => done({ status, stderr }))
  })

describe('pair-cli on an early-closed stdout (B6)', () => {
  vi.setConfig({ testTimeout: 60_000 })
  it.each([['--help'], ['install', '--help']])('%s exits quietly, no EPIPE trace', async (...args) => {
    const r = await earlyClosed(...args)
    expect(r.stderr).not.toMatch(/EPIPE|node:events|at /)
    expect(r.status).toBe(0)
  })
})
