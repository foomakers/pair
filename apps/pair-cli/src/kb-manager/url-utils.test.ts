import { describe, it, expect } from 'vitest'
import urlUtils from './url-utils'

describe('url-utils', () => {
  it('normalizeVersionTag strips leading v for asset but keeps for tag', () => {
    const tag = 'v1.2.3'
    const normalized = urlUtils.normalizeVersionTag(tag)
    expect(normalized.clean).toBe('1.2.3')
    expect(normalized.tag).toBe('v1.2.3')
  })

  it('buildGithubReleaseUrl builds expected URL for v0.2.0', () => {
    const url = urlUtils.buildGithubReleaseUrl('0.2.0')
    expect(url).toBe(
      'https://github.com/foomakers/pair/releases/download/v0.2.0/knowledge-base-0.2.0.zip',
    )
  })

  it('buildGithubReleaseUrl builds expected URL for v0.4.1', () => {
    const url = urlUtils.buildGithubReleaseUrl('0.4.1')
    expect(url).toBe(
      'https://github.com/foomakers/pair/releases/download/v0.4.1/knowledge-base-0.4.1.zip',
    )
  })
})
