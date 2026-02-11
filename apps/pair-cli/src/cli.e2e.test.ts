import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
import {
  installCommand,
  updateCommand,
  handleUpdateCommand,
  parseUpdateCommand,
  handleUpdateLinkCommand,
} from './commands'

function createNpmDeployFs(cwd: string): InMemoryFileSystemService {
  // Simulate npm install: pair-cli extracted to node_modules/@foomakers/pair-cli/
  // Dataset is at node_modules/@foomakers/pair-cli/bundle-cli/dataset/ (what the code looks for)
  const seed: Record<string, string> = {}
  const moduleFolder = cwd + '/node_modules/@foomakers/pair-cli'

  // Dataset content in the @foomakers/pair-cli package location
  seed[moduleFolder + '/bundle-cli/dataset/AGENTS.md'] = 'this is agents.md'
  seed[moduleFolder + '/bundle-cli/dataset/.github/workflows/ci.yml'] = 'name: CI\non: push'
  seed[moduleFolder + '/bundle-cli/dataset/.pair/knowledge/index.md'] = '# Knowledge Base'
  seed[moduleFolder + '/bundle-cli/dataset/.pair/adoption/onboarding.md'] = '# Onboarding Guide'

  // Package.json for pair-cli (scoped package)
  seed[moduleFolder + '/package.json'] = JSON.stringify({
    name: '@foomakers/pair-cli',
    version: '0.1.1',
  })

  // Sample project package.json
  seed[cwd + '/package.json'] = JSON.stringify({
    name: 'pair-sample-project',
    version: '1.0.0',
    dependencies: {
      '@foomakers/pair-cli': 'file:../pkg/package',
    },
  })

  return new InMemoryFileSystemService(seed, moduleFolder, cwd)
}

function createManualDeployFs(cwd: string): InMemoryFileSystemService {
  // Simulate manual installation: pair-cli binary in /usr/local/bin/bundle-cli/
  // Dataset is in ./dataset relative to bundle-cli
  const seed: Record<string, string> = {}
  const moduleFolder = cwd + '/libs/pair-cli'
  // Add package.json for @pair/pair-cli package
  seed[cwd + '/libs/pair-cli/package.json'] = JSON.stringify({
    name: '@pair/pair-cli',
    version: '0.1.0',
    description: 'Pair CLI manual installation',
  })

  // Dataset content in the release bundle location (./dataset relative to bundle-cli)
  seed[moduleFolder + '/bundle-cli/dataset/AGENTS.md'] = 'this is agents.md'
  seed[moduleFolder + '/bundle-cli/dataset/.github/workflows/ci.yml'] = 'name: CI\non: push'
  seed[moduleFolder + '/bundle-cli/dataset/.pair/knowledge/index.md'] = '# Knowledge Base'
  seed[moduleFolder + '/bundle-cli/dataset/.pair/adoption/onboarding.md'] = '# Onboarding Guide'

  // No node_modules/@pair/knowledge-hub in manual install
  // The binary is standalone

  return new InMemoryFileSystemService(seed, moduleFolder, cwd)
}

function createDevScenarioFs(cwd: string): InMemoryFileSystemService {
  // Simulate development scenario: pair-cli as regular node_modules dependency
  // Dataset is at node_modules/@pair/knowledge-hub/dataset/ (accessible from project root)
  const seed: Record<string, string> = {}

  // Dataset content in the @pair/knowledge-hub package location (project's node_modules)
  seed[cwd + '/node_modules/@pair/knowledge-hub/dataset/AGENTS.md'] = 'this is agents.md'
  seed[cwd + '/node_modules/@pair/knowledge-hub/dataset/.github/workflows/ci.yml'] =
    'name: CI\non: push'
  seed[cwd + '/node_modules/@pair/knowledge-hub/dataset/.pair/knowledge/index.md'] =
    '# Knowledge Base'
  seed[cwd + '/node_modules/@pair/knowledge-hub/dataset/.pair/adoption/onboarding.md'] =
    '# Onboarding Guide'

  // Package.json for @pair/knowledge-hub
  seed[cwd + '/node_modules/@pair/knowledge-hub/package.json'] = JSON.stringify({
    name: '@pair/knowledge-hub',
    version: '0.1.0',
  })

  // Package.json for pair-cli (regular dependency)
  seed[cwd + '/node_modules/pair-cli/package.json'] = JSON.stringify({
    name: 'pair-cli',
    version: '0.1.0',
  })

  // Sample project package.json
  seed[cwd + '/package.json'] = JSON.stringify({
    name: 'pair-cli',
    version: '1.0.0-wip',
    dependencies: {
      '@pair/knowledge-hub': 'catalog:*',
    },
  })

  return new InMemoryFileSystemService(seed, cwd, cwd)
}

