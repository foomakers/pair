import { describe, it, expect } from 'vitest'
import { flattenPath, prefixPath, transformPath, detectCollisions } from './naming-transforms'

describe('flattenPath', () => {
  it('converts nested path separators to hyphens', () => {
    expect(flattenPath('navigator/next')).toBe('navigator-next')
  })

  it('converts deeply nested paths', () => {
    expect(flattenPath('process/implement/task')).toBe('process-implement-task')
  })

  it('returns single-level path unchanged', () => {
    expect(flattenPath('navigator')).toBe('navigator')
  })

  it('handles trailing slash', () => {
    expect(flattenPath('navigator/next/')).toBe('navigator-next')
  })

  it('handles leading slash', () => {
    expect(flattenPath('/navigator/next')).toBe('navigator-next')
  })

  it('handles empty string', () => {
    expect(flattenPath('')).toBe('')
  })
})

describe('prefixPath', () => {
  it('prepends prefix with hyphen separator to top-level', () => {
    expect(prefixPath('navigator-next', 'pair')).toBe('pair-navigator-next')
  })

  it('prepends prefix to single-level path', () => {
    expect(prefixPath('navigator', 'pair')).toBe('pair-navigator')
  })

  it('prepends prefix to nested path (top-level only)', () => {
    expect(prefixPath('navigator/next', 'pair')).toBe('pair-navigator/next')
  })

  it('returns path unchanged when prefix is empty', () => {
    expect(prefixPath('navigator', '')).toBe('navigator')
  })
})

describe('transformPath', () => {
  it('returns path unchanged with no flatten and no prefix', () => {
    expect(transformPath('navigator/next', {})).toBe('navigator/next')
  })

  it('applies flatten only', () => {
    expect(transformPath('navigator/next', { flatten: true })).toBe('navigator-next')
  })

  it('applies prefix only (top-level)', () => {
    expect(transformPath('navigator/next', { prefix: 'pair' })).toBe('pair-navigator/next')
  })

  it('applies both flatten and prefix', () => {
    expect(transformPath('navigator/next', { flatten: true, prefix: 'pair' })).toBe(
      'pair-navigator-next',
    )
  })

  it('handles deeply nested with both', () => {
    expect(transformPath('process/implement/task', { flatten: true, prefix: 'pair' })).toBe(
      'pair-process-implement-task',
    )
  })

  it('handles single level with both', () => {
    expect(transformPath('navigator', { flatten: true, prefix: 'pair' })).toBe('pair-navigator')
  })

  it('does not apply prefix when prefix is undefined', () => {
    expect(transformPath('navigator/next', { flatten: true })).toBe('navigator-next')
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
