import { posix } from 'node:path'

// AC-8: the package launches nothing, uses no git and no PM tool, and never reaches into a host.
// An allow-list, so a new dependency is a decision and not a drift.
const ALLOWED = new Set(['yaml', 'node:crypto', 'node:path'])
const TEST_ONLY = new Set(['vitest'])

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g

/** Every import of `source` (a file at `path`, relative to `src/`) the boundary forbids. */
function forbiddenImports(path: string, source: string): string[] {
  const isTest = path.endsWith('.test.ts')
  return [...source.matchAll(SPECIFIER)]
    .map(match => match[1] as string)
    .filter(specifier => {
      // Tests may read published documentation and workflow fixtures as text.
      if (isTest && /\.(md|yaml)\?raw$/.test(specifier)) return false
      if (specifier.startsWith('.'))
        return posix.normalize(posix.join(posix.dirname(path), specifier)).startsWith('..')
      return !ALLOWED.has(specifier) && !(isTest && TEST_ONLY.has(specifier))
    })
}

describe('package boundary (AC-8)', () => {
  it.each([
    ["import { spawn } from 'node:child_process'", 'node:child_process'],
    ["import { execFileSync } from 'child_process'", 'child_process'],
    ["const cp = require('child_process')", 'child_process'],
    ["const cp = await import('node:child_process')", 'node:child_process'],
    ["import git from 'simple-git'", 'simple-git'],
    ["import { Octokit } from '@octokit/rest'", '@octokit/rest'],
    ["import { ENGINES } from '@pair/pair-cli'", '@pair/pair-cli'],
    [
      "import { ENGINES } from '../../../apps/pair-cli/src/commands/run/engines'",
      '../../../apps/pair-cli/src/commands/run/engines',
    ],
    ["import { readFileSync } from 'node:fs'", 'node:fs'],
  ])('refuses %s', (source, specifier) => {
    expect(forbiddenImports('engine/index.ts', source)).toEqual([specifier])
  })

  it('accepts the package own modules and its declared dependencies', () => {
    const source = "import { parseDocument } from 'yaml'\nimport { kindByName } from '../kinds'"
    expect(forbiddenImports('validate/index.ts', source)).toEqual([])
  })

  it('lets a test, and only a test, read a published page as text', () => {
    const source = "import page from '../../../knowledge-hub/dataset/x.md?raw'"
    expect(forbiddenImports('kinds/reference.test.ts', source)).toEqual([])
    expect(forbiddenImports('kinds/reference.ts', source)).toEqual([
      '../../../knowledge-hub/dataset/x.md?raw',
    ])
  })

  it('holds on every source file of the package', () => {
    const sources = import.meta.glob('./**/*.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    const violations = Object.entries(sources).flatMap(([path, source]) =>
      forbiddenImports(path.replace(/^\.\//, ''), source).map(found => `${path}: ${found}`),
    )
    expect(Object.keys(sources)).toContain('./index.ts')
    expect(violations).toEqual([])
  })
})