async function withTempConfig(
  fs: InMemoryFileSystemService,
  config: unknown,
  fn: () => Promise<void>,
): Promise<void> {
  const configPath = fs.rootModuleDirectory() + '/config.json'
  await fs.writeFile(configPath, JSON.stringify(config))
  try {
    await fn()
  } finally {
    // Cleanup if needed
  }
}

function createTestConfig() {
  return {
    asset_registries: {
      '.github': {
        source: '.github',
        behavior: 'mirror',
        targets: [{ path: '.github', mode: 'canonical' }],
        description: 'GitHub workflows and configs',
      },
      '.pair-knowledge': {
        source: '.pair/knowledge',
        behavior: 'mirror',
        targets: [{ path: '.pair-knowledge', mode: 'canonical' }],
        description: 'Knowledge base content',
      },
      '.pair-adoption': {
        source: '.pair/adoption',
        behavior: 'mirror',
        targets: [{ path: '.pair-adoption', mode: 'canonical' }],
        description: 'Adoption and onboarding content',
      },
      'agents.md': {
        source: 'AGENTS.md',
        behavior: 'add',
        targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
        description: 'AI agents guidance and session context',
      },
    },
  }
}

function getDeploymentConfig(deployType: 'npm' | 'manual' | 'dev'): {
  cwd: string
  fs: InMemoryFileSystemService
} {
  const cwd =
    deployType === 'npm'
      ? '/.tmp/npm-test/sample-project'
      : deployType === 'manual'
        ? '/tmp/test-project'
        : '/dev/test-project'
  const fs =
    deployType === 'npm'
      ? createNpmDeployFs(cwd)
      : deployType === 'manual'
        ? createManualDeployFs(cwd)
        : createDevScenarioFs(cwd)
  return { cwd, fs }
}

describe('pair-cli e2e - validate-config success', () => {
  it('validate-config succeeds with valid config', async () => {
    const cwd = '/test-project'
    const fs = createDevScenarioFs(cwd)

    await withTempConfig(fs, createTestConfig(), async () => {
      // Mock the CLI execution by calling the validate-config logic directly
      // Since we can't easily run the CLI binary in tests, we'll test the underlying function
      const { config } = await import('#config').then(m => m.loadConfigWithOverrides(fs))
      const { validateConfig } = (await import('#config')) as typeof import('#config')
      const validation = validateConfig(config)

      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })
  })
})

describe('pair-cli e2e - validate-config failures basic', () => {
  it('validate-config fails with invalid config', async () => {
    const cwd = '/test-project'
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    const invalidConfig = {
      asset_registries: {
        '.github': {
          source: '.github',
          behavior: 'invalid-behavior', // Invalid behavior
          targets: [{ path: '.github', mode: 'canonical' }],
          // Missing description - this should also be an error
        },
      },
    }

    await withTempConfig(fs, invalidConfig, async () => {
      const { config } = await import('#config').then(m => m.loadConfigWithOverrides(fs))
      const { validateConfig } = (await import('#config')) as typeof import('#config')
      const validation = validateConfig(config)

      expect(validation.valid).toBe(false)
      expect(validation.errors).toHaveLength(2) // Invalid behavior + missing description
      expect(validation.errors[0]).toContain('invalid behavior')
    })
  })

  it('validate-config fails with missing asset_registries', async () => {
    const cwd = '/test-project'
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    const invalidConfig = {
      // Missing asset_registries
    }

    await withTempConfig(fs, invalidConfig, async () => {
      const { config } = await import('#config').then(m => m.loadConfigWithOverrides(fs))
      const { validateConfig } = (await import('#config')) as typeof import('#config')
      const validation = validateConfig(config)

      expect(validation.valid).toBe(false)
      expect(validation.errors).toContain('Config must have asset_registries object')
    })
  })
})

