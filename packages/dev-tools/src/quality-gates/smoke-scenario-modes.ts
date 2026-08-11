/**
 * smoke-scenario-modes — every tracked smoke scenario is executable (story #400).
 *
 * `scripts/smoke-tests/scenarios/coverage-gate.sh` arrived in PR #368 with mode
 * `100644` and stayed unexecutable for weeks. Two things hid it:
 *
 * 1. nothing in CI ran the suite, so the only reader was whoever typed
 *    `pnpm smoke-tests` (that gap is the rest of #400 — the `smoke` job);
 * 2. the runner reported the resulting `Permission denied` as a plain `FAIL`,
 *    indistinguishable from a real assertion failure (fixed in `run-all.sh` by
 *    the distinct `NOT EXECUTABLE` outcome).
 *
 * This guard closes the third gap: catching the missing bit in the GIT INDEX —
 * i.e. before the file is committed and can join `CI_TESTS` as dead weight.
 *
 * It reads the GIT INDEX (`git ls-files -s`), never the filesystem, so what it
 * asserts is precisely the STAGED mode — the mode about to be committed, and the
 * mode of `HEAD` once it is (in CI, on a clean checkout, index and `HEAD` are the
 * same tree). A `test -x` on the working tree instead passes on a checkout that
 * carries the bit locally (or on a filesystem that reports every file as
 * executable) while the tracked mode stays `100644` — so the filesystem is
 * exactly the wrong place to assert this. Reading the index rather than `HEAD` is
 * deliberate: it catches a `chmod +x` that was never `git add`-ed, on the
 * pre-push gate, instead of one commit later.
 *
 * Check-only, like the pre-push gate (ADL 2026-07-31): it names the file, its mode
 * and the command to fix it, and never chmods anything. A gate that repairs the
 * tree it is judging stops being evidence about the commit.
 *
 * Per the gate-tooling ADL (2026-07-13) the logic lives here as a tested module.
 * Its enforcement point is `smoke-scenario-modes.test.ts` — which runs inside
 * `pnpm test`, i.e. inside both the pre-push gate and the CI `build` job — so no
 * extra CLI entrypoint or pipeline step exists to be forgotten.
 */
import { execFileSync } from 'child_process'

import { REPO_ROOT } from './repo-root'

/** The only git mode a runnable tracked script may have. */
export const EXECUTABLE_MODE = '100755'

/** The smoke-test tree this guard reads, and the paths inside it that must run. */
export const MUST_BE_EXECUTABLE = {
  /** Everything under here is invoked by the runner as a child process. */
  scenariosDir: 'scripts/smoke-tests/scenarios/',
  /** The runner itself — `pnpm smoke-tests` and the CI job execute it directly. */
  runner: 'scripts/smoke-tests/run-all.sh',
  /** The tree handed to `git ls-files`; `lib/`, `fixtures/` and docs live here too. */
  tree: 'scripts/smoke-tests',
} as const

export interface IndexEntry {
  /** The git mode as STAGED in the index — the mode about to be committed. */
  mode: string
  /** Repo-relative path. */
  path: string
}

export interface ModeCheckResult {
  ok: boolean
  message: string
}

/**
 * Parses `git ls-files -s` output: `<mode> <sha> <stage>\t<path>`.
 *
 * The path is taken after the TAB rather than by splitting on whitespace, so a
 * filename containing a space — including a TRAILING one — survives byte for
 * byte: the path is the identity of the file the failure message tells you to
 * chmod, so rewriting it produces a command that does not match any file.
 *
 * The mode is read from the PRE-tab segment only. A line the parser cannot read
 * is dropped rather than turned into an entry with a salvaged-looking mode: a
 * bogus mode would fail the `!== 100755` check and be reported as a
 * non-executable file, i.e. a confident wrong diagnosis instead of no diagnosis.
 */
export function parseGitIndexEntries(lsFilesOutput: string): IndexEntry[] {
  return lsFilesOutput
    .split('\n')
    .filter(line => line !== '')
    .flatMap(line => {
      const tab = line.indexOf('\t')
      if (tab === -1) return []
      const mode = line.slice(0, tab).split(' ')[0] ?? ''
      if (mode === '') return []
      return [{ mode, path: line.slice(tab + 1) }]
    })
}

/**
 * Whether a path is RUN (must be `100755`) or merely read.
 *
 * `lib/utils.sh` is sourced, not executed, and the fixtures and README are data:
 * demanding the bit there would make the guard noise, and a guard people route
 * around asserts nothing (the #394 lesson).
 */
export function requiresExecutableBit(path: string): boolean {
  return path.startsWith(MUST_BE_EXECUTABLE.scenariosDir) || path === MUST_BE_EXECUTABLE.runner
}

/** Every runnable file whose staged mode is not exactly `100755`, in index order. */
export function findNonExecutable(entries: readonly IndexEntry[]): IndexEntry[] {
  return entries.filter(e => requiresExecutableBit(e.path) && e.mode !== EXECUTABLE_MODE)
}

/** The remedy, named in the failure so it is actionable without a search. */
function remedyFor(offenders: readonly IndexEntry[]): string {
  return offenders
    .map(o => `  chmod +x ${o.path} && git update-index --chmod=+x ${o.path}`)
    .join('\n')
}

/**
 * Checks the staged modes of the smoke-test tree, from `git ls-files -s` TEXT
 * (not a path), so it is testable without a repo on disk and without a process exit.
 *
 * Fails loudly when the index carries no runnable file at all: a renamed folder
 * would otherwise silently disable the guard — the same "passes because it saw
 * nothing" failure that let the 644 sit for weeks.
 */
export function checkSmokeScenarioModes(lsFilesOutput: string): ModeCheckResult {
  const entries = parseGitIndexEntries(lsFilesOutput)
  const runnable = entries.filter(e => requiresExecutableBit(e.path))

  if (runnable.length === 0) {
    return {
      ok: false,
      message:
        `No runnable smoke-test file found in the git index under ` +
        `\`${MUST_BE_EXECUTABLE.scenariosDir}\` (or \`${MUST_BE_EXECUTABLE.runner}\`).\n` +
        `Either the tree moved and this guard now checks nothing, or the index was not read.`,
    }
  }

  const offenders = findNonExecutable(runnable)
  if (offenders.length > 0) {
    return {
      ok: false,
      message:
        `${offenders.length} smoke-test file(s) are staged NON-EXECUTABLE (git index):\n` +
        offenders.map(o => `  ${o.path} (mode ${o.mode}, expected ${EXECUTABLE_MODE})`).join('\n') +
        `\n\nThe runner cannot execute them: the scenario is listed, looks covered, and never\n` +
        `asserts anything (that is how \`coverage-gate.sh\` sat dead for weeks — #400).\n` +
        `The mode is read from the git index, not the filesystem, so a locally executable\n` +
        `file whose staged mode is 644 still fails here — deliberately.\n` +
        `This guard reports the mode and never fixes it; run:\n${remedyFor(offenders)}`,
    }
  }

  return {
    ok: true,
    message: `${runnable.length} smoke-test files are staged ${EXECUTABLE_MODE}.`,
  }
}

/** `git ls-files -s` over the smoke-test tree of THIS repo (cwd-independent). */
export function readSmokeTestsIndex(): string {
  return execFileSync('git', ['ls-files', '-s', '--', MUST_BE_EXECUTABLE.tree], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  })
}

/** Checks this repo's staged (index) smoke-test modes. */
export function checkThisRepoSmokeScenarioModes(): ModeCheckResult {
  return checkSmokeScenarioModes(readSmokeTestsIndex())
}
