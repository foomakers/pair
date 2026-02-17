import { describe, it, expect } from 'vitest'
import { validateDistributionPolicy, parseComplianceTags, validateOrgName } from './org-validators'

describe('validateDistributionPolicy', () => {
  it('accepts "open"', () => {
    expect(validateDistributionPolicy('open')).toBe('open')
  })

  it('accepts "private"', () => {
    expect(validateDistributionPolicy('private')).toBe('private')
  })

  it('accepts "restricted"', () => {
    expect(validateDistributionPolicy('restricted')).toBe('restricted')
  })

  it('rejects invalid value', () => {
    expect(() => validateDistributionPolicy('invalid-value')).toThrow(
      "Invalid distribution policy 'invalid-value'. Valid values: open, private, restricted",
    )
  })

  it('rejects empty string', () => {
    expect(() => validateDistributionPolicy('')).toThrow('Invalid distribution policy')
  })
})

describe('parseComplianceTags', () => {
  it('parses comma-separated tags', () => {
    expect(parseComplianceTags('SOC2,ISO27001,HIPAA')).toEqual(['SOC2', 'ISO27001', 'HIPAA'])
  })

  it('trims whitespace from tags', () => {
    expect(parseComplianceTags(' SOC2 , ISO27001 ')).toEqual(['SOC2', 'ISO27001'])
  })

  it('filters empty tags after splitting', () => {
    expect(parseComplianceTags('SOC2,,ISO27001,')).toEqual(['SOC2', 'ISO27001'])
  })

  it('returns empty array for empty input', () => {
    expect(parseComplianceTags('')).toEqual([])
  })

  it('returns empty array for whitespace-only input', () => {
    expect(parseComplianceTags('   ')).toEqual([])
  })

  it('returns empty array when all tags are whitespace', () => {
    expect(parseComplianceTags(' , , ')).toEqual([])
  })

  it('handles single tag', () => {
    expect(parseComplianceTags('SOC2')).toEqual(['SOC2'])
  })
})

describe('validateOrgName', () => {
  it('accepts non-empty name', () => {
    expect(() => validateOrgName('Acme Corp')).not.toThrow()
  })

  it('rejects empty string', () => {
    expect(() => validateOrgName('')).toThrow('Organization name cannot be empty')
  })

  it('rejects whitespace-only string', () => {
    expect(() => validateOrgName('   ')).toThrow('Organization name cannot be empty')
  })

  it('rejects undefined', () => {
    expect(() => validateOrgName(undefined)).toThrow('Organization name cannot be empty')
  })
})