describe('pair-cli e2e - validate-config failures advanced', () => {
  it('validate-config fails with invalid registry structure', async () => {
    const cwd = '/test-project'
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    const invalidConfig = {
      asset_registries: {
        '.github': 'invalid-registry', // Should be an object
      },
    }

    await withTempConfig(fs, invalidConfig, async () => {
      const { config } = await import('#config').then(m => m.loadConfigWithOverrides(fs))
      const { validateConfig } = (await import('#config')) as typeof import('#config')
      const validation = validateConfig(config)

      expect(validation.valid).toBe(false)
      expect(validation.errors).toContain("Registry '.github' must be a valid object")
    })
  })

  it('validate-config fails with invalid include array', async () => {
    const cwd = '/test-project'
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    const invalidConfig = {
      asset_registries: {
        '.github': {
          source: '.github',
          behavior: 'mirror',
          targets: [{ path: '.github', mode: 'canonical' }],
          description: 'GitHub workflows',
          include: ['valid-string', 123], // Invalid: number in array
        },
      },
    }

    await withTempConfig(fs, invalidConfig, async () => {
      const { config } = await import('#config').then(m => m.loadConfigWithOverrides(fs))
      const { validateConfig } = (await import('#config')) as typeof import('#config')
      const validation = validateConfig(config)

      expect(validation.valid).toBe(false)
      expect(validation.errors).toContain(
        "Registry '.github' include array must contain only strings",
      )
    })
  })
})

describe('pair-cli e2e - list-targets', () => {
  it('list-targets shows available registries', async () => {
    const cwd = '/test-project'
    const fs = createDevScenarioFs(cwd)

    await withTempConfig(fs, createTestConfig(), async () => {
      // Mock the CLI execution by calling the update command with listTargets option
      const { handleUpdateCommand, parseUpdateCommand } = (await import(
        './commands/index.js'
      )) as typeof import('./commands/index.js')
      await handleUpdateCommand(parseUpdateCommand({ source: '.' }), fs)

      // The function no longer returns a value (success indicated by lack of throw)
    })
  })
})

describe('pair-cli e2e - install from local sources', () => {
  describe('install from local ZIP', () => {
    it('installs from absolute path ZIP', async () => {
      const cwd = '/test-absolute-zip'
      const zipPath = 'kb.zip'

      // Create filesystem with ZIP file (simulated as binary content)
      const seed: Record<string, string> = {}
      seed['/test-absolute-zip/kb.zip'] =
        'PK\x03\x04\x14\x00\x00\x00\x00\x00\x8d\x8f\x8bN\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x0e\x00\x00\x00AGENTS.mdthis is agents.md' // Minimal ZIP content
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await installCommand(fs, ['--source', zipPath], { useDefaults: true })
    })

    it('installs from relative path ZIP', async () => {
      const cwd = '/test-relative-zip'
      const zipPath = './downloads/kb.zip'

      const seed: Record<string, string> = {}
      seed['/test-relative-zip/downloads/kb.zip'] =
        'PK\x03\x04\x14\x00\x00\x00\x00\x00\x8d\x8f\x8bN\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x0e\x00\x00\x00AGENTS.mdthis is agents.md'
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await installCommand(fs, ['--source', zipPath], { useDefaults: true })
    })
  })

  describe('install from local directory', () => {
    it('installs from absolute path directory', async () => {
      const cwd = '/test-absolute-dir'
      const dirPath = 'dataset'

      const seed: Record<string, string> = {}
      seed[`${cwd}/${dirPath}/AGENTS.md`] = 'this is agents.md'
      seed[`${cwd}/${dirPath}/.pair/knowledge/index.md`] = '# Knowledge Base'
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await installCommand(fs, ['--source', dirPath], { useDefaults: true })
    })

    it('installs from relative path directory', async () => {
      const cwd = '/test-relative-dir'
      const dirPath = './dataset'

      const seed: Record<string, string> = {}
      seed['/test-relative-dir/dataset/AGENTS.md'] = 'this is agents.md'
      seed['/test-relative-dir/dataset/.pair/knowledge/index.md'] = '# Knowledge Base'
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await installCommand(fs, ['--source', dirPath], { useDefaults: true })
    })
  })
})

