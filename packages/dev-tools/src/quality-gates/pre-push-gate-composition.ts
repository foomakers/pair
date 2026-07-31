/**
 * pre-push-gate-composition — keeps the pre-push gate free of write-mode
 * formatters (story #394).
 *
 * The husky pre-push hook runs the root `quality-gate` script. That script used
 * to include `prettier:fix` and `mdlint:fix`, repo-wide, in WRITE mode.
 *
 * The problem is not noise, it is uselessness: **at pre-push the commits already
 * exist**. A write-mode formatter rewrites the working tree and cannot touch what
 * is being pushed, so its output goes nowhere unless the author notices and
 * amends. In practice the author either sweeps unrelated reformats into the next
 * commit or pushes with `--no-verify` — and once bypassing is routine the hook
 * asserts nothing at all.
 *
 * Check mode is the correct shape for a hook: it reports, the developer fixes
 * deliberately with `pnpm format`, and the fix lands in a commit. Recorded in
 * ADL 2026-07-31-pre-push-gate-is-check-only.md.
 *
 * The guard must survive INDIRECTION, because the gate no longer names a
 * formatter — it delegates (`pnpm format:check`). Scanning the gate string alone
 * would miss the likeliest regression: editing the gate to `pnpm format`, or
 * redefining `format:check` as `turbo prettier:fix`. So every package-runner
 * reference to a root script is expanded transitively against the root scripts
 * before scanning — tolerating runner flags (`pnpm -s format`, `pnpm -w format`)
 * and the `npm run` / `yarn` spellings, since a single token between the runner
 * and the script name would otherwise defeat the whole expansion.
 *
 * Boundary of that expansion: ROOT scripts only. A `pnpm --filter <pkg> <script>`
 * body is never read (it lives in another package.json), so a write-mode tool
 * reached through a package script is caught by NAME — the offender patterns below
 * — not by expansion. Every package-level write script in this repo is named
 * `prettier:fix`, `mdlint:fix` or `lint:fix`, all of which the patterns match; a
 * differently named one would be a blind spot.
 *
 * Per the gate-tooling ADL (2026-07-13) the logic lives here as a tested module;
 * `main()` behind a `require.main` guard is the thin CLI — the ADR-014 shape
 * shared with the siblings in this folder.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { REPO_ROOT } from './repo-root'

/**
 * The root `package.json` this guard inspects. Derived from the shared `REPO_ROOT`
 * (`./repo-root`), so the hop count to the repo root exists once for the whole
 * folder — the tests import this constant instead of re-deriving the path (ADR-014
 * records a folder move breaking every duplicated `__dirname`-relative constant
 * once already).
 */
export const ROOT_PACKAGE_JSON = resolve(REPO_ROOT, 'package.json')

/**
 * Every shape in which a WRITE-MODE tool can be invoked from the gate. Each tool is
 * reachable three ways — the turbo task, the package's `bin` alias (as a name or as
 * the `.sh` file it points at), and the underlying CLI with its write flag — and an
 * asymmetric list would ban one tool's shell entrypoint while letting the other's
 * through, which is exactly how the regression comes back.
 *
 * The invariant is "the gate must not write", so eslint's autofix belongs here too:
 * `lint:fix` (→ `eslint . --fix`) modifies files the branch never touched exactly
 * like a formatter does, i.e. the AC1 failure mode of #394, reintroducible by the
 * same one-word edit. Nothing in the gate runs it today; that is precisely when a
 * guard is cheap to widen.
 *
 * Still an explicit list rather than a `/:fix/` pattern — a guard that fires on any
 * `:fix` string, including things it has no opinion about, gets disabled — so a new
 * write-mode tool needs a line here.
 *
 * The CLI patterns stop at a command separator (`&& | ; { }`), so `prettier:check`
 * in one command cannot pair up with a `--write` belonging to another.
 */
const WRITE_MODE_FORMATTERS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'prettier:fix', pattern: /\bprettier:fix\b/ },
  { name: 'mdlint:fix', pattern: /\bmdlint:fix\b/ },
  { name: 'lint:fix', pattern: /\blint:fix\b/ },
  { name: 'prettier-fix', pattern: /\bprettier-fix(?:\.sh)?\b/ },
  { name: 'markdownlint-fix', pattern: /\bmarkdownlint-fix(?:\.sh)?\b/ },
  { name: 'lint-fix', pattern: /\blint-fix(?:\.sh)?\b/ },
  { name: 'prettier --write', pattern: /\bprettier\b[^&|;{}\n]*\s--write\b/ },
  { name: 'markdownlint --fix', pattern: /\bmarkdownlint\b[^&|;{}\n]*\s--fix\b/ },
  { name: 'eslint --fix', pattern: /\beslint\b[^&|;{}\n]*\s--fix\b/ },
]

/** The package runners a root script can delegate through. */
const RUNNER = '(?:pnpm|npm|yarn)'

/**
 * Runner flags between the runner and the script name (`-s`, `-w`, `--silent`,
 * `--filter=x`). Without this, the captured "script name" is the flag, the lookup
 * misses, and the referenced body is never scanned.
 */
const RUNNER_FLAGS = '(?:\\s+-{1,2}[A-Za-z0-9-]+(?:=\\S+)?)*'

/** Characters a script name may contain (`format:check`, `@scope/pkg`). */
const SCRIPT_NAME = '[A-Za-z0-9_:@./-]+'

/** `pnpm x` / `pnpm run x` / `pnpm -s x` / `npm run x` / `yarn x`, capturing x. */
function scriptReference(name: string = SCRIPT_NAME): RegExp {
  return new RegExp(`\\b${RUNNER}${RUNNER_FLAGS}\\s+(?:run\\s+)?(${name})`, 'g')
}

