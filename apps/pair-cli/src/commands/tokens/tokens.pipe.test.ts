import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { spawnSync } from 'child_process'
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

/** stdout piped (spawnSync default): the shape `tokens --json | jq` / `| tee` sees. */
const piped = (...args: string[]) =>
  spawnSync('node', [...ARGS, ...args], { cwd: CLI_CWD, encoding: 'utf-8', env: ENV })

/** stdout redirected to a file descriptor: the shape `tokens --json > file` sees (the oracle). */
const redirected = (file: string, ...args: string[]) => {
  const fd = openSync(file, 'w')
  try {
    const r = spawnSync('node', [...ARGS, ...args], {
      cwd: CLI_CWD,
      env: ENV,
      stdio: ['ignore', fd, 'pipe'],
    })
    return r.status
  } finally {
    closeSync(fd)
  }
}

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

  beforeAll(() => {
    big = mkdtempSync(join(tmpdir(), 'tokens-pipe-big-'))
    small = mkdtempSync(join(tmpdir(), 'tokens-pipe-small-'))
    fill(big, 900) // > 64 KiB of JSON
    fill(small, 3) // well under one pipe chunk
    oracle = join(big, 'redirect.json')
    expect(redirected(oracle, '--root', big, '--json')).toBe(0)
  })

  afterAll(() => {
    rmSync(big, { recursive: true, force: true })
    rmSync(small, { recursive: true, force: true })
  })

  it('r2-g1-c1: the file-redirect oracle is complete JSON larger than one pipe chunk', () => {
    const text = readFileSync(oracle, 'utf-8')
    expect(text.length).toBeGreaterThan(PIPE_CHUNK)
    expect(() => JSON.parse(text)).not.toThrow()
  })

  it('r2-g1-w1: piped output is byte-identical to the redirect oracle and parses', () => {
    const r = piped('--root', big, '--json')
    expect(r.status).toBe(0)
    expect(r.stdout.length).toBe(readFileSync(oracle, 'utf-8').length)
    expect(r.stdout).toBe(readFileSync(oracle, 'utf-8'))
    expect(() => JSON.parse(r.stdout)).not.toThrow()
  })

  it('r2-g1-w2: a baseline captured through a pipe is readable by --baseline', () => {
    const file = join(big, 'piped-baseline.json')
    writeFileSync(file, piped('--root', big, '--json').stdout)
    const r = piped('--root', big, '--baseline', file)
    expect(r.stderr).not.toContain('cannot read baseline')
    expect(r.status).toBe(0)
  })

  it('r2-g1-c2: piped output under one pipe chunk is complete', () => {
    const r = piped('--root', small, '--json')
    expect(r.status).toBe(0)
    expect(r.stdout.length).toBeLessThan(PIPE_CHUNK)
    expect(JSON.parse(r.stdout).total.files).toBe(3)
  })
})
