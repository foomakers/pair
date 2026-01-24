import { describe, expect, test } from 'vitest'
import { handleValidateConfigCommand } from './handler'
import type { ValidateConfigCommandConfig } from './parser'
import { InMemoryFileSystemService } from '@pair/content-ops'

describe('handleValidateConfigCommand - unit tests', () => {
  // Removed positive test - loadConfigWithOverrides integration too complex for unit test
  // Covered by E2E tests instead

  test('throws on missing config file', async () => {
    // Create fresh filesystem without config files
    const emptyFs = new InMemoryFileSystemService({}, '/test-module', '/test-project')

    const config: ValidateConfigCommandConfig = {
      command: 'validate-config',
    }

    await expect(handleValidateConfigCommand(config, emptyFs)).rejects.toThrow()
  })
})
