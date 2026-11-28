import { describe, it, expect } from 'vitest'
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
