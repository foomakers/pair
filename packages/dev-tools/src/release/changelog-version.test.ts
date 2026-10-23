import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../quality-gates/repo-root'
import { applyChangelogVersion, rewriteChangelog } from './changelog-version'

// B12 (#568): v0.5.1 shipped with `## 0.5.0` headings and `@pair/*@0.5.0` lines.
const CHANGELOG = `# @pair/pair-cli

## 0.5.0

### Minor Changes

- feat (thanks @pair/x@0.5.0 is prose, kept)

### Patch Changes

- Updated dependencies []:
  - @pair/content-ops@0.5.0
  - @pair/knowledge-hub@0.5.0

## 0.4.3

- Updated dependencies []:
  - @pair/content-ops@0.4.3
`

describe('changelog-version (B12)', () => {
  it('rewrites the top heading and dependency lines to the override', () => {
    const out = rewriteChangelog(CHANGELOG, '0.5.0', '0.5.1')
    expect(out).toContain('## 0.5.1\n')
    expect(out).not.toContain('## 0.5.0')
    expect(out).toContain('  - @pair/content-ops@0.5.1\n  - @pair/knowledge-hub@0.5.1\n')
    expect(out).toContain('(thanks @pair/x@0.5.0 is prose, kept)')
  })
  it('leaves older sections untouched', () => {
    const out = rewriteChangelog(CHANGELOG, '0.5.0', '0.5.1')
    expect(out).toContain('## 0.4.3\n\n- Updated dependencies []:\n  - @pair/content-ops@0.4.3\n')
  })
  it('keeps a prerelease suffix and is a no-op when the top section is another version', () => {
    expect(rewriteChangelog(CHANGELOG, '0.5.0', '0.5.1-rc.1')).toContain('## 0.5.1-rc.1\n')
    expect(rewriteChangelog(CHANGELOG, '0.6.0', '0.6.1')).toBe(CHANGELOG)
    expect(rewriteChangelog(CHANGELOG, '0.5.0', '0.5.0')).toBe(CHANGELOG)
  })
  it('applies to every CHANGELOG.md under the given paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'clv-'))
    for (const d of ['a', 'b']) {
      mkdirSync(join(root, d))
      writeFileSync(join(root, d, 'CHANGELOG.md'), CHANGELOG)
    }
    const changed = applyChangelogVersion(
      ['a/CHANGELOG.md', 'b/CHANGELOG.md'].map(f => join(root, f)),
      '0.5.0',
      '0.5.1',
    )
    expect(changed).toHaveLength(2)
    expect(readFileSync(join(root, 'b', 'CHANGELOG.md'), 'utf8')).toContain('## 0.5.1\n')
  })
  it('version.yml applies the override to CHANGELOGs after changeset version', () => {
    const steps = parse(readFileSync(join(REPO_ROOT, '.github/workflows/version.yml'), 'utf8')).jobs
      .version.steps as { name?: string; run?: string }[]
    const run = steps.find(s => s.name === 'Version packages')?.run ?? ''
    const cv = run.indexOf('pnpm changeset version')
    const computed = run.indexOf('NEW=$(node -p')
    const apply = run.indexOf('pnpm changelog-version -- "$NEW" "$VERSION"')
    expect(cv).toBeGreaterThan(-1)
    expect(computed).toBeGreaterThan(cv)
    expect(apply).toBeGreaterThan(computed)
  })
})
