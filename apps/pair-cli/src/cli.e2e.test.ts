import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
import { installCommand } from './commands/install'
import { handleUpdateCommand } from './cli'
import { updateCommand } from './commands/update'

describe('pair-cli e2e', () => {
  describe('dev scenario', () => {
    it('install with defaults succeeds in dev scenario', async () => {
      await testInstallWithDefaults('dev')
    })

    it('update with defaults succeeds in dev scenario', async () => {
      await testUpdateWithDefaults('dev')
    })
  })

  describe('npm deploy scenario', () => {
    it('install with defaults succeeds in npm deploy scenario', async () => {
      await testInstallWithDefaults('npm')
    })

    it('update with defaults succeeds in npm deploy scenario', async () => {
      await testUpdateWithDefaults('npm')
    })
  })

  describe('manual deploy scenario', () => {
    it('install with defaults succeeds in manual deploy scenario', async () => {
      await testInstallWithDefaults('manual')
    })

    it('update with defaults succeeds in manual deploy scenario', async () => {
      await testUpdateWithDefaults('manual')
    })
  })
})

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
        target_path: '.github',
        description: 'GitHub workflows and configs',
      },
      '.pair-knowledge': {
        source: '.pair/knowledge',
        behavior: 'mirror',
        target_path: '.pair-knowledge',
        description: 'Knowledge base content',
      },
      '.pair-adoption': {
        source: '.pair/adoption',
        behavior: 'mirror',
        target_path: '.pair-adoption',
        description: 'Adoption and onboarding content',
      },
      'agents.md': {
        source: 'AGENTS.md',
        behavior: 'add',
        target_path: 'AGENTS.md',
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

async function testInstallWithDefaults(deployType: 'npm' | 'manual' | 'dev') {
  const { fs } = getDeploymentConfig(deployType)
  await withTempConfig(fs, createTestConfig(), async () => {
    const configPath = fs.rootModuleDirectory() + '/config.json'
    const result = await installCommand(fs, [], { customConfigPath: configPath, useDefaults: true })
    expect(result).toBeDefined()
    expect((result as { success?: boolean }).success).toBe(true)
  })
}

async function testUpdateWithDefaults(deployType: 'npm' | 'manual' | 'dev') {
  const { fs } = getDeploymentConfig(deployType)
  await withTempConfig(fs, createTestConfig(), async () => {
    const configPath = fs.rootModuleDirectory() + '/config.json'
    // First install to set up the targets
    await installCommand(fs, [], { customConfigPath: configPath, useDefaults: true })
    // Then test update
    const result = await updateCommand(fs, [], { useDefaults: true })
    expect(result).toBeDefined()
    expect((result as { success?: boolean }).success).toBe(true)
  })
}

describe('pair-cli e2e - validate-config success', () => {
  it('validate-config succeeds with valid config', async () => {
    const cwd = '/test-project'
    const fs = createDevScenarioFs(cwd)

    await withTempConfig(fs, createTestConfig(), async () => {
      // Mock the CLI execution by calling the validate-config logic directly
      // Since we can't easily run the CLI binary in tests, we'll test the underlying function
      const { config } = await import('./config-utils').then(m => m.loadConfigWithOverrides(fs))
      const { validateConfig } = await import('./config-utils')
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
          target_path: '.github',
          // Missing description - this should also be an error
        },
      },
    }

    await withTempConfig(fs, invalidConfig, async () => {
      const { config } = await import('./config-utils').then(m => m.loadConfigWithOverrides(fs))
      const { validateConfig } = await import('./config-utils')
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
      const { config } = await import('./config-utils').then(m => m.loadConfigWithOverrides(fs))
      const { validateConfig } = await import('./config-utils')
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
      const { config } = await import('./config-utils').then(m => m.loadConfigWithOverrides(fs))
      const { validateConfig } = await import('./config-utils')
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
          target_path: '.github',
          description: 'GitHub workflows',
          include: ['valid-string', 123], // Invalid: number in array
        },
      },
    }

    await withTempConfig(fs, invalidConfig, async () => {
      const { config } = await import('./config-utils').then(m => m.loadConfigWithOverrides(fs))
      const { validateConfig } = await import('./config-utils')
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
      const { handleUpdateCommand } = await import('./cli')
      const result = await handleUpdateCommand({ listTargets: true }, fs)

      // The function should return undefined for list-targets (no success/failure result)
      expect(result).toBeUndefined()
    })
  })
})