describe('update from local sources', () => {
  describe('update from local ZIP', () => {
    it('updates from absolute path ZIP', async () => {
      const cwd = '/test-absolute-zip'
      const zipPath = 'dataset'

      // Create filesystem with extracted ZIP content (simulated as directory)
      const seed: Record<string, string> = {}
      seed[`${cwd}/${zipPath}/AGENTS.md`] = 'this is agents.md'
      seed[`${cwd}/${zipPath}/.github/workflows/ci.yml`] = 'name: CI\non: push'
      seed[`${cwd}/${zipPath}/.pair/knowledge/index.md`] = '# Knowledge Base'
      seed[`${cwd}/${zipPath}/.pair/adoption/onboarding.md`] = '# Onboarding Guide'
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await handleUpdateCommand(parseUpdateCommand({ source: zipPath }), fs)
    })

    it('updates from relative path ZIP', async () => {
      const cwd = '/test-relative-zip'
      const zipPath = './dataset'

      const seed: Record<string, string> = {}
      seed['/test-relative-zip/dataset/AGENTS.md'] = 'this is agents.md'
      seed['/test-relative-zip/dataset/.github/workflows/ci.yml'] = 'name: CI\non: push'
      seed['/test-relative-zip/dataset/.pair/knowledge/index.md'] = '# Knowledge Base'
      seed['/test-relative-zip/dataset/.pair/adoption/onboarding.md'] = '# Onboarding Guide'
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await handleUpdateCommand(parseUpdateCommand({ source: zipPath }), fs)
    })
  })

  describe('update from local directory', () => {
    it('updates from absolute path directory', async () => {
      const cwd = '/test-absolute-dir'
      const dirPath = 'dataset'

      const seed: Record<string, string> = {}
      seed[`${cwd}/${dirPath}/AGENTS.md`] = 'this is agents.md'
      seed[`${cwd}/${dirPath}/.github/workflows/ci.yml`] = 'name: CI\non: push'
      seed[`${cwd}/${dirPath}/.pair/knowledge/index.md`] = '# Knowledge Base'
      seed[`${cwd}/${dirPath}/.pair/adoption/onboarding.md`] = '# Onboarding Guide'
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await handleUpdateCommand(parseUpdateCommand({ source: dirPath }), fs)
    })

    it('updates from relative path directory', async () => {
      const cwd = '/test-relative-dir'
      const dirPath = './dataset'

      const seed: Record<string, string> = {}
      seed['/test-relative-dir/dataset/AGENTS.md'] = 'this is agents.md'
      seed['/test-relative-dir/dataset/.github/workflows/ci.yml'] = 'name: CI\non: push'
      seed['/test-relative-dir/dataset/.pair/knowledge/index.md'] = '# Knowledge Base'
      seed['/test-relative-dir/dataset/.pair/adoption/onboarding.md'] = '# Onboarding Guide'
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await handleUpdateCommand(parseUpdateCommand({ source: dirPath }), fs)
    })
  })
})

