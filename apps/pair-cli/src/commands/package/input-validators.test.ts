import { describe, it, expect } from 'vitest'
import {
  validatePackageName,
  validateVersion,
  validateRequired,
  parseTagsInput,
} from './input-validators'

describe('validatePackageName', () => {
  it('accepts valid lowercase names', () => {
    expect(validatePackageName('my-kb')).toBe(true)
    expect(validatePackageName('kb123')).toBe(true)
    expect(validatePackageName('good.name_v2')).toBe(true)
    expect(validatePackageName('a')).toBe(true)
  })

  it('rejects empty input', () => {
    expect(validatePackageName('')).toBe('Package name is required')
    expect(validatePackageName('   ')).toBe('Package name is required')
  })

  it('rejects names with uppercase', () => {
    expect(validatePackageName('My-KB')).toBeTypeOf('string')
  })

  it('rejects names with spaces', () => {
    expect(validatePackageName('my kb')).toBeTypeOf('string')
  })

  it('rejects names starting with hyphen', () => {
    expect(validatePackageName('-bad')).toBeTypeOf('string')
  })

  it('rejects names starting with dot', () => {
    expect(validatePackageName('.bad')).toBeTypeOf('string')
  })

  it('rejects names with special characters', () => {
    expect(validatePackageName('bad@name')).toBeTypeOf('string')
    expect(validatePackageName('bad!name')).toBeTypeOf('string')
  })
})

describe('validateVersion', () => {
  it('accepts valid semver', () => {
    expect(validateVersion('1.0.0')).toBe(true)
    expect(validateVersion('0.1.0')).toBe(true)
    expect(validateVersion('10.20.30')).toBe(true)
  })

  it('accepts pre-release versions', () => {
    expect(validateVersion('0.1.0-beta.1')).toBe(true)
    expect(validateVersion('1.0.0-alpha')).toBe(true)
  })

  it('accepts build metadata', () => {
    expect(validateVersion('1.0.0+build.123')).toBe(true)
  })

  it('rejects empty input', () => {
    expect(validateVersion('')).toBe('Version is required')
  })

  it('rejects non-semver strings', () => {
    expect(validateVersion('not-semver')).toBeTypeOf('string')
    expect(validateVersion('v1.0.0')).toBeTypeOf('string')
    expect(validateVersion('1.0')).toBeTypeOf('string')
    expect(validateVersion('1')).toBeTypeOf('string')
  })
})

describe('validateRequired', () => {
  const validate = validateRequired('Field')

  it('accepts non-empty input', () => {
    expect(validate('value')).toBe(true)
    expect(validate('  value  ')).toBe(true)
  })

  it('rejects empty input', () => {
    expect(validate('')).toBe('Field is required')
    expect(validate('   ')).toBe('Field is required')
  })
})

describe('parseTagsInput', () => {
  it('parses comma-separated tags', () => {
    expect(parseTagsInput('a, b, c')).toEqual(['a', 'b', 'c'])
  })

  it('trims whitespace', () => {
    expect(parseTagsInput('  ai , devops , testing  ')).toEqual(['ai', 'devops', 'testing'])
  })

  it('filters empty entries', () => {
    expect(parseTagsInput('ai,,testing,')).toEqual(['ai', 'testing'])
  })

  it('returns empty array for empty input', () => {
    expect(parseTagsInput('')).toEqual([])
    expect(parseTagsInput('   ')).toEqual([])
  })

  it('handles single tag', () => {
    expect(parseTagsInput('ai')).toEqual(['ai'])
  })
})
