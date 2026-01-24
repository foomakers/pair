import { describe, expect, beforeEach, test } from 'vitest'
import { handleInstallCommand } from './handler'
import type { InstallCommandConfig } from './parser'
import { createTestFs } from '../../test-utils'

describe('handleInstallCommand - real services integration', () => {
  const cwd = '/test-project'

  const testConfig = {
    asset_registries: {
      github: {
        source: 'github',
        behavior: 'mirror',
        target_path: '.github',
        description: 'GitHub registry',
      },
    },
  }

  const extraFiles = {
    [`${cwd}/package.json`]: JSON.stringify({ name: 'test-pkg', version: '0.1.0' }),
    [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({ name: '@pair/knowledge-hub' }),
    [`${cwd}/packages/knowledge-hub/dataset/github/workflow.yml`]: 'content: val',
    [`${cwd}/packages/knowledge-hub/dataset/github/README.md`]: '# GitHub Registry',
  }

  let fs: ReturnType<typeof createTestFs>

  beforeEach(() => {
    fs = createTestFs(testConfig, extraFiles, cwd)
  })

  describe('default resolution', () => {
    test('installs from default dataset root found via package.json', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      await handleInstallCommand(config, fs)

      // Verify files were actually copied to the target
      expect(await fs.exists(`${cwd}/.github/workflow.yml`)).toBe(true)
      expect(await fs.exists(`${cwd}/.github/README.md`)).toBe(true)
      expect(await fs.readFile(`${cwd}/.github/workflow.yml`)).toBe('content: val')
    })
  })

  describe('local resolution', () => {
    test('handles local path source to a directory', async () => {
      const externalKbPath = '/external/kb'
      await fs.mkdir(externalKbPath, { recursive: true })
      await fs.mkdir(`${externalKbPath}/my-reg`, { recursive: true })
      await fs.writeFile(`${externalKbPath}/my-reg/file.txt`, 'local content')

      const localConfig = {
        asset_registries: {
          'my-reg': {
            behavior: 'mirror',
            target_path: 'dest',
            description: 'Local reg',
          },
        },
      }

      // Update config in FS
      await fs.writeFile(`${cwd}/config.json`, JSON.stringify(localConfig))

      const command: InstallCommandConfig = {
        command: 'install',
        resolution: 'local',
        path: externalKbPath,
        offline: true,
        kb: true,
      }

      await handleInstallCommand(command, fs)

      expect(await fs.exists(`${cwd}/dest/file.txt`)).toBe(true)
      expect(await fs.readFile(`${cwd}/dest/file.txt`)).toBe('local content')
    })
  })

  describe('error handling', () => {
    test('throws when registries are empty', async () => {
      const emptyConfig = { asset_registries: {} }
      await fs.writeFile(`${cwd}/config.json`, JSON.stringify(emptyConfig))

      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      await expect(handleInstallCommand(config, fs)).rejects.toThrow(/asset_registries/)
    })
  })
})
