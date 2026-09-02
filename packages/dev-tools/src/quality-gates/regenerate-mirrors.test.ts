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

/** `git`, but a refusal is data — used to MEASURE the shapes `git hash-object` cannot read. */
function tryGit(dir: string, args: string[]): RunResult {
  try {
    return { status: 0, stdout: git(dir, args), stderr: '' }
  } catch (error) {
    const e = error as { status: number | null; stdout?: Buffer; stderr?: Buffer }
    return {
      status: e.status ?? null,
      stdout: e.stdout?.toString('utf-8') ?? '',
      stderr: e.stderr?.toString('utf-8') ?? '',
    }
  }
}

interface Snapshot {
  entries: string
  digests: Map<string, string>
}

/**
 * One porcelain entry: its two-letter status code and the worktree path it names.
 *
 * `-z` is NUL-SEPARATED and, unlike the default, never quotes or octal-escapes a path —
 * which is the whole reason the recipe uses it (round-4 finding). It costs one parsing
 * rule in exchange: a rename/copy entry spends a SECOND field on its OLD path
 * (`R  new\0old\0`), so that field must be CONSUMED, never read as an entry of its own —
 * it has no status code, and `slice(3)` over it would yield a truncated path.
 */
interface PorcelainEntry {
  xy: string
  path: string
}

function parsePorcelainZ(out: string): PorcelainEntry[] {
  const fields = out.split('\0').filter(field => field !== '')
  const entries: PorcelainEntry[] = []
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i] as string
    const xy = field.slice(0, 2)
    entries.push({ xy, path: field.slice(3) })
    if (xy.includes('R') || xy.includes('C')) i += 1
  }
  return entries
}

/**
 * /publish-pr Phase 1's before/after snapshot, executed exactly as the skill words it:
 * `git status --porcelain -z --untracked-files=all`, plus `git hash-object [-w] <path>`
 * over every entry whose worktree file still exists. `untrackedFilesAll`, `writeBlobs`
 * and `nulSeparated` are knobs ONLY so the test can run a pre-fix recipe next to the
 * fixed one and show the difference; the skill documents one setting for each.
 */
