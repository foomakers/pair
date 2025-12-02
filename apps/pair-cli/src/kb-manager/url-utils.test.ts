import { describe, it, expect } from 'vitest'
import urlUtils from './url-utils'

describe('url-utils', () => {
  it('normalizeVersionTag strips leading v for asset but keeps for tag', () => {
    const tag = 'v1.2.3'
    const normalized = urlUtils.normalizeVersionTag(tag)
    expect(normalized.clean).toBe('1.2.3')
    expect(normalized.tag).toBe('v1.2.3')
  })

  it('buildGithubReleaseUrl builds expected URL', () => {
    const v = '0.2.0'
    const url = urlUtils.buildGithubReleaseUrl(v)
    expect(url).toContain('/releases/download/v0.2.0/knowledge-base-0.2.0.zip')
  })
})