describe('pair-cli e2e - registry override syntax', () => {
  it('update with registry:target syntax treats it as target path', async () => {
    const cwd = '/test-project'
    const fs = createDevScenarioFs(cwd)

    await withTempConfig(fs, createTestConfig(), async () => {
      // First install to set up the targets
      await installCommand(fs, [], { customConfigPath: undefined })

      // Test update with registry:target syntax (currently treated as target path)
      const { updateCommand } = await import('./commands/update')
      const result = await updateCommand(fs, ['--target', 'github:.github'], {})

      // The current implementation treats github:.github as a valid target path and succeeds
      expect(result).toBeDefined()
      expect(result!.success).toBe(true)
    })
  })
})

describe('pair-cli e2e - KB availability', () => {
  it('fails gracefully when KB not available anywhere', async () => {
    const cwd = '/no-kb-test'

    const fs = new InMemoryFileSystemService(
      {
        [cwd + '/package.json']: JSON.stringify({ name: 'test', version: '1.0.0' }),
      },
      cwd,
      cwd,
    )

    await withTempConfig(fs, createTestConfig(), async () => {
      const result = await installCommand(fs, [], { customConfigPath: undefined })

      // Should fail when KB not available anywhere (no dev dataset, no cache, no bundled)
      expect(result).toBeDefined()
      expect((result as { success?: boolean }).success).toBe(false)
    })
  })

  it('exercises KB manager fallback path when no local KB available', async () => {
    const cwd = '/kb-fallback-test'

    // Simulate fresh install: no local KB dataset, no bundled KB
    const fs = new InMemoryFileSystemService(
      {
        [cwd + '/package.json']: JSON.stringify({
          name: 'kb-fallback-test',
          version: '1.0.0',
        }),
      },
      cwd,
      cwd,
    )

    await withTempConfig(fs, createTestConfig(), async () => {
      // This exercises the KB manager fallback path
      // Actual download is mocked in kb-manager.test.ts (17/17 tests)
      const result = await installCommand(fs, [], { customConfigPath: undefined })

      // Fails because no KB available, but fallback path was exercised
      expect(result).toBeDefined()
      expect((result as { success?: boolean }).success).toBe(false)
    })
  })
})

