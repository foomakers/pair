/**
 * Code Hygiene Check — prevents suppression markers from entering the codebase.
 *
 * The LOGIC lives here as individually exported, unit-tested functions (see
 * code-hygiene-check.test.ts, white-box, exec injected — no real git repo needed).
 * The `main()` block is a thin CLI wrapper run via `ts-node src/quality-gates/code-hygiene-check.ts`
 * (package script `code-hygiene:check`, delegated from the repo-root `hygiene:check`
 * script). Exit 0 = clean, Exit 1 = violations found.
 *
 * Runs `git grep` with an explicit `cwd` (the repo root, from `./repo-root` — the
 * hop count is defined once for this folder) so the scan behaves identically
 * regardless of the caller's working directory (e.g. `pnpm --filter` sets cwd to
 * the package dir, not the repo root).
 */
import { execSync } from 'child_process'
import { fileSystemService, type FileSystemService } from '@pair/content-ops'
import { join } from 'path'

import legacySuppressions from './legacy-typescript-suppressions.json'
import { REPO_ROOT } from './repo-root'

// Split search strings so the scanner can also scan this file.
const IGNORE = '@ts-' + 'ignore'
const NOCHECK = '@ts-' + 'nocheck'
const EXPECT_ERROR = '@ts-' + 'expect-error'
const ESLINT_DISABLE = 'eslint-' + 'disable'
const OXLINT_DISABLE = 'oxlint-' + 'disable'
const COMPILE_NEGATIVE_FIXTURES = 'packages/content-ops/test/fixtures/domain-compile-negative/'
const FROZEN_SUPPRESSIONS = new Set(legacySuppressions)

export interface HygienePattern {
  label: string
  regex: string
}

export const PATTERNS: HygienePattern[] = [
  { label: IGNORE, regex: IGNORE },
  { label: NOCHECK, regex: NOCHECK },
  { label: EXPECT_ERROR, regex: EXPECT_ERROR },
  { label: ESLINT_DISABLE, regex: ESLINT_DISABLE },
  { label: OXLINT_DISABLE, regex: OXLINT_DISABLE },
  { label: 'test.' + 'skip', regex: '\\btest\\.' + 'skip\\b' },
  { label: 'it.' + 'skip', regex: '\\bit\\.' + 'skip\\b' },
  { label: 'describe.' + 'skip', regex: '\\bdescribe\\.' + 'skip\\b' },
]

export const FILE_GLOBS = ['*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.jsx', '*.cjs', '*.mjs']

/** Build the `git grep` invocation for one pattern (exported for direct assertion). */
export function buildGitGrepCommand(regex: string, fileGlobs: string[]): string {
  const globsArg = fileGlobs.map(g => `"${g}"`).join(' ')
  return `git grep -n "${regex}" -- ${globsArg}`
}

/**
 * Titles of quarantined (U6) tests from the test policy: the one sanctioned reason to leave a skip in
 * the tree (US-613). Absent or unreadable config ⇒ no exemption.
 */
export function quarantinedTitles(
  root: string = REPO_ROOT,
  fs: FileSystemService = fileSystemService,
): string[] {
  try {
    const cfg = JSON.parse(fs.readFileSync(join(root, 'docs/testing/test-policy.config.json')))
    return (cfg.quarantine ?? []).map((q: { id: string }) => q.id.split(' > ').pop() ?? '')
  } catch {
    return []
  }
}

/** Parse raw `git grep -n` stdout into formatted `  file:line` entries, excluding approved matches. */
export function parseGrepOutput(
  out: string,
  exempt: string[] = [],
  include: (line: string) => boolean = () => true,
): string[] {
  return out
    .split('\n')
    .filter(line => line.trim() && include(line))
    .filter(line => !exempt.some(t => t && line.includes(t)))
    .map(line => {
      const sep = line.indexOf(':')
      const sep2 = line.indexOf(':', sep + 1)
      const file = line.substring(0, sep)
      const lineNum = line.substring(sep + 1, sep2)
      return `  ${file}:${lineNum}`
    })
}

function isForbiddenExpectError(line: string): boolean {
  if (FROZEN_SUPPRESSIONS.has(line)) return false
  const file = line.slice(0, line.indexOf(':'))
  if (!file.startsWith(COMPILE_NEGATIVE_FIXTURES) || !/\.tsx?$/.test(file)) return true
  const description = line.slice(line.indexOf(EXPECT_ERROR) + EXPECT_ERROR.length).split('*/')[0]
  return !/^:\s*\S/.test(description ?? '')
}

export type Exec = (cmd: string) => string

function defaultExec(cmd: string): string {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
}

/** Scan one pattern; `git grep` exits 1 with no output when there are no matches — that's the happy path. */
export function scanPattern(
  pattern: HygienePattern,
  fileGlobs: string[] = FILE_GLOBS,
  exec: Exec = defaultExec,
): string[] {
  let out: string
  try {
    out = exec(buildGitGrepCommand(pattern.regex, fileGlobs))
  } catch (error) {
    if (
      error instanceof Error &&
      ('status' in error ? error.status === 1 : error.message === 'exit 1')
    ) {
      return []
    }
    throw error
  }
  if (pattern.label === EXPECT_ERROR) return parseGrepOutput(out, [], isForbiddenExpectError)
  return parseGrepOutput(out, pattern.label.endsWith('.skip') ? quarantinedTitles() : [])
}

export interface RunResult {
  violations: Map<string, string[]>
  total: number
}

/** Run every pattern and aggregate results. */
export function runHygieneCheck(
  patterns: HygienePattern[] = PATTERNS,
  fileGlobs: string[] = FILE_GLOBS,
  exec: Exec = defaultExec,
): RunResult {
  const violations = new Map<string, string[]>()
  let total = 0
  for (const pattern of patterns) {
    const matches = scanPattern(pattern, fileGlobs, exec)
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