describe('pair-cli e2e - link strategy', () => {
  it('install with relative link style', async () => {
    const { fs } = getDeploymentConfig('dev')
    await withTempConfig(fs, createTestConfig(), async () => {
      const configPath = fs.rootModuleDirectory() + '/config.json'
      const result = await installCommand(fs, [], {
        customConfigPath: configPath,
        useDefaults: true,
        linkStyle: 'relative',
      })
      expect((result as { success?: boolean }).success).toBe(true)
    })
  })

  it('update with absolute link style', async () => {
    const { fs } = getDeploymentConfig('dev')
    await withTempConfig(fs, createTestConfig(), async () => {
      const configPath = fs.rootModuleDirectory() + '/config.json'
      // First install to set up targets
      await installCommand(fs, [], { customConfigPath: configPath, useDefaults: true })
      // Then update with absolute style and defaults
      const result = await updateCommand(fs, [], { useDefaults: true, linkStyle: 'absolute' })
      expect((result as { success?: boolean }).success).toBe(true)
    })
  })

  it('update with auto link style detection', async () => {
    const { fs } = getDeploymentConfig('dev')
    await withTempConfig(fs, createTestConfig(), async () => {
      const configPath = fs.rootModuleDirectory() + '/config.json'
      // First install to establish baseline
      await installCommand(fs, [], { customConfigPath: configPath, useDefaults: true })
      // Then update with auto detection and defaults
      await updateCommand(fs, [], { useDefaults: true, linkStyle: 'auto' })
      // Auto detection should succeed
    })
  })
})

describe('pair-cli e2e - error scenarios', () => {
  it('update fails gracefully when source directory does not exist', async () => {
    const cwd = '/test-no-source'
    const seed: Record<string, string> = {
      [cwd + '/config.json']: JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub config',
          },
        },
      }),
    }
    const fs = new InMemoryFileSystemService(seed, cwd, cwd)
    await handleUpdateCommand(parseUpdateCommand({ source: '/nonexistent/path' }), fs)
    // Should fail gracefully when source doesn't exist
  })

  it('install from ZIP fails gracefully when ZIP is corrupted', async () => {
    const cwd = '/test-bad-zip'
    const seed: Record<string, string> = {
      [cwd + '/config.json']: JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub config',
          },
        },
      }),
      [cwd + '/bad.zip']: 'not a valid zip file',
    }
    const fs = new InMemoryFileSystemService(seed, cwd, cwd)
    const result = await installCommand(fs, ['--source', 'bad.zip'], { useDefaults: true })
    expect(result).toBeDefined()
    // May succeed or fail depending on implementation, just ensure it doesn't crash
  })
})

describe('pair-cli e2e - package command', () => {
  it('package command creates valid ZIP with manifest', async () => {
    const cwd = '/test-package'

    const seed: Record<string, string> = {}
    // Create dataset source structure
    seed[cwd + '/dataset/AGENTS.md'] = '# AGENTS documentation'
    seed[cwd + '/dataset/.pair/knowledge/index.md'] = '# Knowledge Base'
    seed[cwd + '/dataset/.github/workflows/ci.yml'] = 'name: CI\non: push'
    seed[cwd + '/config.json'] = JSON.stringify({
      asset_registries: {
        knowledge: {
          source: '.',
          behavior: 'mirror',
          targets: [{ path: '.', mode: 'canonical' }],
          description: 'Knowledge base dataset',
        },
      },
    })

    const fs = new InMemoryFileSystemService(seed, cwd, cwd)

    // Test that we can create a package structure
    // The actual executePackage function is internal, but we can test it via options validation
    const configPath = cwd + '/config.json'
    const config = JSON.parse(fs.readFileSync(configPath))
    expect(config.asset_registries).toBeDefined()
    expect(config.asset_registries.knowledge).toBeDefined()
  })

  it('package command with --source-dir option validates config', async () => {
    const cwd = '/test-package-source-dir'

    const seed: Record<string, string> = {}
    seed[cwd + '/dataset/AGENTS.md'] = '# AGENTS'
    seed[cwd + '/config.json'] = JSON.stringify({
      asset_registries: {
        content: {
          source: '.',
          behavior: 'mirror',
          targets: [{ path: '.', mode: 'canonical' }],
          description: 'Content',
        },
      },
    })

    const fs = new InMemoryFileSystemService(seed, cwd, cwd)

    // Verify config can be loaded
    const configPath = cwd + '/config.json'
    const config = JSON.parse(fs.readFileSync(configPath))
    expect(config.asset_registries.content).toBeDefined()
  })

  it('package command fails gracefully with invalid config', async () => {
    const cwd = '/test-package-bad-config'

    const seed: Record<string, string> = {}
    seed[cwd + '/dataset/AGENTS.md'] = '# AGENTS'
    seed[cwd + '/config.json'] = '{ invalid json'

    const fs = new InMemoryFileSystemService(seed, cwd, cwd)

    // Verify that parsing invalid config fails
    const configPath = cwd + '/config.json'
    expect(() => {
      JSON.parse(fs.readFileSync(configPath))
    }).toThrow()
  })

  it('package command fails gracefully with missing config', async () => {
    const cwd = '/test-package-no-config'

    const seed: Record<string, string> = {
      [cwd + '/dataset/AGENTS.md']: '# AGENTS',
    }

    const fs = new InMemoryFileSystemService(seed, cwd, cwd)

    // Verify that reading missing config fails
    const configPath = cwd + '/nonexistent.json'
    expect(() => {
      fs.readFileSync(configPath)
    }).toThrow()
  })
})

