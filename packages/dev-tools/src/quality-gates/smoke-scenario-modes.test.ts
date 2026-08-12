import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

import {
  EXECUTABLE_MODE,
  MUST_BE_EXECUTABLE,
  parseGitIndexEntries,
  requiresExecutableBit,
  findNonExecutable,
  checkSmokeScenarioModes,
  checkThisRepoSmokeScenarioModes,
  readSmokeTestsIndex,
} from './smoke-scenario-modes'

// #400. `scripts/smoke-tests/scenarios/coverage-gate.sh` was committed with mode
// 100644 in PR #368 and stayed unexecutable for weeks: the runner could only say
// `Permission denied` -> FAIL, indistinguishable from a real assertion failure,
// and nothing in CI ran the suite at all so nobody read the line.
//
// The guard reads the GIT INDEX (`git ls-files -s`), never the filesystem, so it
// asserts the STAGED mode — what is about to be committed, and what `HEAD` carries
// once it is. A `test -x` on the working tree passes on a filesystem that carries
// the bit locally while the tracked mode stays 644 — which is the regression that
// must be caught, on every checkout and platform.
//
// Fixtures below are literal `git ls-files -s -z` records:
// `<mode> <sha> <stage>\t<path>`, NUL-terminated (never newline-separated — a
// path may legally contain a newline, which is exactly why `-z` is used).
const sha = '0000000000000000000000000000000000000000'
const entry = (mode: string, path: string): string => `${mode} ${sha} 0\t${path}\0`

const executableFixture = [
  entry(EXECUTABLE_MODE, 'scripts/smoke-tests/run-all.sh'),
  entry(EXECUTABLE_MODE, 'scripts/smoke-tests/scenarios/install-basic.sh'),
  entry(EXECUTABLE_MODE, 'scripts/smoke-tests/scenarios/coverage-gate.sh'),
  entry('100644', 'scripts/smoke-tests/lib/utils.sh'),
  entry('100644', 'scripts/smoke-tests/README.md'),
].join('')

describe('parseGitIndexEntries reads `git ls-files -s -z` output (#400)', () => {
  it('extracts mode and path from a tab-separated index record', () => {
    expect(parseGitIndexEntries(entry('100755', 'scripts/smoke-tests/run-all.sh'))).toEqual([
      { mode: '100755', path: 'scripts/smoke-tests/run-all.sh' },
    ])
  })

  it('reads a path containing spaces (the tab, not whitespace, is the separator)', () => {
    expect(parseGitIndexEntries(entry('100644', 'scripts/smoke-tests/a file.sh'))[0]?.path).toBe(
      'scripts/smoke-tests/a file.sh',
    )
  })

  it('ignores empty records instead of emitting empty entries', () => {
    expect(parseGitIndexEntries(`\0${entry('100755', 'x.sh')}\0`)).toHaveLength(1)
  })

  it('returns nothing for empty output rather than throwing', () => {
    expect(parseGitIndexEntries('')).toEqual([])
  })

  // A malformed record must be DROPPED, not turned into a plausible-looking entry.
  // Taking the mode as `slice(0, indexOf(' '))` on a record with a tab but no space
  // yields `indexOf(' ') === -1` -> `slice(0, -1)`, i.e. the record minus its last
  // character, which then fails the `!== 100755` check and is reported as a
  // non-executable file with a nonsense mode: a confident wrong diagnosis.
  it('drops a record whose pre-tab segment carries no mode instead of inventing one', () => {
    expect(parseGitIndexEntries('scripts/smoke-tests/scenarios/x.sh')).toEqual([])
    expect(parseGitIndexEntries('\tscripts/smoke-tests/scenarios/x.sh')).toEqual([])
  })

  it('takes the mode from the pre-tab segment, never from the path after it', () => {
    // No space before the tab: the whole pre-tab segment is the mode.
    expect(parseGitIndexEntries('100755\tscripts/smoke-tests/run-all.sh')).toEqual([
      { mode: '100755', path: 'scripts/smoke-tests/run-all.sh' },
    ])
  })

  // Path bytes are the identity of the file the failure message names: a blanket
  // `.trim()` on the record silently rewrites a path with a trailing space, and the
  // path the developer is told to `chmod` then does not exist.
  it('preserves a path with a trailing space verbatim', () => {
    expect(
      parseGitIndexEntries(entry('100644', 'scripts/smoke-tests/scenarios/x .sh '))[0],
    ).toEqual({ mode: '100644', path: 'scripts/smoke-tests/scenarios/x .sh ' })
  })

  // Same invariant, for the one class git ACTUALLY rewrites. Without `-z`, and
  // with `core.quotePath` at its default, git C-quotes any path carrying
  // non-ASCII bytes, a control character, a quote or a backslash, emitting
  // `"scripts/…/sc\303\251nario.sh"` — the remedy would then name a path that
  // does not exist. `-z` disables quoting entirely, so the parser must accept
  // the byte-exact path and a NEWLINE inside it.
  it('preserves a non-ASCII path byte-exact (no C-quoting under -z)', () => {
    expect(
      parseGitIndexEntries(entry('100644', 'scripts/smoke-tests/scenarios/scénario.sh'))[0],
    ).toEqual({ mode: '100644', path: 'scripts/smoke-tests/scenarios/scénario.sh' })
  })

  it('preserves a path containing a newline (only NUL terminates a record)', () => {
    expect(
      parseGitIndexEntries(entry('100644', 'scripts/smoke-tests/scenarios/a\nb.sh'))[0]?.path,
    ).toBe('scripts/smoke-tests/scenarios/a\nb.sh')
  })
})

