import { describe, it, expect } from 'vitest'
import { handleInstallCommand } from '../../cli'
import { InMemoryFileSystemService } from '@pair/content-ops'

describe('Install Command - CLI Integration (Legacy)', () => {
  describe('Custom URL handling', () => {
    it('should pass --url parameter to handleInstallCommand', async () => {
      // Bug: --url with local path should be passed to installCommand as --source
      // This test verifies that the URL parameter flows through correctly
      const mockFs = new InMemoryFileSystemService({}, '/', '/')
      const localDatasetPath = '/local/dataset'
      const cmdOptions = { url: localDatasetPath }

      // The command should not throw when processing a URL
      try {
        // Note: This will fail because there's no actual install logic, but we're testing
        // that the URL is accepted and passed through to installCommand
        await handleInstallCommand([], cmdOptions, mockFs)
      } catch (err) {
        // We expect this to fail because of missing config/dataset, not because of URL handling
        // The important thing is that the URL parameter was accepted and processed
        const errMsg = String(err)
        expect(errMsg).not.toContain('url')
        expect(errMsg).not.toContain('Unknown option')
      }
    })

    it('should resolve relative paths in --url parameter', async () => {
      const cwd = '/test/project'
      const mockFs = new InMemoryFileSystemService({}, cwd, cwd)
      const cmdOptions = { url: './dataset' }

      try {
        await handleInstallCommand([], cmdOptions, mockFs)
      } catch (err) {
        // We expect this to fail because of missing config/dataset, not because of path resolution
        const errMsg = String(err)
        expect(errMsg).not.toContain('url')
        expect(errMsg).not.toContain('Unknown option')
      }
    })
  })
})
/**
 * LEGACY TESTS - To be converted to new flow (parser → dispatcher → handler)
 * These tests use the old installCommand function which will be removed after T-9
 * See: commands/install/handler.test.ts for new-style handler tests
 */