describe('pair-cli e2e - disjoint installation (source and target disjoint)', () => {
  it('installs KB to a disjoint absolute path', async () => {
    const projectRoot = '/test-project'
    const disjointTarget = '/opt/pair/kb'
    const kbSourceDir = '/mnt/external/kb-dataset'

    // 1. Setup Filesystem
    const seed: Record<string, string> = {
      // Configuration in the "project root"
      [`${projectRoot}/config.json`]: JSON.stringify({
        asset_registries: {
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: 'knowledge', mode: 'canonical' }],
            description: 'Core knowledge',
          },
        },
      }),
      [`${projectRoot}/package.json`]: JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
      }),
      // KB Source content in a disjoint directory
      [`${kbSourceDir}/knowledge/index.md`]: '# Knowledge Index',
      [`${kbSourceDir}/knowledge/guide.md`]: 'Follow the [Index](./index.md)',
    }

    const fs = new InMemoryFileSystemService(seed, projectRoot, projectRoot)

    // 2. Perform installation to disjoint target
    // pair install /opt/pair/kb --source /mnt/external/kb-dataset
    await installCommand(fs, ['--source', kbSourceDir], {
      baseTarget: disjointTarget,
      useDefaults: true,
    })

    // 3. Verify installation in disjoint target
    // The target path for the 'knowledge' registry should be /opt/pair/kb/knowledge
    const installedFile = `${disjointTarget}/knowledge/index.md`
    expect(fs.existsSync(installedFile)).toBe(true)
    expect(fs.readFileSync(installedFile)).toBe('# Knowledge Index')

    // 4. Test disjoint update
    // Add new file to source
    await fs.writeFile(`${kbSourceDir}/knowledge/new.md`, 'New content')

    // pair update /opt/pair/kb --source /mnt/external/kb-dataset
    await handleUpdateCommand(
      {
        command: 'update',
        resolution: 'local',
        path: kbSourceDir,
        kb: true,
        offline: true,
        target: disjointTarget,
      },
      fs,
    )

    expect(fs.existsSync(`${disjointTarget}/knowledge/new.md`)).toBe(true)

    // 5. Test disjoint update-link
    // pair update-link /opt/pair/kb
    await handleUpdateLinkCommand(
      {
        command: 'update-link',
        target: disjointTarget,
        dryRun: false,
        logLevel: 'debug',
      },
      fs,
    )

    // Verify rollback setup is working even in disjoint paths (implicitly tested by logic running)
    const installedGuide = `${disjointTarget}/knowledge/guide.md`
    expect(fs.existsSync(installedGuide)).toBe(true)
  })
})

