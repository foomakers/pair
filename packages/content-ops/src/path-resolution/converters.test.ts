import { describe, it, expect } from 'vitest'
import { convertToRelative, convertToAbsolute } from './converters'
import { join } from 'path'

describe('converters', () => {
  it('convertToRelative simple', () => {
    const base = '/dataset/docs'
    const target = '/dataset/docs/page.md'
    expect(convertToRelative(base, target)).toBe('page.md')
  })

  it('convertToRelative different folder', () => {
    const base = '/dataset/docs/sub'
    const target = '/dataset/other/page.md'
    expect(convertToRelative(base, target)).toBe(
      join('..', '..', 'other', 'page.md').replace(/\\/g, '/'),
    )
  })

  it('convertToAbsolute', () => {
    const base = '/dataset/docs'
    const rel = '../page.md'
    expect(convertToAbsolute(base, rel)).toBe(join('/dataset', 'page.md'))
  })
})
