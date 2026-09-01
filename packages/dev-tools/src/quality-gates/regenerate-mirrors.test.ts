import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  realpathSync,
} from 'fs'
import { tmpdir } from 'os'
import { join, resolve, dirname } from 'path'

import { REPO_ROOT } from './repo-root'

// #419: the mirror-equality guard's remedy is THIS script — a local, deterministic
// realignment of the generated mirrors from the working tree's dataset. `pair update`
// (the old remedy) resolves and installs a PUBLISHED knowledge base, which is a
// different operation and cannot be the fix for "your working tree drifted".
//
// Shape borrowed from run-format.test.ts: the real script is executed against a
// throwaway git fixture, because the thing under test IS the script's behaviour
// (a wrapper over the CLI's existing `--source` path — see the story's "no new
// generation logic" constraint), not a function it could delegate to.
const REGENERATE = resolve(REPO_ROOT, 'scripts/regenerate-mirrors.sh')

interface RunResult {
  status: number
  stdout: string
  stderr: string
}

function run(cwd: string, env?: Record<string, string>): RunResult {
  try {
    const stdout = execFileSync(REGENERATE, [], {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
    })
    return { status: 0, stdout: stdout.toString('utf-8'), stderr: '' }
  } catch (error) {
    const e = error as { status: number; stdout?: Buffer; stderr?: Buffer }
    return {
      status: e.status,
      stdout: e.stdout?.toString('utf-8') ?? '',
      stderr: e.stderr?.toString('utf-8') ?? '',
    }
  }
}

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir }).toString('utf-8')
}

function initRepo(dir: string): void {
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'Test'])
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

const STUB_SKILL = '# /stub\n\nA stub skill.\n'
const KB_INDEX = '# Mock Knowledge\n'

/**
 * The smallest tree `pair update --source <dir>` accepts: a KB-shaped dataset
 * (`validateKBStructure`) plus at least one ALREADY-INSTALLED target, since update
 * refuses to run on a project that was never installed. `.pair/knowledge/index.md`
 * plays both roles here — installed target and the file we deliberately drift.
 */
function makeFixture(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'regen-mirrors-')))
  const dataset = join(dir, 'packages/knowledge-hub/dataset')

  write(join(dataset, 'manifest.json'), '{"version":"0.0.0"}\n')
  write(join(dataset, 'AGENTS.md'), '# AGENTS\n')
  write(join(dataset, '.pair/knowledge/index.md'), KB_INDEX)
  write(join(dataset, '.pair/adoption/index.md'), '# Mock Adoption\n')
  write(join(dataset, '.github/README.md'), '# Mock GitHub\n')
  write(join(dataset, '.skills/capability/stub/SKILL.md'), STUB_SKILL)
  // Same line the real repo carries: `.pair/.kb-version.json` is a local install stamp
  // (it records a wall-clock `recordedAt`), so it is untracked by design. Without it the
  // fixture would report a diff on every run for a file no repo commits.
  write(join(dir, '.gitignore'), '.pair/.kb-version.json\n')

  initRepo(dir)
  return dir
}

/** A HOME nobody shares, so a KB cache slot written by a download is visible. */
function isolatedHome(dir: string): Record<string, string> {
  const home = join(dir, '.home')
  mkdirSync(home, { recursive: true })
  return { HOME: home }
}

// Every test here shells out to the REAL script, which builds the CLI (turbo, cached
// after the first) and then runs a full 7-registry regeneration over a fixture tree.
// That is seconds, not milliseconds, and vitest's 5s default is measured while turbo
// runs every other package's suite in parallel — so the default is a flake, not a
// budget. `SCRIPT_RUN_TIMEOUT_MS` is per test, and the same explicit-timeout treatment
// run-format.test.ts already gives its multi-subprocess cases.
const SCRIPT_RUN_TIMEOUT_MS = 120_000

describe('regenerate-mirrors.sh — the local, deterministic mirror remedy (#419)', () => {
  let tmp = ''

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
    tmp = ''
  })

  it(
    'regenerates a drifted mirror from the LOCAL dataset (AC1)',
    () => {
      tmp = makeFixture()
      const mirror = join(tmp, '.pair/knowledge/index.md')
      write(mirror, '# hand-edited drift\n')

      const result = run(tmp, isolatedHome(tmp))

      expect(result.status).toBe(0)
      expect(readFileSync(mirror, 'utf-8')).toBe(KB_INDEX)
    },
    SCRIPT_RUN_TIMEOUT_MS,
  )

  it(
    'never fetches or installs a published KB version (AC1)',
    () => {
      tmp = makeFixture()
      write(join(tmp, '.pair/knowledge/index.md'), '# hand-edited drift\n')
      const env = isolatedHome(tmp)

      const result = run(tmp, env)

      expect(result.status).toBe(0)
      // A published-version resolution caches the downloaded KB under `~/.pair/kb/<version>`.
      // Its absence is the observable difference between "regenerated from the working tree"
      // and "updated to whatever is published", which is the whole point of the story.
      expect(existsSync(join(env['HOME'] as string, '.pair/kb'))).toBe(false)
    },
    SCRIPT_RUN_TIMEOUT_MS,
  )

  it(
    'is idempotent — a second run produces no further diff (AC2)',
    () => {
      tmp = makeFixture()
      write(join(tmp, '.pair/knowledge/index.md'), '# hand-edited drift\n')
      run(tmp, isolatedHome(tmp))
      git(tmp, ['add', '-A'])
      git(tmp, ['commit', '-q', '-m', 'regenerated'])

      const second = run(tmp, isolatedHome(tmp))

      expect(second.status).toBe(0)
      expect(git(tmp, ['status', '--porcelain'])).toBe('')
    },
    SCRIPT_RUN_TIMEOUT_MS,
  )

  it(
    'leaves unstaged authored changes untouched (dirty-tree edge case)',
    () => {
      tmp = makeFixture()
      const authored = join(tmp, 'src/authored.ts')
      write(authored, 'export const authored = 1\n')
      git(tmp, ['add', '-A'])
      git(tmp, ['commit', '-q', '-m', 'fixture'])
      writeFileSync(authored, 'export const authored = 2\n')
      write(join(tmp, '.pair/knowledge/index.md'), '# hand-edited drift\n')

      const result = run(tmp, isolatedHome(tmp))

      expect(result.status).toBe(0)
      expect(readFileSync(authored, 'utf-8')).toBe('export const authored = 2\n')
    },
    SCRIPT_RUN_TIMEOUT_MS,
  )

  it('exits non-zero and names the reason when the dataset is missing (AC7)', () => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'regen-mirrors-')))
    initRepo(tmp)

    const result = run(tmp, isolatedHome(tmp))

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('packages/knowledge-hub/dataset')
  })

  it('exits non-zero and names the reason outside a git working tree (AC7)', () => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'regen-mirrors-')))

    const result = run(tmp, { ...isolatedHome(tmp), GIT_CEILING_DIRECTORIES: tmp })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('git')
  })

  it('has no check mode — one writer, one checker (AC8)', () => {
    const source = readFileSync(REGENERATE, 'utf-8')
    expect(source).not.toMatch(/--check\b/)
    expect(source).not.toMatch(/--dry-run\b/)
  })
})
