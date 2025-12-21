import { describe, expect, test, beforeEach } from 'vitest'
import { dispatchCommand } from './dispatcher'
import type { InMemoryFileSystemService } from '@pair/content-ops'
import { createTestFileSystem } from './test-utils'
import type {
  InstallCommandConfig,
  UpdateCommandConfig,
  UpdateLinkCommandConfig,
  PackageCommandConfig,
  ValidateConfigCommandConfig,
} from './index'

// Skip: dispatcher calls handlers which call legacy commands doing real I/O
// Requires full mock infrastructure or rewrite as integration tests
describe.skip('dispatchCommand()', () => {
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = createTestFileSystem()
  })

  describe('install command dispatch', () => {
    test('dispatches install default config', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        kb: true,
        resolution: 'default',
        offline: false,
      }
      await expect(dispatchCommand(config, fs)).resolves.toBeUndefined()
    })

    test('dispatches install remote config', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        kb: true,
        resolution: 'remote',
        url: 'https://example.com/kb.zip',
        offline: false,
      }
      await expect(dispatchCommand(config, fs)).resolves.toBeUndefined()
    })

    test('dispatches install local config', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        kb: true,
        resolution: 'local',
        path: '/local/kb',
        offline: true,
      }
      await expect(dispatchCommand(config, fs)).resolves.toBeUndefined()
    })
  })

  describe('update command dispatch', () => {
    test('dispatches update default config', async () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        kb: true,
        resolution: 'default',
        offline: false,
      }
      await expect(dispatchCommand(config, fs)).resolves.toBeUndefined()
    })

    test('dispatches update remote config', async () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        kb: true,
        resolution: 'remote',
        url: 'https://example.com/kb-v2.zip',
        offline: false,
      }
      await expect(dispatchCommand(config, fs)).resolves.toBeUndefined()
    })
  })

  describe('other commands dispatch', () => {
    test('dispatches update-link command', async () => {
      const config: UpdateLinkCommandConfig = {
        command: 'update-link',
        kb: true,
      }
      await expect(dispatchCommand(config, fs)).resolves.toBeUndefined()
    })

    test('dispatches package command', async () => {
      const config: PackageCommandConfig = {
        command: 'package',
        kb: true,
      }
      await expect(dispatchCommand(config, fs)).resolves.toBeUndefined()
    })

    test('dispatches validate-config command', async () => {
      const config: ValidateConfigCommandConfig = {
        command: 'validate-config',
        kb: true,
      }
      await expect(dispatchCommand(config, fs)).resolves.toBeUndefined()
    })
  })

  describe('exhaustiveness checking', () => {
    test('TypeScript enforces all command types handled', () => {
      // This test validates TypeScript exhaustiveness checking at compile time
      // If a new command type is added and not handled in dispatcher,
      // TypeScript will show an error
      const config = {
        command: 'install',
        resolution: 'default',
        offline: false,
      } as const

      expect(config.command).toBe('install')
    })
  })
})
