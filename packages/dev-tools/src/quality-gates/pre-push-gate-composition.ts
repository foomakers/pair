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
 * deliberately with `pnpm format`, and the fix lands in a commit.
 *
 * Per the gate-tooling ADL (2026-07-13) this logic lives here as a tested
 * module; the root script is a thin entrypoint.
 */

/**
 * The two write-mode formatters, plus the shell entrypoint that bypasses turbo.
 * Deliberately an explicit list rather than a `/:fix/` pattern: `lint:fix` is an
 * eslint autofix, a different concern, and banning every `:fix` string would
 * make the guard fire on things it has no opinion about.
 */
const WRITE_MODE_FORMATTERS = ['prettier:fix', 'mdlint:fix', 'markdownlint-fix.sh'] as const

/** What a developer should run instead. Named in the failure so it is actionable. */
export const PRE_PUSH_REMEDY =
  'Formatting is checked, not applied, before a push: run `pnpm format` and commit the result. ' +
  'Applying it here could not fix the commits being pushed anyway.'

/**
 * Every write-mode formatter present in a gate command, in the order they are
 * declared. Returns all offenders rather than the first, so a partial fix cannot
 * look clean.
 */
export function findWriteModeFormatters(gateCommand: string): string[] {
  return WRITE_MODE_FORMATTERS.filter(f => gateCommand.includes(f))
}

/**
 * Reads the repo's own `quality-gate` script and reports any write-mode
 * formatter in it. Separated from `main` so the reading is testable without a
 * process exit.
 */
export function checkRootGate(packageJsonText: string): { ok: boolean; message: string } {
  const pkg = JSON.parse(packageJsonText) as { scripts?: Record<string, string> }
  const gate = pkg.scripts?.['quality-gate']
  if (typeof gate !== 'string') {
    return { ok: false, message: 'No `quality-gate` script found in the root package.json.' }
  }
  const offenders = findWriteModeFormatters(gate)
  if (offenders.length === 0) return { ok: true, message: 'quality-gate is check-mode only.' }
  return {
    ok: false,
    message:
      `quality-gate runs ${offenders.length} formatter(s) in WRITE mode: ${offenders.join(', ')}.\n` +
      `At pre-push the commits already exist, so this rewrites the working tree and cannot fix\n` +
      `what is being pushed — it only pollutes the next diff with unrelated files.\n` +
      `Use the :check variants and keep the fix in \`pnpm format\`. ${PRE_PUSH_REMEDY}`,
  }
}
