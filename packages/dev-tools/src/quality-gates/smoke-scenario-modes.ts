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
 * deliberate: it catches a `chmod +x` that was never `git add`-ed, instead of one
 * commit later.
 *
 * Check-only, like the pre-push gate (ADL 2026-07-31): it names the file, its mode
 * and the command to fix it, and never chmods anything. A gate that repairs the
 * tree it is judging stops being evidence about the commit.
 *
 * Per the gate-tooling ADL (2026-07-13) the logic lives here as a tested module and
 * `main()` behind a `require.main` guard is the thin CLI — the ADR-014 shape shared
 * with the siblings in this folder.
 *
 * ENFORCEMENT POINT: the CLI, wired as `smoke-modes:check` (package) ->
 * `pnpm smoke-modes:check` (root) -> the root `quality-gate` chain the pre-push
 * hook runs, plus its own step in the CI `build` job. The unit test alone is NOT
 * the enforcement point, and the difference is not pedantic: `test` is a CACHEABLE
 * turbo task whose inputs are all inside this package, so adding a scenario with
 * mode 644 and touching nothing here leaves `@pair/dev-tools#test`'s hash
 * unchanged, turbo replays a cached PASS, and the guard never executes. The root
 * gate scripts (`hygiene:check`, `docs:staleness`, `skills:conformance`) are not
 * turbo tasks and run unconditionally — which is why this one joins them.
 */
import { execFileSync } from 'child_process'

import { REPO_ROOT } from './repo-root'

/** The only git mode a runnable tracked script may have. */
export const EXECUTABLE_MODE = '100755'

/** The extension the runner globs. Anything else in the folder is data, not a scenario. */
const SCENARIO_EXTENSION = '.sh'

/** The smoke-test tree this guard reads, and the paths inside it that must run. */
export const MUST_BE_EXECUTABLE = {
  /**
   * The folder the runner globs. A scenario is a `*.sh` file DIRECTLY in here —
   * `run-all.sh` iterates `"$SCENARIOS_DIR"/*.sh` (top level, `.sh` only) and the
   * AC7 membership audit in `runner-outcomes.sh` walks the same glob. Anything
   * else living here (a data fixture, a README) is read, never executed.
   */
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
 * Parses `git ls-files -s -z` output: `<mode> <sha> <stage>\t<path>` records,
 * NUL-terminated.
 *
 * Records are split on NUL, never on newline, because `-z` lets a path carry
 * ANY byte — including a newline — and splitting on `\n` would cut such a path
 * into two unusable halves.
 *
 * The path is taken after the TAB rather than by splitting on whitespace, so a
 * filename containing a space — including a TRAILING one — survives byte for
 * byte: the path is the identity of the file the failure message tells you to
 * chmod, so rewriting it produces a command that does not match any file. `-z`
 * closes the same hole for the class git itself rewrites: without it, and with
 * `core.quotePath` at its default, git C-quotes any path with a non-ASCII byte,
 * a control character, a quote or a backslash, and the remedy would name
 * `"scripts/…/sc\303\251nario.sh"` — a path that does not exist.
 *
 * The mode is read from the PRE-tab segment only. A record the parser cannot read
 * is dropped rather than turned into an entry with a salvaged-looking mode: a
 * bogus mode would fail the `!== 100755` check and be reported as a
 * non-executable file, i.e. a confident wrong diagnosis instead of no diagnosis.
 */
export function parseGitIndexEntries(lsFilesOutput: string): IndexEntry[] {
  return lsFilesOutput
    .split('\0')
    .filter(record => record !== '')
    .flatMap(record => {
      const tab = record.indexOf('\t')
      if (tab === -1) return []
      const mode = record.slice(0, tab).split(' ')[0] ?? ''
      if (mode === '') return []
      return [{ mode, path: record.slice(tab + 1) }]
    })
}

/**
 * Whether a path is RUN (must be `100755`) or merely read.
 *
 * "Run" is defined as what the runner actually globs: a `*.sh` file DIRECTLY in
 * `scenarios/`, plus the runner itself. Everything else is read — `lib/utils.sh`
 * is sourced, a fixture is data, a README is prose — and demanding the bit there
 * would make the guard tell a developer to `chmod +x` a JSON file. A guard that
 * misdiagnoses is a guard people route around (the #394 lesson).
 *
 * Nesting is deliberately out of reach, and that is the same rule the rest of the
 * suite applies: `run-all.sh` globs `"$SCENARIOS_DIR"/*.sh` and the AC7 membership
 * audit walks the same glob, so a file under `scenarios/nested/` is neither
 * executed nor required to be in `CI_TESTS`. Requiring the bit on it would be the
 * guard asserting something about a file the suite cannot reach.
 */
export function requiresExecutableBit(path: string): boolean {
  if (path === MUST_BE_EXECUTABLE.runner) return true
  if (!path.startsWith(MUST_BE_EXECUTABLE.scenariosDir)) return false
  const name = path.slice(MUST_BE_EXECUTABLE.scenariosDir.length)
  return name.endsWith(SCENARIO_EXTENSION) && !name.includes('/')
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

/**
 * `git ls-files -s -z` over the smoke-test tree of THIS repo (cwd-independent).
 *
 * `-z` is load-bearing, not cosmetic: without it git C-quotes any path carrying a
 * non-ASCII byte, a control character, a quote or a backslash, and the parser
 * would hand the QUOTED spelling to the failure message — a `chmod +x <path>`
 * remedy that matches no file.
 */
export function readSmokeTestsIndex(): string {
  return execFileSync('git', ['ls-files', '-s', '-z', '--', MUST_BE_EXECUTABLE.tree], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  })
}

/** Checks this repo's staged (index) smoke-test modes. */
export function checkThisRepoSmokeScenarioModes(): ModeCheckResult {
  return checkSmokeScenarioModes(readSmokeTestsIndex())
}

/** Thin CLI wrapper: print the report and set the exit code (ADR-014 shape). */
export function main(): void {
  const result = checkThisRepoSmokeScenarioModes()
  if (!result.ok) {
    console.error(`\n❌ smoke-scenario modes\n\n${result.message}\n`)
    process.exit(1)
  }
  console.log(`✓ smoke-scenario modes: ${result.message}`)
}

if (require.main === module) {
  main()
}
