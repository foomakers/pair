import { describe, it, expect } from 'vitest'
import { isExternalLink, normalizeLinkSlashes, stripAnchor } from './file-system-utils'

describe('isExternalLink - external', () => {
  it('should detect HTTP URLs and variants', () => {
    expect(isExternalLink('http://example.com')).toBe(true)
    expect(isExternalLink('https://example.com')).toBe(true)
    expect(isExternalLink('HTTP://EXAMPLE.COM')).toBe(true)
    expect(isExternalLink('HTTPS://EXAMPLE.COM')).toBe(true)
  })

  it('should detect mailto links', () => {
    expect(isExternalLink('mailto:me@example.com')).toBe(true)
    expect(isExternalLink('MAILTO:ME@EXAMPLE.COM')).toBe(true)
  })

  it('should detect anchor links', () => {
    expect(isExternalLink('#section')).toBe(true)
    expect(isExternalLink('#anchor.with.dots')).toBe(true)
    expect(isExternalLink('#top')).toBe(true)
  })

  it('should handle whitespace', () => {
    expect(isExternalLink('  http://example.com  ')).toBe(true)
    expect(isExternalLink(' https://example.com ')).toBe(true)
    expect(isExternalLink(' #section ')).toBe(true)
  })
})

describe('isExternalLink - internal and edge cases', () => {
  it('should not detect relative paths', () => {
    expect(isExternalLink('./local.md')).toBe(false)
    expect(isExternalLink('../parent.md')).toBe(false)
    expect(isExternalLink('folder/file.md')).toBe(false)
  })

  it('should not detect absolute paths', () => {
    expect(isExternalLink('/absolute/path.md')).toBe(false)
    expect(isExternalLink('C:\\windows\\path.md')).toBe(false)
  })

  it('should not detect other protocols', () => {
    expect(isExternalLink('ftp://example.com')).toBe(false)
    expect(isExternalLink('file:///path/to/file')).toBe(false)
    expect(isExternalLink('ssh://git@github.com')).toBe(false)
  })

  it('should handle undefined and empty strings', () => {
    expect(isExternalLink(undefined)).toBe(false)
    expect(isExternalLink('')).toBe(false)
    expect(isExternalLink(null!)).toBe(false)
  })

  it('should handle malformed URLs', () => {
    expect(isExternalLink('http:/example.com')).toBe(true) // Starts with http:
    expect(isExternalLink('https//example.com')).toBe(false) // Doesn't start with https:
    expect(isExternalLink('mailto@')).toBe(false) // Doesn't start with mailto:
  })
})

describe('normalizeLinkSlashes', () => {
  it('should convert backslashes to forward slashes', () => {
    expect(normalizeLinkSlashes('some\\path\\file.md')).toBe('some/path/file.md')
    expect(normalizeLinkSlashes('C:\\windows\\style\\path')).toBe('C:/windows/style/path')
    expect(normalizeLinkSlashes('\\root\\level\\file')).toBe('/root/level/file')
  })

  it('should leave forward slashes unchanged', () => {
    expect(normalizeLinkSlashes('some/path/file.md')).toBe('some/path/file.md')
    expect(normalizeLinkSlashes('/unix/style/path')).toBe('/unix/style/path')
  })

  it('should handle mixed slashes', () => {
    expect(normalizeLinkSlashes('some\\path/file\\other.md')).toBe('some/path/file/other.md')
  })

  it('should handle empty strings', () => {
    expect(normalizeLinkSlashes('')).toBe('')
  })
})

describe('stripAnchor', () => {
  describe('Links with anchors', () => {
    it('should remove anchor from simple filenames', () => {
      expect(stripAnchor('page.md#section')).toBe('page.md')
      expect(stripAnchor('readme.md#top')).toBe('readme.md')
    })

    it('should remove anchor from paths', () => {
      expect(stripAnchor('path/to/file.md#anchor')).toBe('path/to/file.md')
      expect(stripAnchor('./docs/page.md#section')).toBe('./docs/page.md')
      expect(stripAnchor('../parent/file.md#subsection')).toBe('../parent/file.md')
    })

    it('should handle complex anchor names', () => {
      expect(stripAnchor('file.md#section.with.dots')).toBe('file.md')
      expect(stripAnchor('file.md#section-with-dashes')).toBe('file.md')
      expect(stripAnchor('file.md#section_with_underscores')).toBe('file.md')
    })
  })

  describe('Links without anchors', () => {
    it('should return unchanged', () => {
      expect(stripAnchor('page.md')).toBe('page.md')
      expect(stripAnchor('path/to/file.md')).toBe('path/to/file.md')
      expect(stripAnchor('./relative/path.md')).toBe('./relative/path.md')
    })
  })

  describe('Edge cases', () => {
    it('should handle undefined and empty strings', () => {
      expect(stripAnchor(undefined)).toBe('')
      expect(stripAnchor('')).toBe('')
      expect(stripAnchor(null!)).toBe('')
    })

    it('should handle anchor-only strings', () => {
      expect(stripAnchor('#onlyanchor')).toBe('')
      expect(stripAnchor('#')).toBe('')
    })

    it('should handle multiple hash symbols', () => {
      expect(stripAnchor('file.md#section#another')).toBe('file.md')
    })
  })
})