describe('requiresExecutableBit covers what the RUNNER executes (#400)', () => {
  it('requires the bit on every scenario', () => {
    expect(requiresExecutableBit('scripts/smoke-tests/scenarios/coverage-gate.sh')).toBe(true)
  })

  it('requires the bit on the runner itself', () => {
    expect(requiresExecutableBit('scripts/smoke-tests/run-all.sh')).toBe(true)
  })

  // `lib/utils.sh` is SOURCED by scenarios, never executed: demanding +x there
  // would teach contributors that the guard is noise, and a guard people route
  // around asserts nothing (the #394 lesson).
  it('exempts the sourced library and the docs/fixtures around it', () => {
    expect(requiresExecutableBit('scripts/smoke-tests/lib/utils.sh')).toBe(false)
    expect(requiresExecutableBit('scripts/smoke-tests/README.md')).toBe(false)
    expect(requiresExecutableBit('scripts/smoke-tests/fixtures/github-pr-reviews.json')).toBe(false)
  })

  // The predicate is exactly the runner's glob (`"$SCENARIOS_DIR"/*.sh`), which
  // the AC7 membership audit in `runner-outcomes.sh` also uses. Data sitting
  // NEXT TO the scenarios is read, not executed: demanding +x on a JSON fixture
  // is a guard that misdiagnoses, and misdiagnosis is what gets a guard routed
  // around.
  it('exempts a data file inside scenarios/ — only *.sh is executed', () => {
    expect(requiresExecutableBit('scripts/smoke-tests/scenarios/fixtures/gh-response.json')).toBe(
      false,
    )
    expect(requiresExecutableBit('scripts/smoke-tests/scenarios/README.md')).toBe(false)
  })

  // Nesting does not exist for this suite: the runner globs top-level `*.sh`
  // only, and so does the CI-membership audit. Requiring the bit on a nested
  // file would make the guard and the suite disagree about a file the runner can
  // never reach — asserted here so the three stay in step.
  it('does not reach a nested path the runner never globs', () => {
    expect(requiresExecutableBit('scripts/smoke-tests/scenarios/nested/thing.sh')).toBe(false)
  })

  it('ignores paths outside the smoke-test tree', () => {
    expect(requiresExecutableBit('scripts/diagnose-install.sh')).toBe(false)
  })
})

