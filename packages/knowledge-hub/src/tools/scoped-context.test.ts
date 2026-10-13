import { describe, it, expect } from 'vitest'
import { resolveScopedContext, parseRouter } from './scoped-context'

const central = `# Architecture

## Package-Local Adoption

| Package | Local context | Areas |
| --- | --- | --- |
| apps/web | \`apps/web/.pair/\` | architecture, testing |
| packages/ui | \`packages/ui/.pair/\` | code-design |
| packages/gone | \`packages/gone/.pair/\` | testing |
`

// 3-package fixture: apps/web (local), packages/ui (local), packages/api (no local)
const existing = new Set(['apps/web/.pair', 'packages/ui/.pair'])
const run = (files: string[], text: string | undefined = central) =>
  resolveScopedContext({
    centralAdoption: text,
    touchedFiles: files,
    dirExists: d => existing.has(d),
  })

describe('scoped context resolution (monorepo fixture)', () => {
  it('parses router rows', () => {
    expect(parseRouter(central).map(r => r.package)).toEqual([
      'apps/web',
      'packages/ui',
      'packages/gone',
    ])
  })

  it('AC2: diff touching only apps/web loads that local dir only', () => {
    const r = run(['apps/web/src/a.ts', 'apps/web/README.md'])
    expect(r.localDirs).toEqual(['apps/web/.pair'])
    expect(r.active).toBe(true)
  })

  it('multi-package diff loads each touched local dir, not others', () => {
    const r = run(['apps/web/a.ts', 'packages/ui/b.ts', 'packages/api/c.ts'])
    expect(r.localDirs).toEqual(['apps/web/.pair', 'packages/ui/.pair'])
  })

  it('AC3: story referencing a package loads only its local dir', () => {
    expect(run(['packages/ui']).localDirs).toEqual(['packages/ui/.pair'])
  })

  it('package without local .pair: globals only, no warnings', () => {
    const r = run(['packages/api/c.ts'])
    expect(r.localDirs).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('no package referenced: central-only', () => {
    const r = run([])
    expect(r.localDirs).toEqual([])
  })

  it('dangling router entry is reported, globals continue', () => {
    const r = run(['packages/gone/x.ts'])
    expect(r.localDirs).toEqual([])
    expect(r.warnings).toEqual([
      'dangling router entry: packages/gone (packages/gone/.pair missing)',
    ])
  })

  it('AC1: no router ⇒ inactive, loads nothing local', () => {
    const r = run(['apps/web/a.ts'], '# Architecture\n\nglobal rules only\n')
    expect(r).toEqual({ active: false, localDirs: [], warnings: [] })
  })

  it('longest-prefix wins for nested packages', () => {
    const text = `## Package-Local Adoption\n\n| Package | Local context | Areas |\n| --- | --- | --- |\n| apps | \`apps/.pair/\` | a |\n| apps/web | \`apps/web/.pair/\` | a |\n`
    const r = resolveScopedContext({
      centralAdoption: text,
      touchedFiles: ['apps/web/x.ts'],
      dirExists: () => true,
    })
    expect(r.localDirs).toEqual(['apps/web/.pair'])
  })

  it('does not match a sibling sharing a name prefix', () => {
    const r = run(['apps/web-admin/x.ts'])
    expect(r.localDirs).toEqual([])
  })
})
