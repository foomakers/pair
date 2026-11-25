import { posix } from 'node:path'

// #696 AC-6: the workflow core launches nothing, uses no git and never imports a host adapter.
const ALLOWED = new Set(['yaml', 'node:crypto', 'node:path'])
const HOST_ADAPTER = /^(?:cli|worktree)(?:\/|$)/

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g

/** Every import of `source` (a file at `path`, relative to `src/`) the boundary forbids. */
function forbiddenImports(path: string, source: string): string[] {
  const isTest = path.endsWith('.test.ts')
  const isHost = HOST_ADAPTER.test(path)
  const allowed = new Set(ALLOWED)
  if (isTest) allowed.add('vitest')
  if (isHost) allowed.add('node:fs')
  if (path === 'cli/run-lock.ts') allowed.add('node:os')
  if (path === 'cli/session-files.ts') allowed.add('node:fs/promises')
  if (path === 'cli/workflow.ts') allowed.add('node:util')
  if (path.startsWith('worktree/')) allowed.add('node:child_process')
  return [...source.matchAll(SPECIFIER)]
    .map(match => match[1] as string)
    .filter(specifier => {
      // A test may read a published page as text, to prove it is not stale.
      if (isTest && specifier.endsWith('.md?raw')) return false
      if (specifier.startsWith('.')) {
        const target = posix.normalize(posix.join(posix.dirname(path), specifier))
        return target.startsWith('..') || (!isHost && HOST_ADAPTER.test(target))
      }
      return !allowed.has(specifier)
    })
}

describe('workflow core boundary (#696 AC-6)', () => {
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
    ["import { prepareWorktree } from '../worktree'", '../worktree'],
    ["const host = await import('../cli/index')", '../cli/index'],
  ])('refuses %s', (source, specifier) => {
    expect(forbiddenImports('engine/index.ts', source)).toEqual([specifier])
  })

  it('accepts the package own modules and its declared dependencies', () => {
    const source = "import { parseDocument } from 'yaml'\nimport { kindByName } from '../kinds'"
    expect(forbiddenImports('validate/index.ts', source)).toEqual([])
  })

  it('allows only the worktree adapter to import Git process support', () => {
    const source = "import { spawnSync } from 'node:child_process'"
    expect(forbiddenImports('worktree/index.ts', source)).toEqual([])
    expect(forbiddenImports('cli/index.ts', source)).toEqual(['node:child_process'])
  })

  it('allows only the CLI run lock to import the host OS module', () => {
    const source = "import { hostname } from 'node:os'"
    expect(forbiddenImports('engine/index.ts', source)).toEqual(['node:os'])
    expect(forbiddenImports('worktree/index.ts', source)).toEqual(['node:os'])
    expect(forbiddenImports('cli/index.ts', source)).toEqual(['node:os'])
    expect(forbiddenImports('cli/run-lock.ts', source)).toEqual([])
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
