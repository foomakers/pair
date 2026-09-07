import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import * as citations from './repo-citations'
import * as gate from './docs-staleness-check'

const REPO_ROOT = resolve(__dirname, '../../..')
const DEAD = 'https://github.com/foomakers/pair/blob/main/does/not/exist.md'

/**
 * THE SEAM. `docs-staleness-check.ts` is the docs gate's ORCHESTRATION — skill counts,
 * the catalog, CLI commands, list-targets samples, `runAllChecks`. The repo-citation
 * resolver (`REPO_BLOB_RE`, `parseCitation`, `isPinnedRef`, `findDeadRepoLinks`,
 * `findDeadLinks`), the rendered-surface masking under it, the github.com slugger
 * (`slugifyHeading`, `collectHeadingSlugs`) and their lossless diagnostics change for
 * ONE reason — how a citation is read and resolved — and none of it changes when a skill
 * is added or a catalog row moves. They live in `repo-citations.ts`; the gate imports
 * them and re-exports the same bindings, so every existing consumer keeps its import.
 */
describe('repo-citations — the citation resolver is its own module', () => {
  it('exports the resolver, the slugger and the link checks', () => {
    for (const name of [
      'findDeadRepoLinks',
      'findDeadLinks',
      'collectHeadingSlugs',
      'slugifyHeading',
      'parseCitation',
      'isPinnedRef',
    ] as const) {
      expect(typeof citations[name], name).toBe('function')
    }
    expect(citations.REPO_BLOB_RE, 'REPO_BLOB_RE').toBeInstanceOf(RegExp)
  })

  it('is the ONE implementation the gate re-exports — same bindings, not copies', () => {
    expect(gate.findDeadRepoLinks).toBe(citations.findDeadRepoLinks)
    expect(gate.findDeadLinks).toBe(citations.findDeadLinks)
    expect(gate.collectHeadingSlugs).toBe(citations.collectHeadingSlugs)
    expect(gate.slugifyHeading).toBe(citations.slugifyHeading)
    expect(gate.parseCitation).toBe(citations.parseCitation)
    expect(gate.isPinnedRef).toBe(citations.isPinnedRef)
    expect(gate.REPO_BLOB_RE).toBe(citations.REPO_BLOB_RE)
  })

  it('resolves a citation end to end from its own module', () => {
    const errs = citations.findDeadRepoLinks(`see [x](${DEAD})`, 'a.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('Dead repo-file citation')
    expect(citations.parseCitation('docs/a.md?plain=1#sec.')).toEqual({
      path: 'docs/a.md',
      fragment: 'sec',
    })
    expect(citations.isPinnedRef('v1.2.3')).toBe(true)
    expect(citations.isPinnedRef('develop')).toBe(false)
    expect(citations.slugifyHeading('Execution Log')).toBe('execution-log')
    expect(citations.collectHeadingSlugs('# Doc\n\n## Real\n')).toEqual(new Set(['doc', 'real']))
    expect(citations.findDeadLinks('[x](/docs/nope)', 'a.mdx', new Set(['/docs']))).toHaveLength(1)
  })
})
