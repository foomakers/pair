import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import path from 'path'
import * as configUtils from './config-utils'
import { InMemoryFileSystemService } from '@pair/content-ops'
import type { FileSystemService } from '@pair/content-ops'

let inMemoryFs: FileSystemService

const BASE_CONFIG = {
  asset_registries: {
    github: {
      source: '.github',
      behavior: 'mirror' as const,
      include: ['/agents', '/workflows'],
      target_path: '.github',
      description: 'GitHub workflows and configuration files',
    },
  },
  default_target_folders: { pair: '.pair', github: '.github' },
}

const PAIR_CONFIG = {
  asset_registries: {
    github: {
      source: '.github',
      behavior: 'mirror' as const,
      include: ['/agents', '/workflows'],
      target_path: '.pair-knowledge',
      description: 'Overridden description',
    },
  },
}

const CUSTOM_CONFIG = {
  asset_registries: {
    custom: {
      behavior: 'add' as const,
      target_path: 'custom',
      description: 'Custom registry',
    },
  },
}

function setupInMemoryFs() {
  inMemoryFs = new InMemoryFileSystemService({}, '/mock/project', '/')
  const datasetPath = '/mock/node_modules/@pair/knowledge-hub/dataset'

  const appConfigPath = '/mock/project/config.json'
  inMemoryFs.writeFile(appConfigPath, JSON.stringify(BASE_CONFIG))

  // Keep a mock knowledge-hub dataset present in case it's referenced elsewhere
  inMemoryFs.writeFile(path.join(datasetPath, 'dummy.txt'), 'ok')

  return { datasetPath }
}

function resetBaseConfigMocks() {
  inMemoryFs = undefined as unknown as FileSystemService
}

describe('loadConfigWithOverrides (in-memory FS) - base config', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('loads base config when no overrides provided', () => {
    setupInMemoryFs()

    const result = configUtils.loadConfigWithOverrides(inMemoryFs, { projectRoot: '/mock/project' })

    expect(result.config).toBeDefined()
    expect(result.config.asset_registries.github.target_path).toBe('.github')

    resetBaseConfigMocks()
  })
})

describe('loadConfigWithOverrides (in-memory FS) - overrides', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('applies pair.config.json from project root when present', () => {
    setupInMemoryFs()
    const pairConfigPath = '/mock/project/pair.config.json'

    inMemoryFs.writeFile(pairConfigPath, JSON.stringify(PAIR_CONFIG))

    const result = configUtils.loadConfigWithOverrides(inMemoryFs, { projectRoot: '/mock/project' })

    expect(result.source).toBe('pair.config.json')
    expect(result.config.asset_registries.github.target_path).toBe('.pair-knowledge')

    resetBaseConfigMocks()
  })

  it('applies custom config when provided', () => {
    setupInMemoryFs()
    const customConfigPath = '/custom/config.json'

    inMemoryFs.writeFile(customConfigPath, JSON.stringify(CUSTOM_CONFIG))

    const result = configUtils.loadConfigWithOverrides(inMemoryFs, {
      customConfigPath,
      projectRoot: '/mock/project',
    })

    expect(result.source).toBe(`custom config: ${customConfigPath}`)
    expect(result.config.asset_registries.github.target_path).toBe('.github') // base config
    expect(result.config.asset_registries.custom.target_path).toBe('custom') // merged

    resetBaseConfigMocks()
  })
})

describe('validateConfig - basic validation', () => {
  it('should validate a correct config', () => {
    const validConfig = {
      asset_registries: {
        github: {
          behavior: 'mirror' as const,
          target_path: '.github',
          description: 'GitHub workflows',
        },
      },
    }

    const result = configUtils.validateConfig(validConfig)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('should reject non-object config', () => {
    const result = configUtils.validateConfig('invalid')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Config must be a valid object')
  })

  it('should reject config without asset_registries', () => {
    const result = configUtils.validateConfig({})

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Config must have asset_registries object')
  })
})

describe('validateConfig - registry behavior validation', () => {
  it('should reject registry without behavior', () => {
    const invalidConfig = {
      asset_registries: {
        test: {
          target_path: 'test',
          description: 'Test',
        },
      },
    }

    const result = configUtils.validateConfig(invalidConfig)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      "Registry 'test' has invalid behavior 'undefined'. Must be one of: overwrite, add, mirror, skip",
    )
  })

  it('should reject registry with invalid behavior', () => {
    const invalidConfig = {
      asset_registries: {
        test: {
          behavior: 'invalid' as 'overwrite' | 'add' | 'mirror' | 'skip',
          target_path: 'test',
          description: 'Test',
        },
      },
    }

    const result = configUtils.validateConfig(invalidConfig)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      "Registry 'test' has invalid behavior 'invalid'. Must be one of: overwrite, add, mirror, skip",
    )
  })
})

