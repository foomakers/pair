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

describe('handleValidateConfigCommand - reserved path overlap (D14)', () => {
  const cwd = '/test-project'

  // Base config.json at rootModuleDirectory is always loaded by loadConfigWithOverrides,
  // even when a custom --config path is supplied for the actual validation target.
  const baseConfigFiles = {
    [`${cwd}/config.json`]: JSON.stringify({
      asset_registries: {
        github: {
          source: '.github',
          behavior: 'mirror',
          description: 'GitHub registry',
          targets: [{ path: '.github', mode: 'canonical' }],
        },
      },
    }),
  }

  test('flags a registry that accidentally targets the working path', async () => {
    const fs = new InMemoryFileSystemService(baseConfigFiles, cwd, cwd)
    const customConfig = {
      asset_registries: {
        working: {
          source: '.pair/working',
          behavior: 'mirror',
          description: 'Accidentally covers the working area',
          targets: [{ path: '.pair/working', mode: 'canonical' }],
        },
      },
    }
    await fs.writeFile(`${cwd}/custom-config.json`, JSON.stringify(customConfig))

    const config: ValidateConfigCommandConfig = {
      command: 'validate-config',
      config: `${cwd}/custom-config.json`,
    }

    await expect(handleValidateConfigCommand(config, fs)).rejects.toThrow(/reserved path/)
  })

  test('flags an overridden working_path that lands inside a registry-managed directory', async () => {
    const fs = new InMemoryFileSystemService(baseConfigFiles, cwd, cwd)
    const customConfig = {
      working_path: '.pair/knowledge/working',
      asset_registries: {
        knowledge: {
          source: '.pair/knowledge',
          behavior: 'mirror',
          description: 'Knowledge base',
          targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
        },
      },
    }
    await fs.writeFile(`${cwd}/custom-config.json`, JSON.stringify(customConfig))

    const config: ValidateConfigCommandConfig = {
      command: 'validate-config',
      config: `${cwd}/custom-config.json`,
    }

    await expect(handleValidateConfigCommand(config, fs)).rejects.toThrow(/reserved path/)
  })

  test('rejects a non-project-relative (absolute) working_path', async () => {
    const fs = new InMemoryFileSystemService(baseConfigFiles, cwd, cwd)
    const customConfig = {
      working_path: '/var/tmp/working',
      asset_registries: {
        knowledge: {
          source: '.pair/knowledge',
          behavior: 'mirror',
          description: 'Knowledge base',
          targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
        },
      },
    }
    await fs.writeFile(`${cwd}/custom-config.json`, JSON.stringify(customConfig))

    const config: ValidateConfigCommandConfig = {
      command: 'validate-config',
      config: `${cwd}/custom-config.json`,
    }

    await expect(handleValidateConfigCommand(config, fs)).rejects.toThrow(/project-relative/)
  })

  test('passes when the working override sits outside every registry', async () => {
    const fs = new InMemoryFileSystemService(baseConfigFiles, cwd, cwd)
    const customConfig = {
      working_path: '.pair/scratch',
      asset_registries: {
        knowledge: {
          source: '.pair/knowledge',
          behavior: 'mirror',
          description: 'Knowledge base',
          targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
        },
      },
    }
    await fs.writeFile(`${cwd}/custom-config.json`, JSON.stringify(customConfig))

    const config: ValidateConfigCommandConfig = {
      command: 'validate-config',
      config: `${cwd}/custom-config.json`,
    }

    await expect(handleValidateConfigCommand(config, fs)).resolves.not.toThrow()
  })
})
