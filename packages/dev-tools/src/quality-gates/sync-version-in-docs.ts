/**
 * Sync Version In Docs — auto-detects and replaces hardcoded version strings in
 * .md/.mdx files across the repo.
 *
 * The LOGIC lives here as individually exported, unit-tested functions (see
 * sync-version-in-docs.test.ts, white-box, exercised against a temp-dir fixture
 * tree — no shell-out to an external search tool). The `main()` block is a thin
 * CLI wrapper run via `ts-node src/quality-gates/sync-version-in-docs.ts` (package
 * script `sync-version`).
 *
 * Usage:
 *   pnpm --filter @pair/dev-tools sync-version -- <old-version>           # apply
 *   pnpm --filter @pair/dev-tools sync-version -- <old-version> --check   # dry-run, exit 1 if drift
 *   pnpm --filter @pair/dev-tools sync-version -- --check                 # detect current version drift
 *
 * In the version workflow, OLD_CLI_VERSION is captured before `changeset version`
 * and passed as the first argument. The new version is read from
 * apps/pair-cli/package.json.
 *
 * REPO_ROOT is resolved from this file's location: packages/dev-tools/src/quality-gates
 * -> src -> dev-tools -> packages -> repo root (up 4).
 *
 * RULE FOR DOC AUTHORS: every occurrence of the old version is rewritten on EVERY .md/.mdx
 * line (only the `isExternalLine` forms are spared), prose included and unreviewed. So never
 * name a version in a sentence that is not about "the current release" — e.g. "0.4.3 and
 * earlier ignore the extra argument" becomes a factual inversion the moment it is synced.
 * Point at the CHANGELOG instead; wording without a literal version cannot be rewritten.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, relative, resolve } from 'path'

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..')

// Directories/patterns to skip — not our version strings. Merged with infra dirs
// that should never be walked (large, generated, or vendored trees).
const INFRA_EXCLUDES = ['node_modules', '.git', 'dist', 'coverage', '.turbo', '.next']
export const DEFAULT_EXCLUDES = [
  ...INFRA_EXCLUDES,
  'CHANGELOG.md',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.changeset/',
]

/**
 * Parse a .gitignore file's content into simple exclude patterns. The deleted
 * `rg`-based script implicitly respected .gitignore; the pure-JS walker that
 * replaced it does not by default, so gitignored build-artifact dirs (e.g.
 * `release/`, which can hold real .md files on disk locally) must be folded in
 * explicitly. Only simple, single-segment entries are usable by `shouldExclude`
 * (path-segment substring matching) — comments, blank lines, negations (`!...`),
 * multi-segment paths, and wildcard globs are skipped (not meaningful at that
 * granularity, and harmless to omit: they don't hold version-string docs).
 */
export function parseGitignoreExcludes(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('!'))
    .map(line => (line.endsWith('/') ? line.slice(0, -1) : line))
    .filter(pattern => !pattern.includes('/') && !pattern.includes('*'))
}

/** Read and parse `<root>/.gitignore`; [] if the file doesn't exist (e.g. test fixtures). */
export function readGitignoreExcludes(root: string): string[] {
  const gitignorePath = join(root, '.gitignore')
  if (!existsSync(gitignorePath)) return []
  return parseGitignoreExcludes(readFileSync(gitignorePath, 'utf-8'))
}

// Patterns that indicate an external version (not ours) — skip these lines.
const EXTERNAL_LINE_PATTERNS = [
  /uses:\s*\S+@v?\d/, // GitHub Actions: uses: org/action@v1.2.3
  /npm i\S*\s+\S+@\d/, // npm install pkg@version
  /pnpm add\S*\s+\S+@\d/, // pnpm add pkg@version
]

export function isExternalLine(line: string): boolean {
  return EXTERNAL_LINE_PATTERNS.some(re => re.test(line))
}

/** Rewrite one line: replace oldVersion with newVersion, unless it's an external-version line. */
export function rewriteLine(line: string, oldVersion: string, newVersion: string): string {
  if (!line.includes(oldVersion)) return line
  if (isExternalLine(line)) return line
  const versionRegex = new RegExp(oldVersion.replace(/\./g, '\\.'), 'g')
  return line.replace(versionRegex, newVersion)
}

export interface RewriteResult {
  updated: string
  changed: boolean
}

