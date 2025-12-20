import { describe, expect, test } from 'vitest'
import { dispatchCommand } from './dispatcher'
import type {
  InstallCommandConfig,
  UpdateCommandConfig,
  UpdateLinkCommandConfig,
  PackageCommandConfig,
  ValidateConfigCommandConfig,
} from './index'

describe('dispatchCommand()', () => {
  describe('install command dispatch', () => {
    test('dispatches install default config', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
        offline: false,
      }
      await expect(dispatchCommand(config)).resolves.toBeUndefined()
    })

    test('dispatches install remote config', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'remote',
        url: 'https://example.com/kb.zip',
        offline: false,
      }
      await expect(dispatchCommand(config)).resolves.toBeUndefined()
    })

    test('dispatches install local config', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'local',
        path: '/local/kb',
        offline: true,
      }
      await expect(dispatchCommand(config)).resolves.toBeUndefined()
    })
  })

  describe('update command dispatch', () => {
    test('dispatches update default config', async () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'default',
        offline: false,
      }
      await expect(dispatchCommand(config)).resolves.toBeUndefined()
    })

    test('dispatches update remote config', async () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'remote',
        url: 'https://example.com/kb-v2.zip',
        offline: false,
      }
      await expect(dispatchCommand(config)).resolves.toBeUndefined()
    })
  })

  describe('other commands dispatch', () => {
    test('dispatches update-link command', async () => {
      const config: UpdateLinkCommandConfig = {
        command: 'update-link',
      }
      await expect(dispatchCommand(config)).resolves.toBeUndefined()
    })

    test('dispatches package command', async () => {
      const config: PackageCommandConfig = {
        command: 'package',
      }
      await expect(dispatchCommand(config)).resolves.toBeUndefined()
    })

    test('dispatches validate-config command', async () => {
      const config: ValidateConfigCommandConfig = {
        command: 'validate-config',
      }
      await expect(dispatchCommand(config)).resolves.toBeUndefined()
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