describe('findNonExecutable names every offending file and its mode (#400)', () => {
  it('finds nothing when every runnable file is 100755', () => {
    expect(findNonExecutable(parseGitIndexEntries(executableFixture))).toEqual([])
  })

  // The exact defect this story fixes, as a fixture.
  it('flags a scenario committed as 100644', () => {
    const withDefect = executableFixture.replace(
      entry(EXECUTABLE_MODE, 'scripts/smoke-tests/scenarios/coverage-gate.sh'),
      entry('100644', 'scripts/smoke-tests/scenarios/coverage-gate.sh'),
    )
    expect(findNonExecutable(parseGitIndexEntries(withDefect))).toEqual([
      { mode: '100644', path: 'scripts/smoke-tests/scenarios/coverage-gate.sh' },
    ])
  })

  it('flags the runner itself losing the bit', () => {
    const withDefect = executableFixture.replace(
      entry(EXECUTABLE_MODE, 'scripts/smoke-tests/run-all.sh'),
      entry('100644', 'scripts/smoke-tests/run-all.sh'),
    )
    expect(findNonExecutable(parseGitIndexEntries(withDefect))[0]?.path).toBe(
      'scripts/smoke-tests/run-all.sh',
    )
  })

  // A symlinked scenario (120000) is not a runnable committed script either; the
  // check is "mode is exactly 100755", not "mode is not 100644".
  it('flags a mode that is neither 644 nor 755 (e.g. a symlink)', () => {
    expect(
      findNonExecutable(
        parseGitIndexEntries(entry('120000', 'scripts/smoke-tests/scenarios/x.sh')),
      ),
    ).toHaveLength(1)
  })

  it('reports every offender, so a partial fix cannot look clean', () => {
    const two = [
      entry('100644', 'scripts/smoke-tests/scenarios/a.sh'),
      entry('100644', 'scripts/smoke-tests/scenarios/b.sh'),
      entry(EXECUTABLE_MODE, 'scripts/smoke-tests/scenarios/c.sh'),
    ].join('')
    expect(findNonExecutable(parseGitIndexEntries(two)).map(e => e.path)).toEqual([
      'scripts/smoke-tests/scenarios/a.sh',
      'scripts/smoke-tests/scenarios/b.sh',
    ])
  })
})

