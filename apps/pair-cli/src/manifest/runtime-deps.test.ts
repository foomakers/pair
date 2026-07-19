import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  extractRuntimeImports,
  findUndeclaredRuntimeDeps,
  isTsconfigExcluded,
  toPackageName,
  tsconfigGlobToRegExp,
  type PackageManifest,
} from './runtime-deps'

describe('toPackageName', () => {
  it('returns scoped package name, dropping subpaths', () => {
    expect(toPackageName('@pair/content-ops')).toBe('@pair/content-ops')
    expect(toPackageName('@pair/content-ops/http')).toBe('@pair/content-ops')
  })

  it('returns unscoped package name, dropping subpaths', () => {
    expect(toPackageName('markdown-it')).toBe('markdown-it')
    expect(toPackageName('chalk/foo')).toBe('chalk')
  })

  it('returns null for relative/absolute/subpath specifiers', () => {
    expect(toPackageName('./local')).toBeNull()
    expect(toPackageName('../x')).toBeNull()
    expect(toPackageName('/abs')).toBeNull()
    expect(toPackageName('#ui')).toBeNull()
    expect(toPackageName('')).toBeNull()
  })

  it('returns null for Node builtins (bare and node: prefixed)', () => {
    expect(toPackageName('fs')).toBeNull()
    expect(toPackageName('node:fs')).toBeNull()
    expect(toPackageName('path')).toBeNull()
    expect(toPackageName('node:module')).toBeNull()
  })
})

describe('extractRuntimeImports', () => {
  it('captures value imports (named, default, namespace, side-effect)', () => {
    const src = [
      "import { logger } from '@pair/content-ops'",
      "import chalk from 'chalk'",
      "import * as fs from 'node:fs'",
      "import './side-effect'",
    ].join('\n')
    expect(extractRuntimeImports(src)).toEqual(
      expect.arrayContaining(['@pair/content-ops', 'chalk', 'node:fs', './side-effect']),
    )
  })

  it('excludes type-only imports', () => {
    const src = [
      "import type { FileSystemService } from '@pair/content-ops'",
      "import { detectSourceType } from '@pair/content-ops'",
    ].join('\n')
    const found = extractRuntimeImports(src)
    // The value import keeps the module as a runtime dependency...
    expect(found).toContain('@pair/content-ops')
    // ...but a file with ONLY a type import contributes nothing.
    expect(extractRuntimeImports("import type { X } from 'only-types'")).toEqual([])
  })

  it('ignores import-like text inside comments', () => {
    const src = [
      "// import { fake } from 'not-a-real-dep'",
      "/* import realLooking from 'also-fake' */",
      "import { real } from '@pair/content-ops'",
    ].join('\n')
    expect(extractRuntimeImports(src)).toEqual(['@pair/content-ops'])
  })

  it('does not treat URLs as line comments', () => {
    const src = "const u = 'https://example.com'\nimport chalk from 'chalk'"
    expect(extractRuntimeImports(src)).toContain('chalk')
  })

  it('captures dynamic imports', () => {
    expect(extractRuntimeImports("const m = await import('@pair/content-ops')")).toContain(
      '@pair/content-ops',
    )
  })

  it('captures re-exports but excludes type-only re-exports', () => {
    expect(extractRuntimeImports("export { validateUrl } from '@pair/content-ops'")).toContain(
      '@pair/content-ops',
    )
    expect(extractRuntimeImports("export type { X } from 'only-types'")).toEqual([])
  })
})

describe('findUndeclaredRuntimeDeps', () => {
  it('flags a runtime import present only in devDependencies (the #345 bug)', () => {
    const manifest: PackageManifest = {
      dependencies: { chalk: '^4' },
      devDependencies: { '@pair/content-ops': 'workspace:*' },
    }
    expect(findUndeclaredRuntimeDeps(['@pair/content-ops', 'chalk'], manifest)).toEqual([
      '@pair/content-ops',
    ])
  })

  it('passes when every runtime import is declared in dependencies', () => {
    const manifest: PackageManifest = {
      dependencies: { '@pair/content-ops': 'workspace:*', chalk: '^4' },
    }
    expect(
      findUndeclaredRuntimeDeps(['@pair/content-ops', '@pair/content-ops/http', 'chalk'], manifest),
    ).toEqual([])
  })

  it('ignores builtins, relative paths, and subpath imports', () => {
    const manifest: PackageManifest = { dependencies: {} }
    expect(findUndeclaredRuntimeDeps(['node:fs', './x', '#ui'], manifest)).toEqual([])
  })

  it('de-duplicates and sorts missing packages', () => {
    const manifest: PackageManifest = { dependencies: {} }
    expect(findUndeclaredRuntimeDeps(['b-pkg', 'a-pkg', 'b-pkg/sub'], manifest)).toEqual([
      'a-pkg',
      'b-pkg',
    ])
  })
})

