import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { spawn } from 'child_process'
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

// r1-6: `tokens --json` on a PIPE must not be cut at 64 KiB by main()'s process.exit().
const CLI_CWD = resolve(__dirname, '../../..')
const ARGS = ['-r', 'ts-node/register/transpile-only', 'src/cli.ts', 'tokens']
const ENV = { ...process.env, NO_COLOR: '1' }
const PIPE_CHUNK = 65536

// async, never spawnSync: a blocked worker cannot answer vitest's RPC ("Timeout calling onTaskUpdate")
/** stdout piped: the shape `tokens --json | jq` / `| tee` sees. */
const piped = (...args: string[]) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((done, fail) => {
    const c = spawn('node', [...ARGS, ...args], { cwd: CLI_CWD, env: ENV })
    let stdout = ''
    let stderr = ''
    c.stdout.setEncoding('utf-8').on('data', d => (stdout += d))
    c.stderr.setEncoding('utf-8').on('data', d => (stderr += d))
    c.on('error', fail)
    c.on('close', status => done({ status, stdout, stderr }))
  })

/** stdout redirected to a file descriptor: the shape `tokens --json > file` sees (the oracle). */
const redirected = (file: string, args: string[], bin = 'node') =>
  new Promise<number | null>((done, fail) => {
    const fd = openSync(file, 'w')
    const c = spawn(bin, [...ARGS, ...args], {
      cwd: CLI_CWD,
      env: ENV,
      stdio: ['ignore', fd, 'pipe'],
    })
    // a spawn failure emits `error` then `close`: the fd is closed once, on `close`
    c.on('error', fail)
    c.on('close', status => (closeSync(fd), done(status)))
  })

const fill = (root: string, count: number) => {
  const dir = join(root, '.pair/knowledge/guidelines/g')
  mkdirSync(dir, { recursive: true })
  for (let i = 1; i <= count; i++)
    writeFileSync(join(dir, `file-with-a-reasonably-long-name-${i}.md`), `word ${i}\n`)
}

describe('pair-cli tokens --json on a piped stdout (r1-6)', () => {
  vi.setConfig({ testTimeout: 60_000 })
  let big: string
  let small: string
  let oracle: string

  beforeAll(async () => {
    big = mkdtempSync(join(tmpdir(), 'tokens-pipe-big-'))
    small = mkdtempSync(join(tmpdir(), 'tokens-pipe-small-'))
    fill(big, 900) // > 64 KiB of JSON
    fill(small, 3) // well under one pipe chunk
    oracle = join(big, 'redirect.json')
  })

  // the oracle spawns a cold ts-node CLI (~2s idle, ~12s under 12 parallel spawns, measured): it runs in a
  // test (testTimeout 60s), never in a hook (hookTimeout 10s default) whose duration depends on machine load
  let oracleReady: Promise<void> | undefined
  const ensureOracle = () =>
    (oracleReady ??= redirected(oracle, ['--root', big, '--json']).then(s => expect(s).toBe(0)))

  afterAll(() => {
    rmSync(big, { recursive: true, force: true })
    rmSync(small, { recursive: true, force: true })
  })

  it('r2-g1-c1: the file-redirect oracle is complete JSON larger than one pipe chunk', async () => {
    await ensureOracle()
    const text = readFileSync(oracle, 'utf-8')
    expect(text.length).toBeGreaterThan(PIPE_CHUNK)
    expect(() => JSON.parse(text)).not.toThrow()
  })

  it('r2-g1-w1: piped output is byte-identical to the redirect oracle and parses', async () => {
    await ensureOracle()
    const r = await piped('--root', big, '--json')
    expect(r.status).toBe(0)
    expect(r.stdout.length).toBe(readFileSync(oracle, 'utf-8').length)
    expect(r.stdout).toBe(readFileSync(oracle, 'utf-8'))
    expect(() => JSON.parse(r.stdout)).not.toThrow()
  })

  it('r2-g1-w2: a baseline captured through a pipe is readable by --baseline', async () => {
    const file = join(big, 'piped-baseline.json')
    writeFileSync(file, (await piped('--root', big, '--json')).stdout)
    const r = await piped('--root', big, '--baseline', file)
    expect(r.stderr).not.toContain('cannot read baseline')
    expect(r.status).toBe(0)
  })

  it('r2-g1-c2: piped output under one pipe chunk is complete', async () => {
    const r = await piped('--root', small, '--json')
    expect(r.status).toBe(0)
    expect(r.stdout.length).toBeLessThan(PIPE_CHUNK)
    expect(JSON.parse(r.stdout).total.files).toBe(3)
  })

  it('r4-6: a spawn failure rejects once and closes the redirect fd once (no EBADF)', async () => {
    const file = join(small, 'missing-bin.json')
    await expect(redirected(file, [], 'pair-no-such-binary')).rejects.toMatchObject({
      code: 'ENOENT',
    })
    await new Promise(r => setTimeout(r, 50))
  })
})