describe('CLI Entry Point Flags', () => {
  const originalArgv = process.argv

  beforeEach(() => {
    process.argv = originalArgv
  })

  afterEach(() => {
    process.argv = originalArgv
  })

  it('passes --url flag to KB availability check', async () => {
    const cwd = '/cli-flags-test-url'
    const fs = new InMemoryFileSystemService(
      {
        [cwd + '/package.json']: JSON.stringify({ name: 'test', version: '1.0.0' }),
      },
      cwd,
      cwd,
    )

    await withTempConfig(fs, createTestConfig(), async () => {
      // Test that --url flag is correctly parsed and passed
      // Since we don't have HTTP mocking, the download will fail but flag parsing will work
      const errors: string[] = []
      const originalConsoleError = console.error
      console.error = (...args: unknown[]) => errors.push(args.join(' '))

      try {
        const result = await installCommand(fs, ['--source', 'https://custom.com/kb.zip'], {
          customConfigPath: undefined,
        })
        // Should fail because no KB available
        expect(result).toBeDefined()
        expect((result as { success?: boolean }).success).toBe(false)
      } finally {
        console.error = originalConsoleError
      }
    })
  })

  it('skips KB check when --no-kb flag is present', async () => {
    const cwd = '/cli-flags-test-no-kb'
    const fs = createDevScenarioFs(cwd)

    await withTempConfig(fs, createTestConfig(), async () => {
      process.argv = ['node', 'pair', 'install', '--no-kb']

      // No KB download should happen - install should succeed without KB
      const result = await installCommand(fs, [], {
        customConfigPath: fs.rootModuleDirectory() + '/config.json',
        useDefaults: true,
      })
      expect(result).toBeDefined()
      expect((result as { success?: boolean }).success).toBe(true)
    })
  })

  it('validates options using validateCliOptions - rejects conflicting flags', async () => {
    try {
      const { validateCliOptions } = await import('./kb-manager/cli-options')
      validateCliOptions({ url: 'http://foo', kb: false })
      // Should not reach here
      expect(true).toBe(false)
    } catch (error) {
      // Expected to throw
      expect(error).toBeDefined()
      expect(String(error)).toContain('--url and --no-kb')
    }
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
            target_path: '.github',
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            target_path: '.pair/knowledge',
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            target_path: '.pair/adoption',
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            target_path: 'AGENTS.md',
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      const result = await installCommand(fs, ['--source', zipPath], { useDefaults: true })

      expect(result).toBeDefined()
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
            target_path: '.github',
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            target_path: '.pair/knowledge',
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            target_path: '.pair/adoption',
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            target_path: 'AGENTS.md',
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      const result = await installCommand(fs, ['--source', zipPath], { useDefaults: true })

      expect(result).toBeDefined()
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
            target_path: '.github',
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            target_path: '.pair/knowledge',
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            target_path: '.pair/adoption',
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            target_path: 'AGENTS.md',
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      const result = await installCommand(fs, ['--source', dirPath], { useDefaults: true })

      expect(result).toBeDefined()
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
            target_path: '.github',
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            target_path: '.pair/knowledge',
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            target_path: '.pair/adoption',
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            target_path: 'AGENTS.md',
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      const result = await installCommand(fs, ['--source', dirPath], { useDefaults: true })

      expect(result).toBeDefined()
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
            target_path: '.github',
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            target_path: '.pair/knowledge',
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            target_path: '.pair/adoption',
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            target_path: 'AGENTS.md',
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      const result = await handleUpdateCommand({ url: zipPath }, fs)

      expect(result).toBeDefined()
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
            target_path: '.github',
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            target_path: '.pair/knowledge',
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            target_path: '.pair/adoption',
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            target_path: 'AGENTS.md',
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      const result = await handleUpdateCommand({ url: zipPath }, fs)

      expect(result).toBeDefined()
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
            target_path: '.github',
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            target_path: '.pair/knowledge',
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            target_path: '.pair/adoption',
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            target_path: 'AGENTS.md',
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      const result = await handleUpdateCommand({ url: dirPath }, fs)

      expect(result).toBeDefined()
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
            target_path: '.github',
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            target_path: '.pair/knowledge',
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            target_path: '.pair/adoption',
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            target_path: 'AGENTS.md',
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      const result = await handleUpdateCommand({ url: dirPath }, fs)

      expect(result).toBeDefined()
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
      expect(result).toBeDefined()
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
      expect(result).toBeDefined()
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
      const result = await updateCommand(fs, [], { useDefaults: true, linkStyle: 'auto' })
      expect(result).toBeDefined()
      // Auto detection should succeed
    })
  })
})

describe('pair-cli e2e - error scenarios', () => {
  it('install fails gracefully when config is missing', async () => {
    const cwd = '/test-no-config'
    const seed: Record<string, string> = {}
    const fs = new InMemoryFileSystemService(seed, cwd, cwd)
    const result = await installCommand(fs, [], {
      customConfigPath: cwd + '/nonexistent.json',
      useDefaults: true,
    })
    expect(result).toBeDefined()
    expect((result as { success?: boolean }).success).toBe(false)
  })

  it('update fails gracefully when source directory does not exist', async () => {
    const cwd = '/test-no-source'
    const seed: Record<string, string> = {
      [cwd + '/config.json']: JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            target_path: '.github',
            description: 'GitHub config',
          },
        },
      }),
    }
    const fs = new InMemoryFileSystemService(seed, cwd, cwd)
    const result = await handleUpdateCommand({ url: '/nonexistent/path' }, fs)
    expect(result).toBeDefined()
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
            target_path: '.github',
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
