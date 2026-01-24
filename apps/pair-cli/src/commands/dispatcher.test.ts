import { describe, expect, test, beforeEach, vi } from 'vitest'
import { dispatchCommand } from './dispatcher'
import type { InMemoryFileSystemService } from '@pair/content-ops'
import { createTestFileSystem } from '../test-utils'
import type {
  InstallCommandConfig,
  UpdateCommandConfig,
  UpdateLinkCommandConfig,
  PackageCommandConfig,
  ValidateConfigCommandConfig,
  KbValidateCommandConfig,
} from './index'

// Mock handlers
vi.mock('./install/handler', () => ({
  handleInstallCommand: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./update/handler', () => ({
  handleUpdateCommand: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./update-link/handler', () => ({
  handleUpdateLinkCommand: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./package/handler', () => ({
  handlePackageCommand: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./validate-config/handler', () => ({
  handleValidateConfigCommand: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./kb-validate/handler', () => ({
  handleKbValidateCommand: vi.fn().mockResolvedValue(undefined),
}))

describe('dispatchCommand() - unit tests with mocked handlers', () => {
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = createTestFileSystem()
    vi.clearAllMocks()
  })

  describe('install command dispatch', () => {
    test('dispatches install default config', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        kb: true,
        resolution: 'default',
        offline: false,
      }

      await dispatchCommand(config, fs)

      const { handleInstallCommand } = await import('./install/handler')
      expect(handleInstallCommand).toHaveBeenCalledWith(config, fs, {})
      expect(handleInstallCommand).toHaveBeenCalledOnce()
    })

    test('dispatches install remote config', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        kb: true,
        resolution: 'remote',
        url: 'https://example.com/kb.zip',
        offline: false,
      }

      await dispatchCommand(config, fs)

      const { handleInstallCommand } = await import('./install/handler')
      expect(handleInstallCommand).toHaveBeenCalledWith(config, fs, {})
    })

    test('dispatches install local config', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        kb: true,
        resolution: 'local',
        path: '/path/to/kb.zip',
        offline: false,
      }

      await dispatchCommand(config, fs)

      const { handleInstallCommand } = await import('./install/handler')
      expect(handleInstallCommand).toHaveBeenCalledWith(config, fs, {})
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

      await dispatchCommand(config, fs)

      const { handleUpdateCommand } = await import('./update/handler')
      expect(handleUpdateCommand).toHaveBeenCalledWith(config, fs, {})
      expect(handleUpdateCommand).toHaveBeenCalledOnce()
    })

    test('dispatches update remote config', async () => {
      const config: UpdateCommandConfig = {
        command: 'update',
        kb: true,
        resolution: 'remote',
        url: 'https://example.com/kb.zip',
        offline: false,
      }

      await dispatchCommand(config, fs)

      const { handleUpdateCommand } = await import('./update/handler')
      expect(handleUpdateCommand).toHaveBeenCalledWith(config, fs, {})
    })
  })

  describe('update-link command dispatch', () => {
    test('dispatches update-link config', async () => {
      const config: UpdateLinkCommandConfig = {
        command: 'update-link',
        dryRun: false,
        verbose: false,
      }

      await dispatchCommand(config, fs)

      const { handleUpdateLinkCommand } = await import('./update-link/handler')
      expect(handleUpdateLinkCommand).toHaveBeenCalledWith(config, fs)
      expect(handleUpdateLinkCommand).toHaveBeenCalledOnce()
    })

    test('dispatches update-link with options', async () => {
      const config: UpdateLinkCommandConfig = {
        command: 'update-link',
        dryRun: true,
        verbose: true,
      }

      await dispatchCommand(config, fs)

      const { handleUpdateLinkCommand } = await import('./update-link/handler')
      expect(handleUpdateLinkCommand).toHaveBeenCalledWith(config, fs)
    })
  })

  describe('package command dispatch', () => {
    test('dispatches package config', async () => {
      const config: PackageCommandConfig = {
        command: 'package',
        verbose: false,
      }

      await dispatchCommand(config, fs)

      const { handlePackageCommand } = await import('./package/handler')
      expect(handlePackageCommand).toHaveBeenCalledWith(config, fs)
      expect(handlePackageCommand).toHaveBeenCalledOnce()
    })

    test('dispatches package with all options', async () => {
      const config: PackageCommandConfig = {
        command: 'package',
        output: '/output/kb.zip',
        sourceDir: '/source',
        name: 'my-kb',
        version: '1.0.0',
        description: 'Test KB',
        author: 'Test Author',
        verbose: true,
      }

      await dispatchCommand(config, fs)

      const { handlePackageCommand } = await import('./package/handler')
      expect(handlePackageCommand).toHaveBeenCalledWith(config, fs)
    })
  })

  describe('validate-config command dispatch', () => {
    test('dispatches validate-config', async () => {
      const config: ValidateConfigCommandConfig = {
        command: 'validate-config',
      }

      await dispatchCommand(config, fs)

      const { handleValidateConfigCommand } = await import('./validate-config/handler')
      expect(handleValidateConfigCommand).toHaveBeenCalledWith(config, fs)
      expect(handleValidateConfigCommand).toHaveBeenCalledOnce()
    })
  })

  describe('kb-validate command dispatch', () => {
    test('dispatches kb-validate default', async () => {
      const config: KbValidateCommandConfig = {
        command: 'kb-validate',
      }

      await dispatchCommand(config, fs)

      const { handleKbValidateCommand } = await import('./kb-validate/handler')
      expect(handleKbValidateCommand).toHaveBeenCalledWith(config, fs)
      expect(handleKbValidateCommand).toHaveBeenCalledOnce()
    })

    test('dispatches kb-validate with path', async () => {
      const config: KbValidateCommandConfig = {
        command: 'kb-validate',
        path: '/custom/path',
      }

      await dispatchCommand(config, fs)

      const { handleKbValidateCommand } = await import('./kb-validate/handler')
      expect(handleKbValidateCommand).toHaveBeenCalledWith(config, fs)
    })
  })
})