describe('checkSmokeScenarioModes reports actionably (#400)', () => {
  it('passes on an all-executable index', () => {
    const r = checkSmokeScenarioModes(executableFixture)
    expect(r.ok, r.message).toBe(true)
  })

  it('fails naming the file, its staged mode and the fix', () => {
    const r = checkSmokeScenarioModes(entry('100644', 'scripts/smoke-tests/scenarios/x.sh'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('scripts/smoke-tests/scenarios/x.sh')
    expect(r.message).toContain('100644')
    expect(r.message).toContain('git update-index --chmod=+x')
  })

  // Check-only, like the pre-push gate (ADL 2026-07-31): the guard must never
  // offer to chmod anything itself — a gate that repairs the tree it is judging
  // stops being evidence about the commit.
  it('never proposes an automatic fix, only a command the developer runs', () => {
    const r = checkSmokeScenarioModes(entry('100644', 'scripts/smoke-tests/scenarios/x.sh'))
    expect(r.message).toContain('never fixes it')
  })

  // A guard that passes when it sees nothing is the failure mode that let the
  // 644 sit for weeks: a renamed folder would silently disable it.
  it('fails loudly when the index carries no runnable file at all', () => {
    const r = checkSmokeScenarioModes(entry('100644', 'scripts/smoke-tests/README.md'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain(MUST_BE_EXECUTABLE.scenariosDir)
  })
})

describe('the guard runs against THIS repo, not only against fixtures (#400)', () => {
  it('reads the real git index for the smoke-test tree', () => {
    const entries = parseGitIndexEntries(readSmokeTestsIndex())
    expect(entries.some(e => e.path === 'scripts/smoke-tests/run-all.sh')).toBe(true)
  })

  // RED before this story: `scenarios/coverage-gate.sh` is committed 100644, so
  // one of the 16 CI-listed scenarios could not run at all.
  it('every tracked smoke scenario in this repo is executable by its staged git mode', () => {
    const result = checkThisRepoSmokeScenarioModes()
    expect(result.ok, result.message).toBe(true)
  })
})

// ── The release scripts are guarded for the same reason (#431) ──────────────
// `release.yml` ran `chmod +x scripts/workflows/release/<script>.sh` before executing each
// of nine scripts, which MASKS the committed mode: a script committed 644 would run green
// in CI forever and fail for anyone executing it directly — the condition
// `coverage-gate.sh` sat in for weeks. The chmod lines are gone; this guard replaces them.
describe('requiresExecutableBit covers the release scripts too (#431)', () => {
  it('a *.sh directly in the release folder must be executable', () => {
    expect(requiresExecutableBit('scripts/workflows/release/publish-npm.sh')).toBe(true)
    expect(requiresExecutableBit('scripts/workflows/release/deploy-website.sh')).toBe(true)
  })

  // The load-bearing negatives: this folder also holds documentation and a fixture project
  // that are committed 644 ON PURPOSE. A guard that demanded the whole tree be executable
  // would be wrong about them, and "fixing" their modes would be a real regression.
  it('documentation and fixtures in the same folder must NOT require the bit', () => {
    expect(requiresExecutableBit('scripts/workflows/release/README.md')).toBe(false)
    expect(
      requiresExecutableBit('scripts/workflows/release/fixtures/sample-project/index.js'),
    ).toBe(false)
    expect(
      requiresExecutableBit('scripts/workflows/release/fixtures/sample-project/package.json'),
    ).toBe(false)
  })

  it('a *.sh nested deeper than the folder itself is not executed, so not required', () => {
    expect(requiresExecutableBit('scripts/workflows/release/fixtures/helper.sh')).toBe(false)
  })

  it('a release script staged 644 is reported as an offender', () => {
    const offenders = findNonExecutable([
      { mode: '100644', path: 'scripts/workflows/release/publish-npm.sh' },
      { mode: '100755', path: 'scripts/workflows/release/deploy-website.sh' },
      { mode: '100644', path: 'scripts/workflows/release/README.md' },
    ])
    expect(offenders.map(o => o.path)).toEqual(['scripts/workflows/release/publish-npm.sh'])
  })

  it('no workflow chmods a repo-committed release script any more', () => {
    const root = join(__dirname, '../../../..')
    for (const wf of ['release.yml', 'website-preview-deploy.yml']) {
      const yml = readFileSync(join(root, '.github/workflows', wf), 'utf8')
      const offending = yml
        .split('\n')
        .filter(l => !l.trimStart().startsWith('#'))
        .filter(l => /chmod\s+\+x\s+scripts\/workflows\/release\//.test(l))
      expect(offending, `${wf} must not chmod its own committed scripts`).toEqual([])
    }
  })
})

describe('the repo-level check actually READS the release tree (#431)', () => {
  // Without this the widened predicate is decorative: the real check reads an index that
  // never contained a release path, so every release script passed by not being looked at.
  it('the real index read includes the release scripts', () => {
    const entries = parseGitIndexEntries(readSmokeTestsIndex())
    expect(entries.some(e => e.path === 'scripts/workflows/release/publish-npm.sh')).toBe(true)
  })

  it('every tracked release script in this repo is executable by its staged git mode', () => {
    const result = checkThisRepoSmokeScenarioModes()
    expect(result.ok, result.message).toBe(true)
  })
})
