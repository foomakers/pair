import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
import { handleInstallCommand } from './cli'
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
        behavior: 'overwrite',
        target_path: 'AGENTS.md',
        description: 'AI agents guidance and session context',
      },
    },
  }
}

async function testInstallWithDefaults(deployType: 'npm' | 'manual' | 'dev') {
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

  await withTempConfig(fs, createTestConfig(), async () => {
    const result = await handleInstallCommand(undefined, { config: undefined }, fs)
    expect(result).toBeDefined()
    expect((result as { success?: boolean }).success).toBe(true)
  })
}

async function testUpdateWithDefaults(deployType: 'npm' | 'manual' | 'dev') {
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

  await withTempConfig(fs, createTestConfig(), async () => {
    // First install to set up the targets
    await handleInstallCommand(undefined, { config: undefined }, fs)

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
      await handleInstallCommand(undefined, { config: undefined }, fs)

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
      const result = await handleInstallCommand(undefined, { config: undefined }, fs)

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
      const result = await handleInstallCommand(undefined, { config: undefined }, fs)

      // Fails because no KB available, but fallback path was exercised
      expect(result).toBeDefined()
      expect((result as { success?: boolean }).success).toBe(false)
    })
  })
})

describe('CLI Entry Point Flags', () => {
  const originalArgv = process.argv
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockExit: any
  let mockConsoleError: any

  // Mocks need to be defined here to be accessible in doMock
  const mockGetDatasetPath = vi.fn()
  const mockGetDatasetPathWithFallback = vi.fn()
  const mockInstallCommand = vi.fn()
  const mockValidateCliOptions = vi.fn()

  beforeEach(async () => {
    vi.resetModules()

    // Setup mocks using doMock
    vi.doMock('./config-utils', () => ({
      validateConfig: vi.fn(),
      getKnowledgeHubDatasetPath: mockGetDatasetPath,
      getKnowledgeHubDatasetPathWithFallback: mockGetDatasetPathWithFallback,
      loadConfigWithOverrides: vi.fn(),
      isInRelease: vi.fn().mockReturnValue(false),
    }))

    vi.doMock('./commands/install', () => ({
      installCommand: mockInstallCommand,
    }))

    vi.doMock('./commands/package', () => ({
      packageCommand: vi.fn(),
    }))

    vi.doMock('./kb-manager/cli-options', () => ({
      validateCliOptions: mockValidateCliOptions,
    }))

    // Default mock implementations
    mockGetDatasetPath.mockReturnValue('/mock/dataset/path')
    mockGetDatasetPathWithFallback.mockResolvedValue('/mock/dataset/path')
    mockInstallCommand.mockResolvedValue({ success: true })

    // Mock process.exit and console.error
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.argv = originalArgv
    vi.clearAllMocks()
    vi.doUnmock('./config-utils')
    vi.doUnmock('./commands/install')
    vi.doUnmock('./commands/package')
    vi.doUnmock('./kb-manager/cli-options')
  })

  it('passes --url flag to KB availability check', async () => {
    process.argv = ['node', 'pair', 'install', '--url', 'https://custom.com/kb.zip']
    const { main } = await import('./cli')
    await main()
    expect(mockGetDatasetPathWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        customUrl: 'https://custom.com/kb.zip',
      }),
    )
  })

  it('skips KB check when --no-kb flag is present', async () => {
    process.argv = ['node', 'pair', 'install', '--no-kb']
    const { main } = await import('./cli')
    await main()
    expect(mockGetDatasetPathWithFallback).not.toHaveBeenCalled()
  })

  it('uses default behavior when no flags provided', async () => {
    process.argv = ['node', 'pair', 'install']
    const { main } = await import('./cli')
    await main()
    expect(mockGetDatasetPathWithFallback).toHaveBeenCalledWith(
      expect.not.objectContaining({
        customUrl: expect.anything(),
      }),
    )
  })

  it('validates options using validateCliOptions', async () => {
    process.argv = ['node', 'pair', 'install', '--url', 'http://foo', '--no-kb']
    mockValidateCliOptions.mockImplementation(() => {
      throw new Error('Mutually exclusive')
    })
    const { main } = await import('./cli')
    await main()
    expect(mockExit).toHaveBeenCalledWith(1)
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Invalid options'))
    expect(mockValidateCliOptions).toHaveBeenCalled()
  })
})
