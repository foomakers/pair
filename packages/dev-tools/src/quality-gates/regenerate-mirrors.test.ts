import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync, spawn } from 'child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  copyFileSync,
  chmodSync,
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
  /** `null` when the child was killed by a SIGNAL — never conflated with an exit code. */
  status: number | null
  stdout: string
  stderr: string
}

function run(cwd: string, env?: Record<string, string>, script: string = REGENERATE): RunResult {
  try {
    const stdout = execFileSync(script, [], {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
    })
    return { status: 0, stdout: stdout.toString('utf-8'), stderr: '' }
  } catch (error) {
    const e = error as { status: number | null; stdout?: Buffer; stderr?: Buffer }
    return {
      status: e.status ?? null,
      stdout: e.stdout?.toString('utf-8') ?? '',
      stderr: e.stderr?.toString('utf-8') ?? '',
    }
  }
}

/**
 * "The script refused and said why", not merely "the script did not exit 0".
 *
 * `status !== 0` alone passes VACUOUSLY on a timeout kill: `execFileSync` reports a
 * signalled child with `status === null`, and `null !== 0`. These cases were already
 * observed flaking under parallel turbo load, which is exactly when a signal kill
 * happens — so a suite asserting only `not.toBe(0)` would go green on the flake it was
 * written to survive.
 */