function snapshotTree(
  dir: string,
  opts: { untrackedFilesAll: boolean; writeBlobs: boolean; nulSeparated: boolean },
): Snapshot {
  const args = ['status', '--porcelain']
  if (opts.nulSeparated) args.push('-z')
  if (opts.untrackedFilesAll) args.push('--untracked-files=all')
  const entries = git(dir, args)
  const paths = opts.nulSeparated
    ? parsePorcelainZ(entries).map(entry => entry.path)
    : // The pre-fix parse, kept verbatim so the failure it produces is MEASURED, not argued:
      // a quoted/escaped path fails the exists test below and is dropped from the digest.
      entries
        .split('\n')
        .filter(Boolean)
        .map(line => line.slice(3))
  const digests = new Map<string, string>()
  for (const path of paths) {
    // "digest only entries whose worktree file exists": a deletion has nothing to read.
    if (!existsSync(join(dir, path))) continue
    const hash = ['hash-object']
    if (opts.writeBlobs) hash.push('-w')
    digests.set(path, git(dir, [...hash, path]).trim())
  }
  return { entries, digests }
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
/** A dataset file added AFTER convergence: its mirror does not exist yet, so the run creates it. */
const NEW_GUIDE = '# Mock New Guide\n'

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

  it(
    'the documented before/after recipe survives every ordinary porcelain shape',
    () => {
      // Round-3 finding, executed. The Phase-1 snapshot pass has to hold for the tree a real
      // contributor is standing in, which is not "one modified tracked file": it also has
      // uncommitted DELETIONS and NOT-YET-COMMITTED DIRECTORIES, and `git hash-object` refuses
      // both. This fixture puts all three shapes in one tree and runs the real script over it:
      //   ` D doomed.md`                     — deletion: unhashable, and a fatal here meets the
      //                                        step's own non-zero → HALT (PR blocked by the
      //                                        snapshot pass that exists to protect it);
      //   `?? .pair/knowledge/sub/note.md`   — a REGENERATED file inside an untracked directory:
      //                                        under the default -u mode it is one `?? sub/`
      //                                        entry, identical before and after, and unhashable
      //                                        — the run rewrites it and the comparison reads
      //                                        NO CHANGE, so it never gets staged;
      //   ` M .pair/knowledge/index.md`      — the overwritten hand-edit, recoverable only if the
      //                                        before digest was taken with `-w`.
      tmp = makeFixture()
      const dataset = join(tmp, 'packages/knowledge-hub/dataset')
      const mirror = join(tmp, '.pair/knowledge/index.md')
      const NESTED = '# nested note\n'
      write(join(dataset, '.pair/knowledge/sub/note.md'), NESTED)
      write(mirror, '# pre-existing install\n')

      // Converge, then commit everything EXCEPT the nested install: that directory is the
      // untracked-directory case, and it has to stay uncommitted to be one.
      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)
      const nested = join(tmp, '.pair/knowledge/sub/note.md')
      expect(readFileSync(nested, 'utf-8')).toBe(NESTED)
      write(join(tmp, '.gitignore'), '.pair/.kb-version.json\n')
      git(tmp, ['add', '-A', '--', ':!.pair/knowledge/sub'])
      git(tmp, ['commit', '-q', '-m', 'converged, nested install left uncommitted'])

      // A tracked file the contributor deleted without committing the deletion.
      write(join(tmp, 'doomed.md'), '# doomed\n')
      git(tmp, ['add', 'doomed.md'])
      git(tmp, ['commit', '-q', '-m', 'doomed'])
      rmSync(join(tmp, 'doomed.md'))

      // HEAD carries a drifted mirror (so the run writes), the worktree an uncommitted hand-edit.
      writeFileSync(mirror, '# committed drift\n')
      git(tmp, ['add', '.pair/knowledge/index.md'])
      git(tmp, ['commit', '-q', '-m', 'drifted mirror on HEAD'])
      const HAND_EDIT = '# uncommitted hand-edit\n'
      writeFileSync(mirror, HAND_EDIT)
      const NESTED_EDIT = '# nested hand-edit\n'
      writeFileSync(nested, NESTED_EDIT)

      // THE PRE-FIX RECIPE, measured: two of the three shapes are fatal, not hashable.
      const defaultPorcelain = git(tmp, ['status', '--porcelain'])
      expect(defaultPorcelain).toMatch(/^\?\? \.pair\/knowledge\/sub\/$/m)
      expect(tryGit(tmp, ['hash-object', '.pair/knowledge/sub/']).stderr).toContain(
        'fatal: Unable to hash',
      )
      expect(tryGit(tmp, ['hash-object', 'doomed.md']).stderr).toContain(
        "fatal: could not open 'doomed.md' for reading",
      )
      expect(tryGit(tmp, ['hash-object', 'doomed.md']).status).toBe(128)

      const before = snapshotTree(tmp, {
        untrackedFilesAll: true,
        writeBlobs: true,
        nulSeparated: true,
      })
      const beforeEntries = parsePorcelainZ(before.entries)
      expect(beforeEntries).toContainEqual({ xy: ' D', path: 'doomed.md' })
      expect(beforeEntries).toContainEqual({ xy: ' M', path: '.pair/knowledge/index.md' })
      // -uall is what turns the collapsed `?? sub/` into a hashable per-file entry.
      expect(beforeEntries).toContainEqual({ xy: '??', path: '.pair/knowledge/sub/note.md' })
      expect(before.digests.has('doomed.md')).toBe(false)
      expect(before.digests.has('.pair/knowledge/sub/note.md')).toBe(true)

      const result = run(tmp, isolatedHome(tmp))
      expect(result.status).toBe(0)

      const after = snapshotTree(tmp, {
        untrackedFilesAll: true,
        writeBlobs: false,
        nulSeparated: true,
      })
      // Status is blind to BOTH overwrites — that is why the digest half exists...
      expect(after.entries).toBe(before.entries)
      // ...and with the recipe as documented, both are detected.
      expect(after.digests.get('.pair/knowledge/index.md')).not.toBe(
        before.digests.get('.pair/knowledge/index.md'),
      )
      expect(after.digests.get('.pair/knowledge/sub/note.md')).not.toBe(
        before.digests.get('.pair/knowledge/sub/note.md'),
      )
      expect(readFileSync(mirror, 'utf-8')).toBe(KB_INDEX)
      expect(readFileSync(nested, 'utf-8')).toBe(NESTED)

      // The deletion is untouched by the run, and its survival is carried by the entry —
      // the Verify's on-disk qualifier is sound because status DOES move on a recreated path.
      expect(existsSync(join(tmp, 'doomed.md'))).toBe(false)

      // `-w` is the difference between naming the loss and undoing it.
      const mirrorSha = before.digests.get('.pair/knowledge/index.md')
      const nestedSha = before.digests.get('.pair/knowledge/sub/note.md')
      expect(mirrorSha).toBeDefined()
      expect(nestedSha).toBeDefined()
      expect(git(tmp, ['cat-file', '-p', mirrorSha ?? ''])).toBe(HAND_EDIT)
      expect(git(tmp, ['cat-file', '-p', nestedSha ?? ''])).toBe(NESTED_EDIT)
      // Without `-w` the same content hashes to the same sha and lands nowhere: the report row
      // would name a path whose bytes are in no HEAD, no index, no disk and no ODB.
      const control = join(tmp, 'control.md')
      writeFileSync(control, '# not written to the ODB\n')
      const unwritten = git(tmp, ['hash-object', control]).trim()
      writeFileSync(control, '# overwritten\n')
      expect(tryGit(tmp, ['cat-file', '-p', unwritten]).stderr).toContain('Not a valid object name')
    },
    SCRIPT_RUN_TIMEOUT_MS,
  )

  it(
    'the snapshot recipe sees a path with a space and a non-ASCII byte — the default parse does not',
    () => {
      // Round-4 finding, executed. Porcelain v1 QUOTES and octal-escapes any path holding a
      // space or a non-ASCII byte, so `line.slice(3)` yields `"caff\303\250.md"` — a string
      // that is not a filename. The entry then fails every "does the worktree file exist"
      // test and is DROPPED from the digest, which is the same status-vs-content blindness
      // the digest exists to close, reached through the parser instead of through `git`.
      //
      // CONCRETE LOSS this fixture reproduces: a generated mirror at `.pair/knowledge/con
      // spazio.md`, already dirty with an uncommitted hand-edit, is overwritten by the run.
      // Its porcelain entry is ` M "con spazio.md"` before AND after (status unchanged) and
      // its digest was never taken — so the comparison reads NO CHANGE: the hand-edit is
      // destroyed with no `recover:` row, and the regenerated bytes are never staged, so the
      // branch pushes the stale mirror and its own conformance job goes red.
      tmp = makeFixture()
      const dataset = join(tmp, 'packages/knowledge-hub/dataset')
      const SPACED = '# spaced note\n'
      const ACCENTED = '# accented note\n'
      write(join(dataset, '.pair/knowledge/con spazio.md'), SPACED)
      write(join(dataset, '.pair/knowledge/caffè.md'), ACCENTED)
      write(join(tmp, '.pair/knowledge/index.md'), '# pre-existing install\n')

      // Converge and commit, so the only writes the case measures are the two overwrites.
      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)
      const spaced = join(tmp, '.pair/knowledge/con spazio.md')
      const accented = join(tmp, '.pair/knowledge/caffè.md')
      expect(readFileSync(spaced, 'utf-8')).toBe(SPACED)
      expect(readFileSync(accented, 'utf-8')).toBe(ACCENTED)
      git(tmp, ['add', '-A'])
      git(tmp, ['commit', '-q', '-m', 'converged'])

      // HEAD carries drift on both, so the run genuinely writes and the entries stay ` M `.
      writeFileSync(spaced, '# committed drift\n')
      writeFileSync(accented, '# committed drift\n')
      git(tmp, ['add', '-A'])
      git(tmp, ['commit', '-q', '-m', 'drifted mirrors on HEAD'])

      // Uncommitted hand-edits on both: pre-dirty, so ONLY the digest can see the overwrite.
      const SPACED_EDIT = '# spaced hand-edit\n'
      const ACCENTED_EDIT = '# accented hand-edit\n'
      writeFileSync(spaced, SPACED_EDIT)
      writeFileSync(accented, ACCENTED_EDIT)

      // THE PRE-FIX PARSE, measured: quoted and escaped, so neither path is digested.
      const quoted = git(tmp, ['status', '--porcelain', '--untracked-files=all'])
      expect(quoted).toMatch(/^ M "\.pair\/knowledge\/con spazio\.md"$/m)
      expect(quoted).toMatch(/^ M "\.pair\/knowledge\/caff\\303\\250\.md"$/m)
      const preFix = snapshotTree(tmp, {
        untrackedFilesAll: true,
        writeBlobs: true,
        nulSeparated: false,
      })
      expect(preFix.digests.has('.pair/knowledge/con spazio.md')).toBe(false)
      expect(preFix.digests.has('.pair/knowledge/caffè.md')).toBe(false)

      const before = snapshotTree(tmp, {
        untrackedFilesAll: true,
        writeBlobs: true,
        nulSeparated: true,
      })
      const beforeEntries = parsePorcelainZ(before.entries)
      // -z prints the real bytes: no quotes, no octal escapes.
      expect(beforeEntries).toContainEqual({ xy: ' M', path: '.pair/knowledge/con spazio.md' })
      expect(beforeEntries).toContainEqual({ xy: ' M', path: '.pair/knowledge/caffè.md' })
      expect(before.digests.has('.pair/knowledge/con spazio.md')).toBe(true)
      expect(before.digests.has('.pair/knowledge/caffè.md')).toBe(true)

      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)

      const after = snapshotTree(tmp, {
        untrackedFilesAll: true,
        writeBlobs: false,
        nulSeparated: true,
      })
      // Status is identical across the run for both paths — the overwrite is invisible there.
      expect(after.entries).toBe(before.entries)
      // ...and the documented recipe detects it, on both, and can hand the bytes back.
      for (const [rel, edit] of [
        ['.pair/knowledge/con spazio.md', SPACED_EDIT],
        ['.pair/knowledge/caffè.md', ACCENTED_EDIT],
      ] as const) {
        expect(after.digests.get(rel)).not.toBe(before.digests.get(rel))
        expect(git(tmp, ['cat-file', '-p', before.digests.get(rel) ?? ''])).toBe(edit)
      }
      expect(readFileSync(spaced, 'utf-8')).toBe(SPACED)
      expect(readFileSync(accented, 'utf-8')).toBe(ACCENTED)

      // Second shape from the same finding: a NEW generated file with a space appears only in
      // the after snapshot, so status DOES catch it — but under the default parse the agent
      // stages the literal quoted string, and `git add` refuses it as a pathspec.
      expect(tryGit(tmp, ['add', '"con spazio.md"']).stderr).toContain('did not match any files')
    },
    SCRIPT_RUN_TIMEOUT_MS,
  )

  it(
    'the regeneration commit carries only the regenerated paths, never a pre-STAGED authored file',
    () => {
      // Round-4 finding, executed. The staging rule protects UNSTAGED authored work, but a
      // plain `git commit` after `git add <paths>` commits THE WHOLE INDEX — and publish-pr
      // is standalone, explicitly runs on a dirty tree, and a resumed/interrupted implement
      // leaves a populated index. CONCRETE LOSS: the contributor's staged prose lands inside
      // `chore: regenerate mirrors from local dataset`, a commit they never wrote — verbatim
      // the harm the whole staging-rule section exists to prevent, reached through the index
      // instead of through a glob. The documented form commits by PATHSPEC, which cannot.
      tmp = makeFixture()
      const mirror = join(tmp, '.pair/knowledge/index.md')
      const authored = join(tmp, 'src/authored.ts')
      write(authored, 'export const authored = 1\n')
      write(mirror, '# pre-existing install\n')

      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)
      git(tmp, ['add', '-A'])
      git(tmp, ['commit', '-q', '-m', 'converged'])

      // HEAD carries a drifted mirror, so the run writes something...
      writeFileSync(mirror, '# committed drift\n')
      git(tmp, ['add', '-A'])
      git(tmp, ['commit', '-q', '-m', 'drifted mirror on HEAD'])
      // ...and the contributor has ALREADY STAGED an authored change before the run.
      writeFileSync(authored, 'export const authored = 2\n')
      git(tmp, ['add', 'src/authored.ts'])

      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)

      // The control: the index-based form, measured. It sweeps the staged prose in.
      const REL = '.pair/knowledge/index.md'
      const MSG = 'chore: regenerate mirrors from local dataset'
      git(tmp, ['add', REL])
      git(tmp, ['commit', '-q', '-m', MSG])
      expect(
        git(tmp, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter(Boolean).sort(),
      ).toEqual([REL, 'src/authored.ts'])

      // The documented form, on the same state: pathspec, so the index is not consulted.
      git(tmp, ['reset', '-q', '--soft', 'HEAD~1'])
      git(tmp, ['commit', '-q', '-m', MSG, '--', REL])
      expect(
        git(tmp, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter(Boolean),
      ).toEqual([REL])
      // The contributor's prose is still THEIRS: staged, uncommitted, unmodified.
      expect(parsePorcelainZ(git(tmp, ['status', '--porcelain', '-z']))).toEqual([
        { xy: 'M ', path: 'src/authored.ts' },
      ])
      expect(readFileSync(authored, 'utf-8')).toBe('export const authored = 2\n')
    },
    SCRIPT_RUN_TIMEOUT_MS,
  )

  it(
    'stages a newly created mirror before committing it — a pathspec alone cannot name it',
    () => {
      // The residual of the round-4 pathspec fix, and its paired failure path. `git commit --
      // <paths>` resolves the pathspec against paths git ALREADY KNOWS (index or HEAD). The
      // single most common way this step produces a path at all is a contributor ADDING a file
      // to the dataset — the one case a published-KB install provably cannot serve — and the
      // run then CREATES its mirror: a `??` entry, which git does not know. CONCRETE FAILURE:
      // the pathspec commit exits 1 with `error: pathspec ... did not match any file(s) known
      // to git` and aborts WHOLE, so the regenerated mirror is never committed; the branch is
      // pushed without it and its own `skills:conformance` job goes red — the exact drift the
      // realignment step exists to remove, now caused by the step. It is silent until then
      // because a MODIFIED tracked mirror commits by pathspec while unstaged (asserted below),
      // so a recipe without `git add` works on every drifted mirror and fails on the first new
      // one.
      tmp = makeFixture()
      const authored = join(tmp, 'src/authored.ts')
      write(authored, 'export const authored = 1\n')
      write(join(tmp, '.pair/knowledge/index.md'), '# pre-existing install\n')

      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)
      git(tmp, ['add', '-A'])
      git(tmp, ['commit', '-q', '-m', 'converged'])

      // A drifted tracked mirror (the ` M ` row) AND a brand-new dataset file whose mirror does
      // not exist yet (the `??` row) — the two shapes one realignment run routinely produces.
      writeFileSync(join(tmp, '.pair/knowledge/index.md'), '# committed drift\n')
      write(join(tmp, 'packages/knowledge-hub/dataset/.pair/knowledge/new-guide.md'), NEW_GUIDE)
      git(tmp, ['add', '-A'])
      git(tmp, ['commit', '-q', '-m', 'drifted mirror + a new dataset file'])
      // ...and the contributor has already staged authored work, so the round-4 property
      // (a pre-STAGED path is never swept in) has to survive the added `git add` too.
      writeFileSync(authored, 'export const authored = 2\n')
      git(tmp, ['add', 'src/authored.ts'])

      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)

      const DRIFTED = '.pair/knowledge/index.md'
      const CREATED = '.pair/knowledge/new-guide.md'
      const MSG = 'chore: regenerate mirrors from local dataset'
      // The run created the new mirror from the LOCAL dataset (no release carries it)...
      expect(readFileSync(join(tmp, CREATED), 'utf-8')).toBe(NEW_GUIDE)
      // ...and it is untracked, which is the whole defect.
      expect(parsePorcelainZ(git(tmp, ['status', '--porcelain', '-z', '-uall']))).toContainEqual({
        xy: '??',
        path: CREATED,
      })

      // Pathspec WITHOUT the `git add`: refused, and it takes the drifted mirror down with it.
      const head = git(tmp, ['rev-parse', 'HEAD']).trim()
      const refused = tryGit(tmp, ['commit', '-m', MSG, '--', CREATED, DRIFTED])
      expect(refused.status).not.toBe(0)
      expect(refused.stderr).toContain(`did not match any file(s) known to git`)
      expect(git(tmp, ['rev-parse', 'HEAD']).trim()).toBe(head)

      // Why the omission stays invisible: the tracked, unstaged, MODIFIED mirror commits by
      // pathspec on its own. Every drifted-mirror run works; only a new mirror breaks.
      git(tmp, ['commit', '-q', '-m', MSG, '--', DRIFTED])
      expect(
        git(tmp, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter(Boolean),
      ).toEqual([DRIFTED])
      git(tmp, ['reset', '-q', '--soft', 'HEAD~1'])
      git(tmp, ['reset', '-q', 'HEAD', '--', DRIFTED])

      // The documented form: stage the same set first, then scope the commit by pathspec.
      git(tmp, ['add', CREATED, DRIFTED])
      git(tmp, ['commit', '-q', '-m', MSG, '--', CREATED, DRIFTED])
      expect(
        git(tmp, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter(Boolean).sort(),
      ).toEqual([CREATED, DRIFTED].sort())
      // The `git add` did not cost the round-4 property: the prose is still staged, uncommitted.
      expect(parsePorcelainZ(git(tmp, ['status', '--porcelain', '-z', '-uall']))).toEqual([
        { xy: 'M ', path: 'src/authored.ts' },
      ])
      expect(readFileSync(authored, 'utf-8')).toBe('export const authored = 2\n')
    },
    SCRIPT_RUN_TIMEOUT_MS,
  )

  it(
    'deletes an uncommitted file under a mirror registry — nothing to stage, only the `-w` blob survives',
    () => {
      // Round-6 finding (Major), executed against the real script. The `knowledge` registry is
      // `behavior: "mirror"` (apps/pair-cli/config.json): the target is made EQUAL to the dataset,
      // so a file only the target has is REMOVED — including a contributor's draft that was never
      // in the dataset. Two shapes HEAD does not know, both destroyed by the run:
      //   `?? .pair/knowledge/wip-draft.md`     — untracked: entry DISAPPEARS after the run;
      //   `A  .pair/knowledge/staged-draft.md`  — staged-new: entry becomes `AD`.
      // Under step 4 as first written both are "entry changed ⇒ in the set", and the documented
      // next step is fatal: `git add wip-draft.md` -> `fatal: pathspec ... did not match any
      // files`, exit 128; `git add staged-draft.md` exits 0 (it stages the REMOVAL) and then the
      // pathspec commit is `error: pathspec ... did not match any file(s) known to git`, exit 1,
      // taking every genuine regeneration in the same set down with it. CONCRETE LOSS: Phase 1
      // aborts AFTER the destructive run — the regenerated mirrors sit uncommitted, the branch
      // pushes stale and its own conformance job goes red — and the draft is gone with NO report
      // row, because `overwrote uncommitted changes in:` fires only on a digest that MOVED, never
      // on an entry that vanished. The fix: such paths leave the stageable set and are named as
      // `removed untracked: <path> (recover: git cat-file -p <sha> > <path>)`.
      tmp = makeFixture()
      write(join(tmp, '.pair/knowledge/index.md'), '# pre-existing install\n')
      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)
      git(tmp, ['add', '-A'])
      git(tmp, ['commit', '-q', '-m', 'converged'])

      const WIP = '.pair/knowledge/wip-draft.md'
      const STAGED = '.pair/knowledge/staged-draft.md'
      const CREATED = '.pair/knowledge/new-guide.md'
      const WIP_CONTENT = '# my wip draft\n'
      const STAGED_CONTENT = '# my staged draft\n'
      // One genuine regeneration in the same run, so the set is MIXED: the recipe has to land
      // this one while leaving the two removed paths out of `git add` and the pathspec.
      write(join(tmp, 'packages/knowledge-hub/dataset/.pair/knowledge/new-guide.md'), NEW_GUIDE)
      git(tmp, ['add', 'packages/knowledge-hub/dataset'])
      git(tmp, ['commit', '-q', '-m', 'a new dataset file'])
      write(join(tmp, WIP), WIP_CONTENT)
      write(join(tmp, STAGED), STAGED_CONTENT)
      git(tmp, ['add', STAGED])

      const before = snapshotTree(tmp, {
        untrackedFilesAll: true,
        writeBlobs: true,
        nulSeparated: true,
      })
      expect(parsePorcelainZ(before.entries)).toEqual(
        expect.arrayContaining([
          { xy: '??', path: WIP },
          { xy: 'A ', path: STAGED },
        ]),
      )
      // Both have a file on disk before the run, so both are digested — with `-w`.
      expect(before.digests.has(WIP)).toBe(true)
      expect(before.digests.has(STAGED)).toBe(true)

      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)

      // THE EFFECT, measured: the mirror registry removed what the dataset does not ship.
      expect(existsSync(join(tmp, WIP))).toBe(false)
      expect(existsSync(join(tmp, STAGED))).toBe(false)
      const afterEntries = parsePorcelainZ(
        git(tmp, ['status', '--porcelain', '-z', '--untracked-files=all']),
      )
      expect(afterEntries.find(entry => entry.path === WIP)).toBeUndefined()
      expect(afterEntries).toContainEqual({ xy: 'AD', path: STAGED })
      expect(afterEntries).toContainEqual({ xy: '??', path: CREATED })

      // THE PRE-FIX RECIPE, measured: both removed paths are in the set, and staging them is fatal.
      const MSG = 'chore: regenerate mirrors from local dataset'
      const head = git(tmp, ['rev-parse', 'HEAD']).trim()
      const addWip = tryGit(tmp, ['add', WIP])
      expect(addWip.status).toBe(128)
      expect(addWip.stderr).toContain(`fatal: pathspec '${WIP}' did not match any files`)
      // The staged-new shape is worse: `git add` SUCCEEDS (it stages the removal, dropping the
      // index's only copy), and the failure moves to the commit — which aborts whole.
      expect(tryGit(tmp, ['add', STAGED, CREATED]).status).toBe(0)
      const refused = tryGit(tmp, ['commit', '-m', MSG, '--', STAGED, CREATED])
      expect(refused.status).toBe(1)
      expect(refused.stderr).toContain(
        `pathspec '${STAGED}' did not match any file(s) known to git`,
      )
      expect(git(tmp, ['rev-parse', 'HEAD']).trim()).toBe(head)

      // THE DOCUMENTED RECIPE: the removed paths are not in `git add` and not in the pathspec.
      // They are reported instead, and the genuine regeneration lands.
      git(tmp, ['add', CREATED])
      expect(tryGit(tmp, ['diff', '--cached', '--quiet', '--', CREATED]).status).toBe(1)
      git(tmp, ['commit', '-q', '-m', MSG, '--', CREATED])
      expect(
        git(tmp, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter(Boolean),
      ).toEqual([CREATED])

      // The `recover:` recipe, applied as documented: the blob is the ONLY copy, and it is enough.
      for (const [rel, content] of [
        [WIP, WIP_CONTENT],
        [STAGED, STAGED_CONTENT],
      ] as const) {
        const sha = before.digests.get(rel)
        expect(sha).toBeDefined()
        expect(git(tmp, ['cat-file', '-p', sha ?? ''])).toBe(content)
        writeFileSync(join(tmp, rel), git(tmp, ['cat-file', '-p', sha ?? '']))
        expect(readFileSync(join(tmp, rel), 'utf-8')).toBe(content)
      }
    },
    SCRIPT_RUN_TIMEOUT_MS,
  )

  it(
    'a non-empty set whose cached diff is empty is a no-op, never a failed commit',
    () => {
      // Round-6 finding (Minor), executed. Three shapes where the run rewrites a path whose
      // dataset render EQUALS HEAD — so after `git add <path>` the index equals HEAD and there is
      // nothing to commit, while the porcelain entry DID move (so the path is in the set):
      //   `M  a.md` staged hand-edit    -> run rewrites worktree -> `MM a.md`
      //   `D  b.md` staged deletion     -> run recreates          -> `D  b.md` + `?? b.md`
      //   ` M c.md` unstaged hand-edit  -> run rewrites worktree -> entry GONE
      // MEASURED: `git add a b c` exits 0, `git diff --cached --quiet -- a b c` exits 0 (empty),
      // and `git commit -m … -- a b c` is `nothing to commit, working tree clean`, exit 1 — a
      // step with no branch for it aborts Phase 1 mid-way, and (a)/(c)'s hand-edits are gone from
      // index and disk with no report row, because they entered the set via ENTRY change, not via
      // a digest that moved on an unchanged entry. The documented recipe checks the cached diff
      // after staging: empty ⇒ no commit, no `Mirrors:` row — but every path whose before digest
      // differs from its after content is STILL named on the recover row.
      tmp = makeFixture()
      const dataset = join(tmp, 'packages/knowledge-hub/dataset')
      const A = '.pair/knowledge/a.md'
      const B = '.pair/knowledge/b.md'
      const C = '.pair/knowledge/c.md'
      const D = '.pair/knowledge/d.md'
      for (const rel of [A, B, C]) write(join(dataset, rel), `# ${rel}\n`)
      write(join(tmp, '.pair/knowledge/index.md'), '# pre-existing install\n')
      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)
      git(tmp, ['add', '-A'])
      git(tmp, ['commit', '-q', '-m', 'converged — every render equals HEAD'])

      const A_EDIT = '# staged hand-edit\n'
      const C_EDIT = '# unstaged hand-edit\n'
      writeFileSync(join(tmp, A), A_EDIT)
      git(tmp, ['add', A])
      git(tmp, ['rm', '-q', B])
      writeFileSync(join(tmp, C), C_EDIT)

      const before = snapshotTree(tmp, {
        untrackedFilesAll: true,
        writeBlobs: true,
        nulSeparated: true,
      })
      expect(parsePorcelainZ(before.entries)).toEqual(
        expect.arrayContaining([
          { xy: 'M ', path: A },
          { xy: 'D ', path: B },
          { xy: ' M', path: C },
        ]),
      )

      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)

      const afterEntries = parsePorcelainZ(
        git(tmp, ['status', '--porcelain', '-z', '--untracked-files=all']),
      )
      expect(afterEntries).toContainEqual({ xy: 'MM', path: A })
      expect(afterEntries).toContainEqual({ xy: 'D ', path: B })
      expect(afterEntries).toContainEqual({ xy: '??', path: B })
      expect(afterEntries.find(entry => entry.path === C)).toBeUndefined()

      // THE PRE-FIX RECIPE, measured: stage the set, commit by pathspec -> exit 1, HEAD unmoved.
      const MSG = 'chore: regenerate mirrors from local dataset'
      const head = git(tmp, ['rev-parse', 'HEAD']).trim()
      expect(tryGit(tmp, ['add', A, B, C]).status).toBe(0)
      expect(tryGit(tmp, ['diff', '--cached', '--quiet', '--', A, B, C]).status).toBe(0)
      const refused = tryGit(tmp, ['commit', '-m', MSG, '--', A, B, C])
      expect(refused.status).toBe(1)
      expect(refused.stdout).toContain('nothing to commit')
      expect(git(tmp, ['rev-parse', 'HEAD']).trim()).toBe(head)

      // The hand-edits are gone from disk AND index — the `-w` blob is the only copy left, and the
      // recover row has to be emitted from the digest comparison, not from the entry comparison.
      const after = snapshotTree(tmp, {
        untrackedFilesAll: true,
        writeBlobs: false,
        nulSeparated: true,
      })
      expect(git(tmp, ['hash-object', A]).trim()).not.toBe(before.digests.get(A))
      expect(git(tmp, ['hash-object', C]).trim()).not.toBe(before.digests.get(C))
      expect(after.digests.size).toBe(0) // the tree is clean: nothing dirty is left to digest
      expect(git(tmp, ['cat-file', '-p', before.digests.get(A) ?? ''])).toBe(A_EDIT)
      expect(git(tmp, ['cat-file', '-p', before.digests.get(C) ?? ''])).toBe(C_EDIT)
      expect(before.digests.has(B)).toBe(false) // a deletion has no digest by construction

      // The MIXED set: the same three no-op paths plus one genuine regeneration. The cached diff
      // over the whole set is non-empty, the pathspec commit succeeds, and its file list is the
      // CACHED list — not the set — which is what the Verify has to compare against.
      write(join(dataset, D), `# ${D}\n`)
      git(tmp, ['add', 'packages/knowledge-hub/dataset'])
      git(tmp, ['commit', '-q', '-m', 'a new dataset file'])
      writeFileSync(join(tmp, A), A_EDIT)
      git(tmp, ['add', A])
      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)
      git(tmp, ['add', A, D])
      expect(tryGit(tmp, ['diff', '--cached', '--quiet', '--', A, D]).status).toBe(1)
      expect(
        git(tmp, ['diff', '--cached', '--name-only', '--', A, D]).split('\n').filter(Boolean),
      ).toEqual([D])
      git(tmp, ['commit', '-q', '-m', MSG, '--', A, D])
      expect(
        git(tmp, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter(Boolean),
      ).toEqual([D])
    },
    SCRIPT_RUN_TIMEOUT_MS,
  )

  it(
    'indexes an untracked adoption file into the generated llms.txt — stash it before the run',
    () => {
      // Round-6 finding (Minor), executed. The `adoption` registry is `behavior: "add"` (a file
      // only the target has SURVIVES), and `generateLlmsTxt` (apps/pair-cli/src/registry/
      // llms-generation.ts) indexes the WHOLE `.pair/adoption/**` tree it finds on disk —
      // untracked files included. CONCRETE FAILURE: untracked `.pair/adoption/tech/wip-note.md`
      // -> the run rewrites `.pair/llms.txt` with `- [adoption note](.pair/adoption/tech/
      // wip-note.md)`. Under the staging rule `.pair/llms.txt` (entry appeared) is committed and
      // `wip-note.md` (entry unchanged, `??`) is not: the committed index carries a dangling link
      // and the contributor's private WIP filename lands in history. Bytes are untouched, so the
      // story's "unstaged authored changes must be left untouched" holds — and the derived output
      // still leaks. The remedy the skill names is measured here to its postcondition.
      tmp = makeFixture()
      write(join(tmp, '.pair/knowledge/index.md'), '# pre-existing install\n')
      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)
      git(tmp, ['add', '-A'])
      git(tmp, ['commit', '-q', '-m', 'converged'])
      const LLMS = '.pair/llms.txt'
      const NOTE = '.pair/adoption/tech/wip-note.md'
      const LINK = '- [adoption note](.pair/adoption/tech/wip-note.md)'
      expect(readFileSync(join(tmp, LLMS), 'utf-8')).not.toContain('wip-note')

      write(join(tmp, NOTE), '# adoption note\n')
      const before = snapshotTree(tmp, {
        untrackedFilesAll: true,
        writeBlobs: true,
        nulSeparated: true,
      })
      expect(parsePorcelainZ(before.entries)).toEqual([{ xy: '??', path: NOTE }])

      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)

      // THE EFFECT, measured: the note survives (add behaviour) and the index now links it.
      expect(readFileSync(join(tmp, NOTE), 'utf-8')).toBe('# adoption note\n')
      expect(readFileSync(join(tmp, LLMS), 'utf-8')).toContain(LINK)
      const afterEntries = parsePorcelainZ(
        git(tmp, ['status', '--porcelain', '-z', '--untracked-files=all']),
      )
      expect(afterEntries).toEqual(
        expect.arrayContaining([
          { xy: ' M', path: LLMS },
          { xy: '??', path: NOTE },
        ]),
      )
      // ...so the staging rule commits the index WITHOUT its target: a dangling link in history.
      const MSG = 'chore: regenerate mirrors from local dataset'
      git(tmp, ['add', LLMS])
      git(tmp, ['commit', '-q', '-m', MSG, '--', LLMS])
      expect(git(tmp, ['show', `HEAD:${LLMS}`])).toContain(LINK)
      expect(tryGit(tmp, ['cat-file', '-e', `HEAD:${NOTE}`]).status).not.toBe(0)

      // THE DOCUMENTED REMEDY, applied to its postcondition: stash the untracked path, run, pop.
      git(tmp, ['reset', '-q', '--hard', 'HEAD~1'])
      expect(readFileSync(join(tmp, LLMS), 'utf-8')).not.toContain('wip-note')
      git(tmp, ['stash', 'push', '-u', '-q', '--', NOTE])
      expect(existsSync(join(tmp, NOTE))).toBe(false)
      expect(run(tmp, isolatedHome(tmp)).status).toBe(0)
      expect(git(tmp, ['status', '--porcelain', '-z', '--untracked-files=all'])).toBe('')
      expect(readFileSync(join(tmp, LLMS), 'utf-8')).not.toContain('wip-note')
      git(tmp, ['stash', 'pop', '-q'])
      expect(readFileSync(join(tmp, NOTE), 'utf-8')).toBe('# adoption note\n')
      expect(parsePorcelainZ(git(tmp, ['status', '--porcelain', '-z', '-uall']))).toEqual([
        { xy: '??', path: NOTE },
      ])
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
