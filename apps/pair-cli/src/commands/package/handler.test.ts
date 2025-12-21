import { describe, it, expect, beforeEach } from 'vitest'
import { handlePackageCommand } from './handler'
import { createTestFileSystem } from '../test-utils'
import type { InMemoryFileSystemService } from '@pair/content-ops'

// Skip: handler calls legacy executePackage which does real I/O
// Requires full mock infrastructure or rewrite as integration tests  
describe.skip('handlePackageCommand', () => {
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = createTestFileSystem()
  })

  it('should handle package command', async () => {
    await expect(handlePackageCommand(undefined, fs)).resolves.toBeUndefined()
  })

  it('should execute package logic', async () => {
    await expect(handlePackageCommand(undefined, fs)).resolves.toBeUndefined()
  })
})
