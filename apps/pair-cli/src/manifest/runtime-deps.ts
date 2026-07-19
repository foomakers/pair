import { isBuiltin } from 'node:module'

/**
 * Manifest-invariant helpers guarding the published artifact.
 *
 * Regression guard for #345: a package value-imported by the CLI's *built* source
 * must be declared in `dependencies` (not only `devDependencies`), otherwise
 * `npm install @pair/pair-cli` omits it and the compiled `require(...)` throws
 * `Cannot find module` at runtime. `postbuild.js` deletes `devDependencies` from
 * the shipped `dist/package.json`, so a devDependency is never available to a
 * consumer installing the published tarball.
 *
 * Scope & known boundaries (deliberate — this is a lightweight, regex-based gate,
 * not a TS-AST analysis; robust detection would require the TS compiler API,
 * intentionally avoided here to keep the gate fast and dependency-free):
 * - ESM-only: detects `import` / `export … from` / dynamic `import()`. It does
 *   NOT detect CommonJS `require()` / `createRequire(...)` — a runtime
 *   `require('devDepOnlyPkg')` would evade the gate. None exist in built source.
 * - Type-position `import()` (e.g. `type T = import('pkg').X`, `x: import('pkg').Y`)
 *   is erased at compile time but IS matched by the dynamic-import regex, so a
 *   type-only `import()` of a devDependency-only package would be a false
 *   positive. None exist in built source.
 * - The line-comment stripper is a heuristic: an import sharing a line with a
 *   preceding string literal containing `//` could be dropped (false negative).
 * These blind spots are acceptable because Prettier enforces one import per line
 * at the top of each file, isolated from string-bearing statements.
 */
export interface PackageManifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

/**
 * Resolve an import specifier to its installable package name, or `null` when the
 * specifier is not an installable third-party package (relative path, `#` subpath
 * import, or a Node builtin).
 *
 * - `@pair/content-ops`        -> `@pair/content-ops`
 * - `@pair/content-ops/http`   -> `@pair/content-ops`
 * - `markdown-it`              -> `markdown-it`
 * - `chalk/foo`                -> `chalk`
 * - `./local` / `../x` / `#ui` -> `null`
 * - `node:fs` / `fs`           -> `null`
 */
export function toPackageName(specifier: string): string | null {
  if (specifier === '') return null
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null
  if (specifier.startsWith('#')) return null
  if (isBuiltin(specifier)) return null

  const segments = specifier.split('/')
  const name = specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]
  if (name === undefined || name === '') return null

  return isBuiltin(name) ? null : name
}

/**
 * Remove block and line comments so import-like text inside comments is not
 * mistaken for a real import. Preserves `://` (URLs) inside strings.
 *
 * Heuristic boundary: the line-comment pass is text-based, not tokenizer-aware,
 * so a `//` inside a preceding string literal on the same line as an import
 * (e.g. `const s = 'a//b'; import x from 'dep'`) truncates that import — a false
 * negative. Safe under the enforced one-import-per-line formatting convention.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1') // line comments, but not protocol `://`
}

/**
 * Extract package specifiers imported for their runtime **values** from a
 * TypeScript source file. Type-only imports (type-only `import`) are excluded —
 * they are erased at compile time and impose no runtime dependency.
 *
 * Covers static value imports, side-effect imports, re-exports, and dynamic
 * imports. A type-only named member inside a value import still counts as a
 * runtime import of the module.
 *
 * ESM-only: CommonJS `require()` / `createRequire(...)` is out of scope and not
 * detected (see the module-level "Scope & known boundaries" note).
 */
export function extractRuntimeImports(sourceText: string): string[] {
  const source = stripComments(sourceText)
  const specifiers: string[] = []

  // Static value imports + side-effect imports; type-only excluded via lookahead.
  const staticImport = /(?<!\w)import\s+(?!type\s)(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/g
  // Re-exports (runtime dependency); type-only re-exports excluded.
  const reExport = /(?<!\w)export\s+(?!type\s)[^'"]*?\sfrom\s*['"]([^'"]+)['"]/g
  // Dynamic imports. NB: also matches type-position `import('pkg')` (e.g.
  // `type T = import('pkg').X`), which is erased at compile time — a latent
  // false-positive for a devDependency-only package. See module-level note.
  const dynamicImport = /(?<!\w)import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const re of [staticImport, reExport, dynamicImport]) {
    let match: RegExpExecArray | null
    while ((match = re.exec(source)) !== null) {
      const specifier = match[1]
      if (specifier !== undefined) specifiers.push(specifier)
    }
  }

  return specifiers
}

/**
 * Given the runtime import specifiers used by built source and a package
 * manifest, return the sorted, de-duplicated package names that are imported at
 * runtime but NOT declared in `dependencies`. Empty means the invariant holds.
 */
export function findUndeclaredRuntimeDeps(
  runtimeSpecifiers: readonly string[],
  manifest: PackageManifest,
): string[] {
  const declared = new Set(Object.keys(manifest.dependencies ?? {}))
  const missing = new Set<string>()

  for (const specifier of runtimeSpecifiers) {
    const name = toPackageName(specifier)
    if (name === null) continue
    if (!declared.has(name)) missing.add(name)
  }

  return [...missing].sort()
}