/** Escapes a script name for literal use inside a pattern (`:` and `.` are safe). */
function escapeForPattern(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whether a command invokes `<runner> <script>` — not merely mentions its name. */
export function referencesScript(command: string, script: string): boolean {
  return scriptReference(escapeForPattern(script)).test(command)
}

/** The root script the gate must keep calling — drop it and the guard is gone. */
export const GUARD_SCRIPT = 'gate:composition'

/** The root script the failure message points developers at. Must exist. */
export const REMEDY_SCRIPT = 'format'

/** What a developer should run instead. Named in the failure so it is actionable. */
export const PRE_PUSH_REMEDY =
  'Formatting is checked, not applied, before a push: run `pnpm format` and commit the result. ' +
  'Applying it here could not fix the commits being pushed anyway.'

/** Bounds the transitive expansion, so a cyclic or deep script graph terminates. */
const MAX_EXPANSION_DEPTH = 10

/**
 * Every write-mode step present in a gate command (the two formatters plus eslint's
 * autofix), in the order the offender list declares them (not the order the command
 * names them). Returns all offenders rather than the first, so a partial fix cannot
 * look clean.
 */
export function findWriteModeFormatters(gateCommand: string): string[] {
  return WRITE_MODE_FORMATTERS.filter(f => f.pattern.test(gateCommand)).map(f => f.name)
}

/**
 * Inlines runner references to sibling root scripts (`pnpm x`, `pnpm run x`,
 * `pnpm -s x`, `npm run x`, `yarn x`), transitively, so the scan sees what the
 * gate ACTUALLY runs instead of the name it hides behind. Bounded depth + visited
 * set: a script that reaches itself is expanded once, never forever.
 *
 * The reference is kept next to its expansion (`pnpm x { … }`) so a failure
 * message shows the delegation path that reached the offender.
 */
export function expandScriptReferences(
  scripts: Record<string, string>,
  command: string,
  visited: ReadonlySet<string> = new Set(),
  depth = 0,
): string {
  if (depth >= MAX_EXPANSION_DEPTH) return command
  return command.replace(scriptReference(), (match, name: string) => {
    const body = scripts[name]
    if (typeof body !== 'string' || visited.has(name)) return match
    const seen = new Set(visited)
    seen.add(name)
    return `${match} { ${expandScriptReferences(scripts, body, seen, depth + 1)} }`
  })
}

export interface GateCheckResult {
  ok: boolean
  message: string
}

/** Names the offenders AND the resolved delegation path that reached them. */
function writeModeFailure(offenders: string[], expanded: string): GateCheckResult {
  return {
    ok: false,
    message:
      `quality-gate reaches ${offenders.length} step(s) that WRITE files: ${offenders.join(', ')}.\n` +
      `Resolved gate: ${expanded}\n` +
      `At pre-push the commits already exist, so this rewrites the working tree and cannot fix\n` +
      `what is being pushed — it only pollutes the next diff with unrelated files.\n` +
      `Use the :check variants; writing stays in the commands a developer runs deliberately\n` +
      `(\`pnpm format\`, \`pnpm lint:fix\`). ${PRE_PUSH_REMEDY}`,
  }
}

/**
 * Checks the repo's own gate composition and reports:
 * 1. any write-mode step reachable from it (directly or via delegation),
 * 2. the gate having stopped RUNNING the guard itself (`pnpm gate:composition`) —
 *    `referencesScript`, not a substring, so `echo gate:composition` does not count,
 * 3. the remedy script named in the failure message having disappeared.
 *
 * Takes the file TEXT (not a path) so it is testable without a fixture on disk
 * and without a process exit.
 */
export function checkRootGate(packageJsonText: string): GateCheckResult {
  let pkg: { scripts?: Record<string, string> }
  try {
    pkg = JSON.parse(packageJsonText) as { scripts?: Record<string, string> }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, message: `root package.json is not valid JSON: ${detail}` }
  }

  const scripts = pkg.scripts ?? {}
  const gate = scripts['quality-gate']
  if (typeof gate !== 'string') {
    return { ok: false, message: 'No `quality-gate` script found in the root package.json.' }
  }

  const expanded = expandScriptReferences(scripts, gate)

  const offenders = findWriteModeFormatters(expanded)
  if (offenders.length > 0) return writeModeFailure(offenders, expanded)

  if (!referencesScript(expanded, GUARD_SCRIPT)) {
    return {
      ok: false,
      message:
        `quality-gate no longer runs \`pnpm ${GUARD_SCRIPT}\`, so nothing stops a write-mode\n` +
        `formatter from returning to the gate. Restore it.`,
    }
  }

  if (typeof scripts[REMEDY_SCRIPT] !== 'string') {
    return {
      ok: false,
      message:
        `The gate tells developers to run \`pnpm ${REMEDY_SCRIPT}\`, but the root package.json has\n` +
        `no \`${REMEDY_SCRIPT}\` script — the advice is dead. Restore it or update PRE_PUSH_REMEDY.`,
    }
  }

  return { ok: true, message: 'quality-gate is check-mode only.' }
}

/** Reads THIS repo's root package.json and checks its gate composition. */
export function checkThisRepoGate(): GateCheckResult {
  return checkRootGate(readFileSync(ROOT_PACKAGE_JSON, 'utf-8'))
}

/** Thin CLI wrapper: print the report and set the exit code. */
export function main(): void {
  const result = checkThisRepoGate()
  if (!result.ok) {
    console.error(`\n❌ pre-push gate composition\n\n${result.message}\n`)
    process.exit(1)
  }
  console.log('✓ pre-push gate composition: check-mode only')
}

if (require.main === module) {
  main()
}
