import { describe, it, expect } from 'vitest'

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
// Fixtures below are literal `git ls-files -s` lines: `<mode> <sha> <stage>\t<path>`.
const sha = '0000000000000000000000000000000000000000'
const entry = (mode: string, path: string): string => `${mode} ${sha} 0\t${path}`

const executableFixture = [
  entry(EXECUTABLE_MODE, 'scripts/smoke-tests/run-all.sh'),
  entry(EXECUTABLE_MODE, 'scripts/smoke-tests/scenarios/install-basic.sh'),
  entry(EXECUTABLE_MODE, 'scripts/smoke-tests/scenarios/coverage-gate.sh'),
  entry('100644', 'scripts/smoke-tests/lib/utils.sh'),
  entry('100644', 'scripts/smoke-tests/README.md'),
].join('\n')

describe('parseGitIndexEntries reads `git ls-files -s` output (#400)', () => {
  it('extracts mode and path from a tab-separated index line', () => {
    expect(parseGitIndexEntries(entry('100755', 'scripts/smoke-tests/run-all.sh'))).toEqual([
      { mode: '100755', path: 'scripts/smoke-tests/run-all.sh' },
    ])
  })

  it('reads a path containing spaces (the tab, not whitespace, is the separator)', () => {
    expect(parseGitIndexEntries(entry('100644', 'scripts/smoke-tests/a file.sh'))[0]?.path).toBe(
      'scripts/smoke-tests/a file.sh',
    )
  })

  it('ignores blank lines instead of emitting empty entries', () => {
    expect(parseGitIndexEntries(`\n${entry('100755', 'x.sh')}\n\n`)).toHaveLength(1)
  })

  it('returns nothing for empty output rather than throwing', () => {
    expect(parseGitIndexEntries('')).toEqual([])
  })

  // A malformed line must be DROPPED, not turned into a plausible-looking entry.
  // Taking the mode as `slice(0, indexOf(' '))` on a line with a tab but no space
  // yields `indexOf(' ') === -1` -> `slice(0, -1)`, i.e. the line minus its last
  // character, which then fails the `!== 100755` check and is reported as a
  // non-executable file with a nonsense mode: a confident wrong diagnosis.
  it('drops a line whose pre-tab segment carries no mode instead of inventing one', () => {
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
  // `.trim()` on the line silently rewrites a path with a trailing space, and the
  // path the developer is told to `chmod` then does not exist.
  it('preserves a path with a trailing space verbatim', () => {
    expect(parseGitIndexEntries(entry('100644', 'scripts/smoke-tests/scenarios/x .sh '))[0]).toEqual(
      { mode: '100644', path: 'scripts/smoke-tests/scenarios/x .sh ' },
    )
  })
})

describe('requiresExecutableBit covers what is RUN, not what is sourced (#400)', () => {
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

  // A scenario is a scenario wherever it sits in the tree: a nested folder must
  // not become the place where an unexecutable file hides.
  it('covers a scenario in a nested folder', () => {
    expect(requiresExecutableBit('scripts/smoke-tests/scenarios/nested/thing.sh')).toBe(true)
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
    ].join('\n')
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
