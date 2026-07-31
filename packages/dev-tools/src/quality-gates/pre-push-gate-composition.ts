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
 * redefining `format:check` as `turbo prettier:fix`. So every `pnpm <script>` /
 * `pnpm run <script>` reference is expanded transitively against the root scripts
 * before scanning.
 *
 * Per the gate-tooling ADL (2026-07-13) the logic lives here as a tested module;
 * `main()` behind a `require.main` guard is the thin CLI — the ADR-014 shape
 * shared with the siblings in this folder.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * The repo root, resolved from this file's location:
 * packages/dev-tools/src/quality-gates -> src -> dev-tools -> packages -> repo
 * root (up 4). Centralized here so the hop count exists once — the CLI entry and
 * the tests import it instead of re-deriving it (ADR-014 records a folder move
 * breaking every duplicated `__dirname`-relative constant once already).
 */
export const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..')
export const ROOT_PACKAGE_JSON = resolve(REPO_ROOT, 'package.json')

/**
 * The two write-mode formatters, plus the shell entrypoint that bypasses turbo.
 * Deliberately an explicit list rather than a `/:fix/` pattern: `lint:fix` is an
 * eslint autofix, a different concern, and banning every `:fix` string would
 * make the guard fire on things it has no opinion about.
 */
const WRITE_MODE_FORMATTERS = ['prettier:fix', 'mdlint:fix', 'markdownlint-fix.sh'] as const

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
 * Every write-mode formatter present in a gate command, in the order they are
 * declared. Returns all offenders rather than the first, so a partial fix cannot
 * look clean.
 */
export function findWriteModeFormatters(gateCommand: string): string[] {
  return WRITE_MODE_FORMATTERS.filter(f => gateCommand.includes(f))
}

/**
 * Inlines `pnpm <script>` / `pnpm run <script>` references to sibling root
 * scripts, transitively, so the scan sees what the gate ACTUALLY runs instead of
 * the name it hides behind. Bounded depth + visited set: a script that reaches
 * itself is expanded once, never forever.
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
  return command.replace(/\bpnpm\s+(?:run\s+)?([A-Za-z0-9_:@./-]+)/g, (match, name: string) => {
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

/**
 * Checks the repo's own gate composition and reports:
 * 1. any write-mode formatter reachable from it (directly or via delegation),
 * 2. the gate having dropped the guard itself (`pnpm gate:composition`),
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
  if (offenders.length > 0) {
    return {
      ok: false,
      message:
        `quality-gate reaches ${offenders.length} formatter(s) in WRITE mode: ${offenders.join(', ')}.\n` +
        `Resolved gate: ${expanded}\n` +
        `At pre-push the commits already exist, so this rewrites the working tree and cannot fix\n` +
        `what is being pushed — it only pollutes the next diff with unrelated files.\n` +
        `Use the :check variants and keep the fix in \`pnpm format\`. ${PRE_PUSH_REMEDY}`,
    }
  }

  if (!expanded.includes(GUARD_SCRIPT)) {
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