describe('tsconfigGlobToRegExp', () => {
  it('matches a file glob with `**` spanning zero or more segments', () => {
    const re = tsconfigGlobToRegExp('src/**/*.test.ts')
    expect(re.test('src/foo.test.ts')).toBe(true) // ** = zero segments
    expect(re.test('src/a/b/foo.test.ts')).toBe(true) // ** = several segments
    expect(re.test('src/foo.ts')).toBe(false)
    expect(re.test('foo.test.ts')).toBe(false) // not under src/
  })

  it('treats an extension-free, wildcard-free pattern as a whole subtree', () => {
    const re = tsconfigGlobToRegExp('**/test-utils')
    expect(re.test('src/test-utils')).toBe(true) // the dir itself
    expect(re.test('src/x/test-utils/helper.ts')).toBe(true) // a file within it
    expect(re.test('src/test-utils-not/helper.ts')).toBe(false)
  })

  it('matches a plain relative file path exactly', () => {
    const re = tsconfigGlobToRegExp('src/manifest/runtime-deps.ts')
    expect(re.test('src/manifest/runtime-deps.ts')).toBe(true)
    expect(re.test('src/manifest/runtime-deps.test.ts')).toBe(false)
    expect(re.test('src/other/runtime-deps.ts')).toBe(false)
  })
})

describe('isTsconfigExcluded', () => {
  const patterns = ['src/**/*.test.ts', '**/test-utils', 'src/manifest/runtime-deps.ts']

  it('excludes a path matched by any pattern', () => {
    expect(isTsconfigExcluded('src/a/b.test.ts', patterns)).toBe(true)
    expect(isTsconfigExcluded('src/test-utils/x.ts', patterns)).toBe(true)
    expect(isTsconfigExcluded('src/manifest/runtime-deps.ts', patterns)).toBe(true)
  })

  it('keeps a shipped source path', () => {
    expect(isTsconfigExcluded('src/cli.ts', patterns)).toBe(false)
    expect(isTsconfigExcluded('src/manifest/other.ts', patterns)).toBe(false)
  })
})

describe('published artifact invariant (regression #345)', () => {
  const pkgRoot = join(__dirname, '..', '..')

  // Derive "what ships" from the SAME exclusion list the build uses, so the two
  // can never drift (finding: a hardcoded copy could raise a false positive when
  // a new build-excluded path is added).
  const buildConfig = JSON.parse(
    readFileSync(join(pkgRoot, 'tsconfig.build.json'), 'utf8'),
  ) as { exclude?: string[] }
  const excludePatterns = buildConfig.exclude ?? []

  function toRelPosix(path: string): string {
    return relative(pkgRoot, path).split(sep).join('/')
  }

  function collectBuiltSourceFiles(dir: string): string[] {
    const files: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (isTsconfigExcluded(toRelPosix(full), excludePatterns)) continue
      if (entry.isDirectory()) {
        files.push(...collectBuiltSourceFiles(full))
        continue
      }
      if (!entry.name.endsWith('.ts')) continue
      files.push(full)
    }
    return files
  }

  it('derives at least one exclusion from tsconfig.build.json', () => {
    // Guards the derivation itself: if exclude were empty/misread, the invariant
    // test below would scan test files and give false confidence.
    expect(excludePatterns).toContain('**/test-utils')
  })

  it('does not scan the build-excluded gate module itself', () => {
    const scanned = collectBuiltSourceFiles(join(pkgRoot, 'src')).map(toRelPosix)
    expect(scanned).not.toContain('src/manifest/runtime-deps.ts')
  })

  it('declares every runtime-imported package in dependencies (not devDependencies)', () => {
    const manifest = JSON.parse(
      readFileSync(join(pkgRoot, 'package.json'), 'utf8'),
    ) as PackageManifest

    const specifiers = collectBuiltSourceFiles(join(pkgRoot, 'src')).flatMap(file =>
      extractRuntimeImports(readFileSync(file, 'utf8')),
    )

    const undeclared = findUndeclaredRuntimeDeps(specifiers, manifest)

    expect(
      undeclared,
      `Packages value-imported by built source but missing from "dependencies": ${undeclared.join(
        ', ',
      )}. They ship broken in the published tarball (postbuild strips devDependencies).`,
    ).toEqual([])
  })

  it('keeps @pair/content-ops as a runtime dependency', () => {
    const manifest = JSON.parse(
      readFileSync(join(pkgRoot, 'package.json'), 'utf8'),
    ) as PackageManifest
    expect(manifest.dependencies ?? {}).toHaveProperty('@pair/content-ops')
    expect(manifest.devDependencies ?? {}).not.toHaveProperty('@pair/content-ops')
  })
})
