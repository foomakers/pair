import { describe, it, expect } from 'vitest'
import { handleUpdateLinkCommand } from './handler'

describe('handleUpdateLinkCommand', () => {
  it('should handle update-link command', async () => {
    await expect(handleUpdateLinkCommand()).resolves.toBeUndefined()
  })

  it('should execute update-link logic', async () => {
    await expect(handleUpdateLinkCommand()).resolves.toBeUndefined()
  })
})
