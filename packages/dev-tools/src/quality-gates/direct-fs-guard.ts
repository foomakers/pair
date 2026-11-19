/**
 * Direct-fs guard (US-621, AC1/AC5): every authored JS/TS file with a direct `fs` dependency must have
 * an exact-path, reasoned entry in docs/engineering/direct-fs-inventory.json. Unlisted, stale and
 * unresolved entries fail with file, import and reason. Limit: literal module specifiers only —
 * non-literal dynamic imports/requires are not seen.
 */
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import ts from 'typescript'

import { REPO_ROOT } from './repo-root'

export interface FsDependency {
  form: 'import' | 'export' | 'require' | 'dynamic-import'
  specifier: string
  line: number
}

export interface RegistryRow {
  path: string
  disposition: string
  reason?: string
  decision?: string
  testCategory?: string
}

const FS_SPECIFIERS = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises'])
const EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/
const ROOTS = /^(?:apps|packages|scripts)\//
// third-party at any depth; generated output only at the package root (nested `build/` dirs are authored code)
const EXCLUDED =
  /(?:^|\/)node_modules\/|^(?:apps|packages)\/[^/]+\/(?:dist|build|\.next|coverage)\//
/** Dispositions that are not a reviewed exception: `migrate`/`deferred-migration` must stop using fs, candidates are unresolved. */
const UNRESOLVED = new Set(['migrate', 'migration-candidate', 'to-evaluate', 'deferred-migration'])

const ALLOWED = new Set([
  'os-guarantee',
  'standalone-script',
  'type-contract',
  'boundary-adapter',
  'repo-contract',
  'in-flight-churn',
])

export function isAuditedPath(path: string): boolean {
  return EXTENSIONS.test(path) && ROOTS.test(path) && !EXCLUDED.test(path)
}

/** Find direct fs dependencies: import/export-from, require, literal dynamic import. */
export function findFsDependencies(path: string, source: string): FsDependency[] {
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  const found: FsDependency[] = []
  const add = (form: FsDependency['form'], lit: ts.Node | undefined) => {
    if (lit && ts.isStringLiteralLike(lit) && FS_SPECIFIERS.has(lit.text))
      found.push({
        form,
        specifier: lit.text,
        line: sf.getLineAndCharacterOfPosition(lit.getStart(sf)).line + 1,
      })
  }
  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n)) add('import', n.moduleSpecifier)
    else if (ts.isExportDeclaration(n)) add('export', n.moduleSpecifier)
    else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference))
      add('require', n.moduleReference.expression)
    else if (ts.isCallExpression(n)) {
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword) add('dynamic-import', n.arguments[0])
      else if (ts.isIdentifier(n.expression) && n.expression.text === 'require')
        add('require', n.arguments[0])
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

/** Compare scanned dependencies against the exact-path registry; returns deterministic diagnostics. */
export function checkRegistry(scanned: Map<string, FsDependency[]>, rows: RegistryRow[]): string[] {
  const errors: string[] = []
  const byPath = new Map(rows.map(r => [r.path, r]))
  for (const [path, deps] of [...scanned].sort(([a], [b]) => a.localeCompare(b))) {
    const row = byPath.get(path)
    const d = deps[0]!
    if (!row)
      errors.push(
        `${path}:${d.line} unlisted direct-fs ${d.form} '${d.specifier}': route through FileSystemService or add an exact registry entry with reason`,
      )
    else if (UNRESOLVED.has(row.disposition))
      errors.push(
        `${path}:${d.line} '${d.specifier}' disposition '${row.disposition}' is unresolved: migrate it or record a reasoned exception`,
      )
    else if (!row.reason || !row.decision || !row.testCategory)
      errors.push(`${path}:${d.line} registry entry lacks reason, decision or testCategory`)
    else if (!ALLOWED.has(row.disposition))
      errors.push(
        `${path}:${d.line} '${d.specifier}' disposition '${row.disposition}' is not a reviewed exception`,
      )
  }
  for (const row of rows)
    if (!scanned.has(row.path))
      errors.push(
        `${row.path} stale registry entry (${row.disposition}): no direct-fs dependency remains; remove it`,
      )
  return errors
}

export const REGISTRY_PATH = 'docs/engineering/direct-fs-inventory.json'

export function runGuard(root: string = REPO_ROOT): string[] {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(isAuditedPath)
  const scanned = new Map<string, FsDependency[]>()
  for (const f of files) {
    let src: string
    try {
      src = readFileSync(join(root, f), 'utf8')
    } catch {
      continue // tracked but deleted in the working tree
    }
    const deps = findFsDependencies(f, src)
    if (deps.length) scanned.set(f, deps)
  }
  const rows: RegistryRow[] = JSON.parse(readFileSync(join(root, REGISTRY_PATH), 'utf8')).rows
  return checkRegistry(scanned, rows)
}

export function main(): void {
  const errors = runGuard()
  console.log('Direct-fs guard')
  if (!errors.length) return console.log('PASS')
  console.log(`FAIL — ${errors.length} problem(s)\n${errors.map(e => `  ${e}`).join('\n')}`)
  process.exit(1)
}

if (require.main === module) main()
