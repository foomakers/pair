import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect } from 'vitest'

describe('policy config controls (already correct)', () => {
  it('c-r0-4a committed config declares a numeric maxMockAssertionRatio', () => {
    const file = join(__dirname, '../../../../docs/testing/test-policy.config.json')
    expect(typeof JSON.parse(readFileSync(file, 'utf8')).maxMockAssertionRatio).toBe('number')
  })
  it('c-r0-4b TESTING_POLICY.md names test-policy.config.json as the single source', () => {
    const doc = join(__dirname, '../../../../docs/testing/TESTING_POLICY.md')
    expect(readFileSync(doc, 'utf8')).toContain('test-policy.config.json')
  })
})
