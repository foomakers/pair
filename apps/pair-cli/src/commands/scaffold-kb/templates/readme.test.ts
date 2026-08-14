import { describe, it, expect } from 'vitest'
import { renderReadme } from './readme'

const identity = { name: 'acme-kb', slug: 'acme-kb', skillPrefix: 'acme-kb' }

describe('renderReadme', () => {
  const github = renderReadme({ identity, host: 'github' })
  const generic = renderReadme({ identity, host: 'generic' })

  it('titles the repo with the KB name', () => {
    expect(github.startsWith('# acme-kb\n')).toBe(true)
  })

  it('documents the pure-KB layout', () => {
    expect(github).toContain('.pair/knowledge/')
    expect(github).toContain('.skills/')
    expect(github).toContain('pair.config.json')
  })

  it('documents how to cut a release', () => {
    expect(github).toContain('bash scripts/release.sh 1.0.0')
  })

  it('documents how a consuming project installs this KB', () => {
    expect(github).toContain('pair-cli install --source')
  })

  it('mentions the release workflow only on the github host', () => {
    expect(github).toContain('.github/workflows/release.yml')
    expect(generic).not.toContain('.github/workflows/release.yml')
  })

  it('documents the ZIP location for hosts without automated release publishing', () => {
    expect(generic).toContain('dist/acme-kb-<version>.zip')
  })

  // The scaffolded README is committed into every external-KB repo and read by that KB's
  // consumers: a limitation that no longer exists steers them off the release artifact.
  it('offers the release ZIP as an install source, with no stale #395 limitation', () => {
    for (const readme of [github, generic]) {
      expect(readme).toContain('pair-cli install --source ./dist/acme-kb-1.0.0.zip')
      expect(readme).not.toContain('not yet equivalent')
      expect(readme).not.toContain('issues/395')
    }
  })

  it('keeps the limitations that are still real (#396, #397)', () => {
    expect(github).toContain('issues/396')
    expect(github).toContain('issues/397')
  })
})