describe('validateConfig - registry properties validation', () => {
  it('should reject registry without target_path', () => {
    const invalidConfig = {
      asset_registries: {
        test: {
          behavior: 'mirror' as const,
          description: 'Test',
        },
      },
    }

    const result = configUtils.validateConfig(invalidConfig)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Registry 'test' must have a valid target_path string")
  })

  it('should reject registry without description', () => {
    const invalidConfig = {
      asset_registries: {
        test: {
          behavior: 'mirror' as const,
          target_path: 'test',
        },
      },
    }

    const result = configUtils.validateConfig(invalidConfig)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Registry 'test' must have a valid description string")
  })
})

describe('validateConfig - include array validation - invalid types', () => {
  it('should reject registry with non-array include', () => {
    const invalidConfig = {
      asset_registries: {
        test: {
          behavior: 'mirror' as const,
          target_path: 'test',
          description: 'Test',
          include: 'invalid',
        },
      },
    }

    const result = configUtils.validateConfig(invalidConfig)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Registry 'test' include must be an array of strings")
  })

  it('should reject registry with non-string include items', () => {
    const invalidConfig = {
      asset_registries: {
        test: {
          behavior: 'mirror' as const,
          target_path: 'test',
          description: 'Test',
          include: [123],
        },
      },
    }

    const result = configUtils.validateConfig(invalidConfig)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Registry 'test' include array must contain only strings")
  })
})

