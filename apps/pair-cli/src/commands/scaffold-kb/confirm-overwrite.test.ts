import { describe, it, expect } from 'vitest'
import { createConfirmOverwrite } from './confirm-overwrite'

describe('createConfirmOverwrite', () => {
  it('refuses without asking when there is no terminal — never silently overwrite', async () => {
    const confirm = createConfirmOverwrite({ isTty: false })

    await expect(confirm('pair.config.json')).resolves.toBe(false)
  })

  it('returns a prompting function when a terminal is available', () => {
    expect(typeof createConfirmOverwrite({ isTty: true })).toBe('function')
  })
})