/** Rewrite every line of a file's content; `changed` is false when nothing needed rewriting. */
export function rewriteContent(
  content: string,
  oldVersion: string,
  newVersion: string,
): RewriteResult {
  const updated = content
    .split('\n')
    .map(line => rewriteLine(line, oldVersion, newVersion))
    .join('\n')
  return { updated, changed: updated !== content }
}

export function shouldExclude(relPath: string, excludePatterns: string[]): boolean {
  return excludePatterns.some(p => relPath.includes(p))
}

/** Walk a directory tree collecting .md/.mdx files, skipping excluded paths (files or dirs). */
export function walkDocFiles(dir: string, root: string, excludePatterns: string[]): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const rel = relative(root, full)
    if (shouldExclude(rel, excludePatterns)) continue
    if (entry.isDirectory()) {
      out.push(...walkDocFiles(full, root, excludePatterns))
    } else if (/\.(md|mdx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/** Every .md/.mdx file (outside excluded paths) whose content contains oldVersion. */
export function findFilesWithVersion(
  root: string,
  oldVersion: string,
  excludePatterns: string[],
): string[] {
  return walkDocFiles(root, root, excludePatterns).filter(f =>
    readFileSync(f, 'utf-8').includes(oldVersion),
  )
}

export interface SyncOptions {
  check: boolean
  excludePatterns?: string[]
}

export interface SyncResult {
  scanned: string[]
  fixed: string[]
  drifted: string[]
  unchanged: string[]
}

/** Core sync logic: find candidate files, rewrite (or just report drift), no process exit. */
export function syncVersionInDocs(
  root: string,
  oldVersion: string,
  newVersion: string,
  opts: SyncOptions,
): SyncResult {
  const excludePatterns = [
    ...DEFAULT_EXCLUDES,
    ...readGitignoreExcludes(root),
    ...(opts.excludePatterns ?? []),
  ]
  const files = findFilesWithVersion(root, oldVersion, excludePatterns)
  const result: SyncResult = { scanned: [], fixed: [], drifted: [], unchanged: [] }

  for (const abs of files) {
    const rel = relative(root, abs)
    result.scanned.push(rel)
    const original = readFileSync(abs, 'utf-8')
    const { updated, changed } = rewriteContent(original, oldVersion, newVersion)

    if (!changed) {
      result.unchanged.push(rel)
      continue
    }
    if (opts.check) {
      result.drifted.push(rel)
    } else {
      writeFileSync(abs, updated)
      result.fixed.push(rel)
    }
  }

  return result
}

/** Parse CLI argv into { check, oldVersion } — `--` may survive from `pnpm ... <script> -- <args>` invocations (pnpm/ts-node do not always strip the separator), so it's filtered out alongside --check. */
export function parseArgv(argv: string[]): { check: boolean; oldVersionArg: string | undefined } {
  const check = argv.includes('--check')
  const positional = argv.filter(a => a !== '--check' && a !== '--')
  return { check, oldVersionArg: positional[0] }
}

/** Print the per-file report lines (OK/DRIFT/FIXED) for a completed run. */
function printReport(result: SyncResult, newVersion: string): void {
  for (const rel of result.unchanged) console.log(`OK    ${rel}`)
  for (const rel of result.drifted) console.log(`DRIFT ${rel}`)
  for (const rel of result.fixed) console.log(`FIXED ${rel} → v${newVersion}`)
}

/** Thin CLI wrapper: print the report and set the exit code. */
export function main(argv: string[] = process.argv.slice(2)): void {
  const { check, oldVersionArg } = parseArgv(argv)

  const newVersion = JSON.parse(
    readFileSync(join(REPO_ROOT, 'apps/pair-cli/package.json'), 'utf-8'),
  ).version as string
  const oldVersion = oldVersionArg || newVersion

  if (oldVersion === newVersion && !check) {
    console.log('Old and new versions are identical, nothing to do.')
    return
  }

  const result = syncVersionInDocs(REPO_ROOT, oldVersion, newVersion, { check })

  if (result.scanned.length === 0) {
    console.log(check ? 'No version drift detected.' : 'No files to update.')
    return
  }

  printReport(result, newVersion)

  if (check) {
    if (result.drifted.length > 0) {
      console.error(
        `\n${result.drifted.length} file(s) have stale version. Run: pnpm --filter @pair/dev-tools sync-version -- ${oldVersion}`,
      )
      process.exit(1)
    }
    return
  }

  console.log(
    `\nDone. ${result.scanned.length} file(s) scanned, version: ${oldVersion} → ${newVersion}`,
  )
}

if (require.main === module) {
  main()
}
