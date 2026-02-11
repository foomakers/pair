import { describe, it, expect } from 'vitest'
import { flattenPath, prefixPath, transformPath, detectCollisions } from './naming-transforms'

describe('flattenPath', () => {
  it('converts nested path separators to hyphens', () => {
    expect(flattenPath('catalog/next')).toBe('catalog-next')
  })

  it('converts deeply nested paths', () => {
    expect(flattenPath('process/implement/task')).toBe('process-implement-task')
  })

  it('returns single-level path unchanged', () => {
    expect(flattenPath('catalog')).toBe('catalog')
  })

  it('handles trailing slash', () => {
    expect(flattenPath('catalog/next/')).toBe('catalog-next')
  })

  it('handles leading slash', () => {
    expect(flattenPath('/catalog/next')).toBe('catalog-next')
  })

  it('handles empty string', () => {
    expect(flattenPath('')).toBe('')
  })
})

describe('prefixPath', () => {
  it('prepends prefix with hyphen separator to top-level', () => {
    expect(prefixPath('catalog-next', 'pair')).toBe('pair-catalog-next')
  })

  it('prepends prefix to single-level path', () => {
    expect(prefixPath('catalog', 'pair')).toBe('pair-catalog')
  })

  it('prepends prefix to nested path (top-level only)', () => {
    expect(prefixPath('catalog/next', 'pair')).toBe('pair-catalog/next')
  })

  it('returns path unchanged when prefix is empty', () => {
    expect(prefixPath('catalog', '')).toBe('catalog')
  })

  it('returns empty string unchanged when dirName is empty', () => {
    expect(prefixPath('', 'pair')).toBe('')
  })
})

describe('transformPath', () => {
  it('returns path unchanged with no flatten and no prefix', () => {
    expect(transformPath('catalog/next', {})).toBe('catalog/next')
  })

  it('applies flatten only', () => {
    expect(transformPath('catalog/next', { flatten: true })).toBe('catalog-next')
  })

  it('applies prefix only (top-level)', () => {
    expect(transformPath('catalog/next', { prefix: 'pair' })).toBe('pair-catalog/next')
  })

  it('applies both flatten and prefix', () => {
    expect(transformPath('catalog/next', { flatten: true, prefix: 'pair' })).toBe(
      'pair-catalog-next',
    )
  })

  it('handles deeply nested with both', () => {
    expect(transformPath('process/implement/task', { flatten: true, prefix: 'pair' })).toBe(
      'pair-process-implement-task',
    )
  })

  it('handles single level with both', () => {
    expect(transformPath('catalog', { flatten: true, prefix: 'pair' })).toBe('pair-catalog')
  })

  it('does not apply prefix when prefix is undefined', () => {
    expect(transformPath('catalog/next', { flatten: true })).toBe('catalog-next')
  })
})

describe('detectCollisions', () => {
  it('returns empty array when no collisions', () => {
    expect(detectCollisions(['a-b', 'c-d', 'e-f'])).toEqual([])
  })

  it('detects duplicate paths after transformation', () => {
    const collisions = detectCollisions(['a-b', 'c-d', 'a-b'])
    expect(collisions).toContain('a-b')
  })

  it('returns empty for empty input', () => {
    expect(detectCollisions([])).toEqual([])
  })

  it('returns empty for single entry', () => {
    expect(detectCollisions(['a-b'])).toEqual([])
  })
})
