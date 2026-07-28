import { describe, it, expect } from 'vitest'
import { renderReleaseScript, releaseZipPath } from './release-script'

const identity = { name: 'acme-kb', slug: 'acme-kb', skillPrefix: 'acme-kb' }

describe('releaseZipPath', () => {
  it('places the packaged ZIP under dist/ named after the KB slug', () => {
    expect(releaseZipPath(identity)).toBe('dist/acme-kb-$VERSION.zip')
  })
})

describe('renderReleaseScript', () => {
  const github = renderReleaseScript({ identity, host: 'github' })
  const generic = renderReleaseScript({ identity, host: 'generic' })

  it('is a strict-mode bash script', () => {
    expect(github.startsWith('#!/usr/bin/env bash\n')).toBe(true)
    expect(github).toContain('set -euo pipefail')
  })

  it('requires a semver version argument', () => {
    expect(github).toContain('VERSION="${1:-}"')
    expect(github).toContain('grep -Eq')
    expect(github).toMatch(/usage: .*<version>/)
  })

  it('reuses the existing pair package command instead of a new release mechanism', () => {
    expect(github).toContain('PAIR_CLI="${PAIR_CLI:-npx --yes @foomakers/pair-cli}"')
    expect(github).toContain('$PAIR_CLI package')
    expect(github).toContain('--layout source')
    expect(github).toContain('--name "acme-kb"')
    expect(github).toContain('--pkg-version "$VERSION"')
    expect(github).toContain('-o "$ZIP"')
  })

  it('tags and publishes a GitHub release with the ZIP attached on the github host', () => {
    expect(github).toContain('git tag -a "v$VERSION"')
    expect(github).toContain('git push origin "v$VERSION"')
    expect(github).toContain('gh release create "v$VERSION" "$ZIP"')
  })

  it('skips tagging when the tag already exists (re-runs and tag-triggered CI)', () => {
    expect(github).toContain('refs/tags/v$VERSION')
  })

  it('degrades to documented manual publishing when gh is unavailable', () => {
    expect(github).toContain('command -v gh')
    expect(github).toMatch(/publish it however your org does/i)
  })

  it('omits GitHub-specific publishing on the generic host but still reports the ZIP', () => {
    expect(generic).not.toContain('gh release create')
    expect(generic).toContain('$PAIR_CLI package')
    expect(generic).toMatch(/publish it however your org does/i)
    expect(generic).toContain('$ZIP')
  })
})