describe('validateConfig - include array validation - valid cases', () => {
  it('should validate config with valid include array', () => {
    const validConfig = {
      asset_registries: {
        test: {
          behavior: 'mirror' as const,
          target_path: 'test',
          description: 'Test',
          include: ['file1', 'file2'],
        },
      },
    }

    const result = configUtils.validateConfig(validConfig)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('should accumulate multiple validation errors', () => {
    const invalidConfig = {
      asset_registries: {
        test1: {
          behavior: 'invalid' as 'overwrite' | 'add' | 'mirror' | 'skip',
          description: 'Test 1',
        },
        test2: {
          behavior: 'mirror' as const,
          target_path: 'test2',
        },
      },
    }
    const result = configUtils.validateConfig(invalidConfig)

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(3)
    expect(result.errors).toContain(
      "Registry 'test1' has invalid behavior 'invalid'. Must be one of: overwrite, add, mirror, skip",
    )
    expect(result.errors).toContain("Registry 'test1' must have a valid target_path string")
    expect(result.errors).toContain("Registry 'test2' must have a valid description string")
  })
})

describe('getKnowledgeHubDatasetPath - node_modules resolution', () => {
  it('should return dataset path from node_modules when not in release', () => {
    // Simulate project structure
    const mockDir = '/mock/project'

    // Create in-memory FS with node_modules structure
    const fs = new InMemoryFileSystemService(
      {
        '/mock/project/node_modules/@pair/knowledge-hub/package.json':
          '{"name": "@pair/knowledge-hub", "dataset": "dataset"}',
        '/mock/project/node_modules/@pair/knowledge-hub/dataset/.github/workflows/ci.yml':
          'workflow content',
      },
      mockDir,
      '/',
    )

    const result = configUtils.getKnowledgeHubDatasetPath(fs)

    expect(result).toBe('/mock/project/node_modules/@pair/knowledge-hub/dataset')
  })

  it('should throw error when package not found in node_modules', () => {
    // Simulate project structure
    const mockDir = '/mock/project/apps/pair-cli/src'

    // Create in-memory FS without node_modules
    const fs = new InMemoryFileSystemService({}, mockDir, '/')

    expect(() => configUtils.getKnowledgeHubDatasetPath(fs)).toThrow(
      'Release bundle not found inside: /mock/project/apps/pair-cli/src',
    )
  })
})

describe('getKnowledgeHubDatasetPath - release bundle resolution', () => {
  it('should return dataset path from bundle-cli when in release', () => {
    // Simulate release structure
    const mockDir = '/mock/release/bundle-cli/src'

    // Create in-memory FS with bundle structure and package.json
    const fs = new InMemoryFileSystemService(
      {
        '/mock/release/bundle-cli/package.json': JSON.stringify({
          name: '@pair/pair-cli',
          version: '0.1.0',
        }),
        '/mock/release/bundle-cli/bundle-cli/dataset/.github/workflows/ci.yml': 'workflow content',
      },
      mockDir,
      '/',
    )

    const result = configUtils.getKnowledgeHubDatasetPath(fs)

    expect(result).toBe('/mock/release/bundle-cli/bundle-cli/dataset')
  })

  it('should throw error when dataset not found in release', () => {
    // Simulate release structure
    const mockDir = '/mock/release/bundle-cli'

    // Create in-memory FS without bundle-cli/dataset
    const fs = new InMemoryFileSystemService({}, mockDir, '/')

    expect(() => configUtils.getKnowledgeHubDatasetPath(fs)).toThrow(
      'Release bundle not found inside: /mock/release/bundle-cli',
    )
  })
})

// Helper: create cached KB in mock fs
function setupCachedKB(fs: InMemoryFileSystemService, cachedKBPath: string, content: string) {
  fs.writeFile(path.join(cachedKBPath, 'dataset', 'dummy.txt'), content)
}

// Helper: create mock KB manager functions
function createKBMocks(isCached: boolean, cachedPath: string) {
  return {
    mockIsKBCached: vi.fn().mockResolvedValue(isCached),
    mockEnsureKBAvailable: vi.fn().mockResolvedValue(cachedPath),
  }
}

// Helper: setup local dataset in filesystem
function setupLocalDataset(fs: InMemoryFileSystemService, mockDir: string) {
  const packageJsonPath = path.join(
    mockDir,
    'node_modules',
    '@pair',
    'knowledge-hub',
    'package.json',
  )
  const localDatasetPath = path.join(mockDir, 'node_modules', '@pair', 'knowledge-hub', 'dataset')

  fs.writeFile(packageJsonPath, JSON.stringify({ name: '@pair/knowledge-hub' }))
  fs.writeFile(path.join(localDatasetPath, 'dummy.txt'), 'local')
  return localDatasetPath
}

describe('getKnowledgeHubDatasetPath with KB manager fallback', () => {
  it('should use cached KB when dataset not found locally', async () => {
    const mockDir = '/mock/project'
    const cachedKBPath = '/home/user/.pair/kb/0.1.0'
    const fs = new InMemoryFileSystemService({}, mockDir, '/')
    const { mockIsKBCached, mockEnsureKBAvailable } = createKBMocks(true, cachedKBPath)

    setupCachedKB(fs, cachedKBPath, 'cached')

    const result = await configUtils.getKnowledgeHubDatasetPathWithFallback({
      fsService: fs,
      version: '0.1.0',
      isKBCachedFn: mockIsKBCached,
      ensureKBAvailableFn: mockEnsureKBAvailable,
    })

    expect(mockIsKBCached).toHaveBeenCalledWith('0.1.0', fs)
    expect(mockEnsureKBAvailable).toHaveBeenCalledWith('0.1.0', { fs })
    expect(result).toBe(path.join(cachedKBPath, 'dataset'))
  })

  it('should download KB when not cached', async () => {
    const mockDir = '/mock/project'
    const cachedKBPath = '/home/user/.pair/kb/0.1.0'
    const fs = new InMemoryFileSystemService({}, mockDir, '/')
    const { mockIsKBCached, mockEnsureKBAvailable } = createKBMocks(false, cachedKBPath)

    setupCachedKB(fs, cachedKBPath, 'downloaded')

    const result = await configUtils.getKnowledgeHubDatasetPathWithFallback({
      fsService: fs,
      version: '0.1.0',
      isKBCachedFn: mockIsKBCached,
      ensureKBAvailableFn: mockEnsureKBAvailable,
    })

    expect(mockIsKBCached).toHaveBeenCalledWith('0.1.0', fs)
    expect(mockEnsureKBAvailable).toHaveBeenCalledWith('0.1.0', { fs })
    expect(result).toBe(path.join(cachedKBPath, 'dataset'))
  })

  it('should use local dataset when available', async () => {
    const mockDir = '/mock/project'
    const fs = new InMemoryFileSystemService({}, mockDir, '/')
    const mockIsKBCached = vi.fn()
    const mockEnsureKBAvailable = vi.fn()

    const localDatasetPath = setupLocalDataset(fs, mockDir)

    const result = await configUtils.getKnowledgeHubDatasetPathWithFallback({
      fsService: fs,
      version: '0.1.0',
      isKBCachedFn: mockIsKBCached,
      ensureKBAvailableFn: mockEnsureKBAvailable,
    })

    expect(mockIsKBCached).not.toHaveBeenCalled()
    expect(mockEnsureKBAvailable).not.toHaveBeenCalled()
    expect(result).toBe(localDatasetPath)
  })
})
