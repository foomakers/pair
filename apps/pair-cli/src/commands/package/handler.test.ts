import { describe, it, expect } from 'vitest'
import { handlePackageCommand } from './handler'

describe('handlePackageCommand', () => {
  it('should handle package command', async () => {
    await expect(handlePackageCommand()).resolves.toBeUndefined()
  })

  it('should execute package logic', async () => {
    await expect(handlePackageCommand()).resolves.toBeUndefined()
  })
})