function expectRefusal(result: RunResult, reason: string): void {
  expect(result.status).not.toBe(0)
  expect(result.status).not.toBeNull()
  expect(result.stderr).toContain(reason)
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

/**
 * A fixture where TOOLCHAIN_ROOT is the fixture too, not this repo.
 *
 * The script derives `TOOLCHAIN_ROOT` from its OWN location (`$(dirname $0)/..`), so the
 * only way to exercise the toolchain branches — no turbo, build failure, build green but
 * no `dist/cli.js` — is to run the REAL script from a copy inside the fixture's
 * `scripts/`. It is copied byte-for-byte, never re-implemented: a divergence between the
 * copy and `scripts/regenerate-mirrors.sh` would test a script nobody runs.
 */
function makeToolchainFixture(): string {
  const dir = makeFixture()
  const copy = join(dir, 'scripts/regenerate-mirrors.sh')
  mkdirSync(dirname(copy), { recursive: true })
  copyFileSync(REGENERATE, copy)
  chmodSync(copy, 0o755)
  return dir
}

/** A turbo the fixture owns, so the build step's outcome is the case under test. */
function writeTurboStub(dir: string, body: string): void {
  const stub = join(dir, 'node_modules/.bin/turbo')
  write(stub, `#!/bin/sh\n${body}`)
  chmodSync(stub, 0o755)
}

/** Polls `condition` until it holds, so the interrupt lands mid-build, not before it. */
async function waitUntil(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('waitUntil: condition never became true')
    await new Promise(resolve => setTimeout(resolve, 25))
  }
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

  it(
    'overwrites a pre-dirty mirror while `git status --porcelain` stays byte-identical',
    () => {
      // The measurement behind /publish-pr's Phase-1 staging rule (#419 round 2). That rule
      // derives "what this run wrote" from a before/after `git status --porcelain` diff. A
      // porcelain entry encodes STATUS, not content — so on a path that was ALREADY dirty
      // before the run, the entry is ` M <path>` before and ` M <path>` after whether the run
      // rewrote the file or never opened it. Both cases are in this fixture at once:
      //   - the mirror, whose committed content is drifted and whose working copy carries an
      //     uncommitted hand-edit the run destroys;
      //   - an authored file the run does not touch.
      // The two are INDISTINGUISHABLE in the snapshots, which is why the rule pairs each dirty
      // path with a content digest: without it the agent reads "no change", commits nothing,
      // reports nothing, and pushes the stale mirror the guards reject.
      tmp = makeFixture()
      const mirror = join(tmp, '.pair/knowledge/index.md')
      const authored = join(tmp, 'src/authored.ts')
      write(authored, 'export const authored = 1\n')
      // The installed target has to exist before the first run: `pair update` refuses a
      // project it was never installed into (same reason the AC1 case writes it).
      write(mirror, '# pre-existing install\n')

      // Converge first, so the second run's ONLY write is the mirror — otherwise the fixture's
      // first-ever regeneration touches other installed files and the snapshots differ for a
      // reason that has nothing to do with the case under test.
      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)
      git(tmp, ['add', '-A'])
      git(tmp, ['commit', '-q', '-m', 'converged'])

      // HEAD now carries a DRIFTED mirror: this is what makes the run write something.
      writeFileSync(mirror, '# committed drift\n')
      git(tmp, ['add', '-A'])
      git(tmp, ['commit', '-q', '-m', 'drifted mirror on HEAD'])

      // Two uncommitted changes: one on the mirror (about to be destroyed), one authored.
      writeFileSync(mirror, '# uncommitted hand-edit\n')
      writeFileSync(authored, 'export const authored = 2\n')

      const before = git(tmp, ['status', '--porcelain'])
      const mirrorBefore = git(tmp, ['hash-object', mirror]).trim()
      const authoredBefore = git(tmp, ['hash-object', authored]).trim()

      const result = run(tmp, isolatedHome(tmp))

      expect(result.status).toBe(0)
      const after = git(tmp, ['status', '--porcelain'])
      expect(before).toMatch(/^ M \.pair\/knowledge\/index\.md$/m)
      expect(before).toMatch(/^ M src\/authored\.ts$/m)
      // THE DEFECT, executed: the snapshots the staging rule compares are equal...
      expect(after).toBe(before)
      // ...yet the hand-edit is gone, replaced by what the dataset generates.
      expect(git(tmp, ['hash-object', mirror]).trim()).not.toBe(mirrorBefore)
      expect(readFileSync(mirror, 'utf-8')).toBe(KB_INDEX)
      // ...and the authored file, whose entry is identically unchanged, really is untouched.
      expect(git(tmp, ['hash-object', authored]).trim()).toBe(authoredBefore)
      expect(readFileSync(authored, 'utf-8')).toBe('export const authored = 2\n')
    },
    SCRIPT_RUN_TIMEOUT_MS,
  )

  it('exits non-zero and names the reason when the dataset is missing (AC7)', () => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'regen-mirrors-')))
    initRepo(tmp)

    const result = run(tmp, isolatedHome(tmp))

    expectRefusal(result, 'packages/knowledge-hub/dataset')
  })

  it('exits non-zero and names the reason outside a git working tree (AC7)', () => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'regen-mirrors-')))

    const result = run(tmp, { ...isolatedHome(tmp), GIT_CEILING_DIRECTORIES: tmp })

    // The full sentence, not just 'git': almost any failure mentions git, so the loose
    // form would not distinguish this branch from an unrelated crash.
    expectRefusal(result, 'not inside a git working tree')
  })

  it(
    'exits non-zero and names the reason when the toolchain has no turbo (AC7)',
    () => {
      tmp = makeToolchainFixture()

      const result = run(tmp, isolatedHome(tmp), join(tmp, 'scripts/regenerate-mirrors.sh'))

      // Softening `[ ! -x "$TURBO" ]` to a warning would let the script fall through to
      // `exec node "$CLI"` against whatever stale dist/ is on disk — a regeneration with
      // yesterday's transform, reported as success. That is the silent success AC-7 forbids.
      expectRefusal(result, 'run `pnpm install` first')
    },
    SCRIPT_RUN_TIMEOUT_MS,
  )

  it(
    'exits non-zero and names the reason when the CLI build fails (AC7)',
    () => {
      tmp = makeToolchainFixture()
      writeTurboStub(tmp, 'echo "TS2304: build exploded" >&2\nexit 1\n')

      const result = run(tmp, isolatedHome(tmp), join(tmp, 'scripts/regenerate-mirrors.sh'))

      expectRefusal(result, 'could not build the pair CLI — nothing was regenerated')
      // The build's own output is forwarded, or the developer gets a verdict with no cause.
      expect(result.stderr).toContain('TS2304: build exploded')
    },
    SCRIPT_RUN_TIMEOUT_MS,
  )

  it(
    'exits non-zero when the build claims success but produced no CLI (AC7)',
    () => {
      tmp = makeToolchainFixture()
      writeTurboStub(tmp, 'exit 0\n') // green build, no dist/cli.js written

      const result = run(tmp, isolatedHome(tmp), join(tmp, 'scripts/regenerate-mirrors.sh'))

      // Dropping this post-build check is the worst of the four: `exec node "$CLI"` on a
      // stale dist/ regenerates with yesterday's transform and EXITS 0, over output the
      // guards still reject.
      expectRefusal(result, 'the build reported success but')
      expect(result.stderr).toContain('apps/pair-cli/dist/cli.js')
    },
    SCRIPT_RUN_TIMEOUT_MS,
  )

  it(
    'removes its temporary build log when INTERRUPTED mid-build (no TMPDIR leak)',
    async () => {
      // The failure and success paths already `rm` the log explicitly. The gap is the
      // window between `mktemp` and those `rm`s: a Ctrl-C there (or a CI job cancelled
      // during the turbo build, which is where the seconds are spent) leaks one file into
      // TMPDIR per interrupted run. Only the EXIT/HUP/INT/TERM trap closes it, so this
      // case interrupts a real, slow build rather than an already-terminated one.
      tmp = makeToolchainFixture()
      writeTurboStub(tmp, 'sleep 30\n')
      const tmpEnvDir = join(tmp, '.tmpdir')
      mkdirSync(tmpEnvDir, { recursive: true })

      // `detached` so the signal reaches the whole group: sh defers a TERM trap until the
      // foreground command returns, and the foreground command here is the sleeping build.
      const child = spawn(join(tmp, 'scripts/regenerate-mirrors.sh'), [], {
        cwd: tmp,
        detached: true,
        env: { ...process.env, ...isolatedHome(tmp), TMPDIR: tmpEnvDir },
      })
      const exited = new Promise<void>(resolve => child.on('close', () => resolve()))
      await waitUntil(() => readdirSync(tmpEnvDir).length === 1)
      process.kill(-(child.pid as number), 'SIGTERM')
      await exited

      expect(readdirSync(tmpEnvDir)).toEqual([])
    },
    SCRIPT_RUN_TIMEOUT_MS,
  )

  it('has no check mode — one writer, one checker (AC8)', () => {
    const source = readFileSync(REGENERATE, 'utf-8')
    expect(source).not.toMatch(/--check\b/)
    expect(source).not.toMatch(/--dry-run\b/)
  })
})
