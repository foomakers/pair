/**
 * Code Hygiene Check — prevents suppression markers from entering the codebase.
 *
 * The LOGIC lives here as individually exported, unit-tested functions (see
 * code-hygiene-check.test.ts, white-box, exec injected — no real git repo needed).
 * The `main()` block is a thin CLI wrapper run via `ts-node src/quality-gates/code-hygiene-check.ts`
 * (package script `code-hygiene:check`, delegated from the repo-root `hygiene:check`
 * script). Exit 0 = clean, Exit 1 = violations found.
 *
 * Runs `git grep` with an explicit `cwd` (the repo root, resolved from this file's
 * location: packages/dev-tools/src/quality-gates -> src -> dev-tools -> packages
 * -> repo root, up 4) so the scan behaves identically regardless of the caller's
 * working directory (e.g. `pnpm --filter` sets cwd to the package dir, not the repo root).
 */
import { execSync } from 'child_process'
import { resolve } from 'path'

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..')

// Path of this module, relative to the repo root — excluded from its own scan so
// the patterns below (deliberately split so they don't match this file) never
// trip on the string literals that define them.
const SELF_EXCLUDE = 'packages/dev-tools/src/quality-gates/code-hygiene-check.ts'

export interface HygienePattern {
  label: string
  regex: string
}

// Patterns are split so this file does not match itself.
export const PATTERNS: HygienePattern[] = [
  { label: '@ts-ignore', regex: '@ts-' + 'ignore' },
  { label: '@ts-nocheck', regex: '@ts-' + 'nocheck' },
  { label: 'eslint-disable', regex: 'eslint-' + 'disable' },
  { label: 'test.skip', regex: '\\btest\\.' + 'skip\\b' },
  { label: 'it.skip', regex: '\\bit\\.' + 'skip\\b' },
  { label: 'describe.skip', regex: '\\bdescribe\\.' + 'skip\\b' },
]

export const FILE_GLOBS = ['*.ts', '*.tsx', '*.js', '*.cjs', '*.mjs']

/** Build the `git grep` invocation for one pattern (exported for direct assertion). */
export function buildGitGrepCommand(
  regex: string,
  fileGlobs: string[],
  selfExclude: string,
): string {
  const globsArg = fileGlobs.map(g => `"${g}"`).join(' -- ')
  return `git grep -n "${regex}" -- ${globsArg} ':!${selfExclude}'`
}

/** Parse raw `git grep -n` stdout into formatted `  file:line` entries. */
export function parseGrepOutput(out: string): string[] {
  return out
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const sep = line.indexOf(':')
      const sep2 = line.indexOf(':', sep + 1)
      const file = line.substring(0, sep)
      const lineNum = line.substring(sep + 1, sep2)
      return `  ${file}:${lineNum}`
    })
}

export type Exec = (cmd: string) => string

function defaultExec(cmd: string): string {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
}

/** Scan one pattern; `git grep` exits 1 with no output when there are no matches — that's the happy path. */
export function scanPattern(
  pattern: HygienePattern,
  fileGlobs: string[] = FILE_GLOBS,
  selfExclude: string = SELF_EXCLUDE,
  exec: Exec = defaultExec,
): string[] {
  try {
    const out = exec(buildGitGrepCommand(pattern.regex, fileGlobs, selfExclude))
    return parseGrepOutput(out)
  } catch {
    return []
  }
}

export interface RunResult {
  violations: Map<string, string[]>
  total: number
}

/** Run every pattern and aggregate results. */
export function runHygieneCheck(
  patterns: HygienePattern[] = PATTERNS,
  fileGlobs: string[] = FILE_GLOBS,
  selfExclude: string = SELF_EXCLUDE,
  exec: Exec = defaultExec,
): RunResult {
  const violations = new Map<string, string[]>()
  let total = 0
  for (const pattern of patterns) {
    const matches = scanPattern(pattern, fileGlobs, selfExclude, exec)
    if (matches.length) {
      violations.set(pattern.label, matches)
      total += matches.length
    }
  }
  return { violations, total }
}

/** Thin CLI wrapper: print the report and set the exit code. */
export function main(): void {
  const { violations, total } = runHygieneCheck()

  console.log('Code Hygiene Check')
  console.log('==================')

  if (total === 0) {
    console.log('PASS — no violations')
    process.exit(0)
  } else {
    console.log(`FAIL — ${total} violation${total > 1 ? 's' : ''}\n`)
    for (const [label, matches] of violations) {
      console.log(`${label} (${matches.length}):`)
      for (const m of matches) console.log(m)
      console.log()
    }
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}