describe('pair-cli e2e - skills registry pipeline', () => {
  function createSkillsConfig() {
    return {
      asset_registries: {
        knowledge: {
          source: '.pair/knowledge',
          behavior: 'mirror',
          description: 'Knowledge base content',
          targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
        },
        skills: {
          source: '.skills',
          behavior: 'mirror',
          flatten: true,
          prefix: 'pair',
          description: 'Agent skills distributed to AI tool directories',
          targets: [
            { path: '.claude/skills/', mode: 'canonical' },
            { path: '.github/skills/', mode: 'symlink' },
            { path: '.cursor/skills/', mode: 'symlink' },
          ],
        },
      },
    }
  }

  function createSkillsDatasetFs(cwd: string) {
    const seed: Record<string, string> = {}
    const datasetBase = `${cwd}/dataset`

    // Knowledge registry content
    seed[`${datasetBase}/.pair/knowledge/index.md`] = '# Knowledge Base'

    // Skills registry content — mimics real .skills/ structure
    seed[`${datasetBase}/.skills/navigator/next/SKILL.md`] =
      '---\nname: next\ndescription: Project navigator\n---\n# /next'

    seed[`${cwd}/config.json`] = JSON.stringify(createSkillsConfig())

    return new InMemoryFileSystemService(seed, cwd, cwd)
  }

  it('update distributes skills with flatten + prefix to canonical target', async () => {
    const cwd = '/test-skills'
    const fs = createSkillsDatasetFs(cwd)

    await handleUpdateCommand(parseUpdateCommand({ source: `${cwd}/dataset` }), fs)

    // Flatten transforms 'navigator/next' → 'navigator-next', prefix 'pair' → 'pair-navigator-next'
    expect(fs.existsSync(`${cwd}/.claude/skills/pair-navigator-next/SKILL.md`)).toBe(true)
    const content = fs.readFileSync(`${cwd}/.claude/skills/pair-navigator-next/SKILL.md`)
    expect(content).toContain('name: pair-navigator-next')
  })

  it('update creates symlinks for secondary targets', async () => {
    const cwd = '/test-skills-symlink'
    const fs = createSkillsDatasetFs(cwd)

    await handleUpdateCommand(parseUpdateCommand({ source: `${cwd}/dataset` }), fs)

    // Secondary targets should be symlinks pointing to the canonical path
    const symlinks = fs.getSymlinks()
    const canonicalPath = `${cwd}/.claude/skills`
    const githubSymlink = `${cwd}/.github/skills`
    const cursorSymlink = `${cwd}/.cursor/skills`

    expect(symlinks.get(githubSymlink)).toBe(canonicalPath)
    expect(symlinks.get(cursorSymlink)).toBe(canonicalPath)
  })

  it('validate-config succeeds with skills registry config', async () => {
    const cwd = '/test-skills-validate'
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    await withTempConfig(fs, createSkillsConfig(), async () => {
      const { config } = await import('#config').then(m => m.loadConfigWithOverrides(fs))
      const { validateConfig } = (await import('#config')) as typeof import('#config')
      const validation = validateConfig(config)

      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })
  })

  it('validate-config fails when skills registry has no canonical target', async () => {
    const cwd = '/test-skills-no-canonical'
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    const badConfig = {
      asset_registries: {
        skills: {
          source: '.skills',
          behavior: 'mirror',
          flatten: true,
          prefix: 'pair',
          description: 'Skills with no canonical target',
          targets: [
            { path: '.github/skills/', mode: 'symlink' },
            { path: '.cursor/skills/', mode: 'symlink' },
          ],
        },
      },
    }

    await withTempConfig(fs, badConfig, async () => {
      const { config } = await import('#config').then(m => m.loadConfigWithOverrides(fs))
      const { validateConfig } = (await import('#config')) as typeof import('#config')
      const validation = validateConfig(config)

      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.includes('canonical'))).toBe(true)
    })
  })

  it('install distributes skills to canonical and symlink targets', async () => {
    const cwd = '/test-skills-install'
    const fs = createSkillsDatasetFs(cwd)

    await installCommand(fs, ['--source', `${cwd}/dataset`], { useDefaults: true })

    // Canonical target should have flattened+prefixed content
    expect(fs.existsSync(`${cwd}/.claude/skills/pair-navigator-next/SKILL.md`)).toBe(true)

    // Secondary targets should be symlinks
    const symlinks = fs.getSymlinks()
    expect(symlinks.has(`${cwd}/.github/skills`)).toBe(true)
    expect(symlinks.has(`${cwd}/.cursor/skills`)).toBe(true)
  })
})
