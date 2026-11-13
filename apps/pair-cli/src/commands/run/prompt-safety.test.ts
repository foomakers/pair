import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { isSafePromptText, MAX_PROMPT_VALUE_LENGTH } from './prompt-safety'

describe('isSafePromptText', () => {
  it.each([['exactly the length bound', 'a'.repeat(MAX_PROMPT_VALUE_LENGTH)]])(
    'accepts %s',
    (_case, value) => {
      expect(isSafePromptText(value)).toBe(true)
    },
  )

  it.each([['empty', '']])('rejects %s', (_case, value) => {
    expect(isSafePromptText(value)).toBe(false)
  })
})

/**
 * These rules exist to be byte-consistent with tier 1 (`.claude/workflows/pair-loop.js`), which is
 * where they were introduced. Asserting against its SOURCE keeps the claim honest: if tier 1's
 * predicate changes, this fails here rather than at the sixth review round.
 */
describe('byte-consistency with tier 1', () => {
  const WORKFLOW = join(__dirname, '..', '..', '..', '..', '..', '.claude/workflows/pair-loop.js')

  it('declares the same length bound tier 1 declares', () => {
    const source = readFileSync(WORKFLOW, 'utf-8')

    expect(source).toContain(`v.length <= ${MAX_PROMPT_VALUE_LENGTH}`)
  })
})
