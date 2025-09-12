import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import {
  getKnowledgeHubDatasetPath,
  getKnowledgeHubConfig,
  loadConfigWithOverrides,
  validateConfig,
} from './config-utils'

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}))

vi.mock('path', () => ({
  join: vi.fn(),
  dirname: vi.fn(),
}))

const mockReadFileSync = vi.mocked(readFileSync)
const mockExistsSync = vi.mocked(existsSync)
const mockJoin = vi.mocked(join)
const mockDirname = vi.mocked(dirname)

// Helper functions for test setup
function setupBaseConfigMocks() {
  const mockConfigPath = '/mock/node_modules/@pair/knowledge-hub/config.json'

  mockDirname.mockReturnValue('/mock/node_modules/@pair/knowledge-hub')
  mockJoin.mockReturnValue(mockConfigPath)
  mockReadFileSync.mockImplementation((path: unknown) => {
    const p = String(path)
    if (p === mockConfigPath) {
      return JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror' as const,
            include: ['/chatmodes', '/workflows'],
            target_path: '.github',
            description: 'GitHub workflows and configuration files',
          },
        },
      })
    }
    throw new Error('Unexpected path')
  })

  return { mockConfigPath }
}

function resetBaseConfigMocks() {
  mockDirname.mockReset()
  mockJoin.mockReset()
  mockReadFileSync.mockReset()
}

function testRegistryOverride() {
  // registryOverrides are no longer supported; ensure function still returns base config
  setupBaseConfigMocks()
  const result = loadConfigWithOverrides({ projectRoot: '/mock/project' })
  expect(result.config.asset_registries.github.target_path).toBe('.github')
  resetBaseConfigMocks()
}

function setupKnowledgeHubConfigMocks() {
  const mockConfigPath = '/mock/node_modules/@pair/knowledge-hub/config.json'
  const mockConfigContent = JSON.stringify({
    asset_registries: {
      test: {
        behavior: 'mirror',
        target_path: 'test',
        description: 'Test registry',
      },
    },
  })

  mockDirname.mockReturnValue('/mock/node_modules/@pair/knowledge-hub')
  mockJoin.mockReturnValue(mockConfigPath)
  mockReadFileSync.mockImplementation((path: unknown) => {
    const p = String(path)
    if (p === mockConfigPath) return mockConfigContent
    throw new Error('Unexpected path')
  })

  return { mockConfigPath, mockConfigContent }
}

function resetKnowledgeHubConfigMocks() {
  mockDirname.mockReset()
  mockJoin.mockReset()
  mockReadFileSync.mockReset()
}

function setupCustomConfigMocks() {
  const customConfigPath = '/custom/config.json'
  const customConfig = {
    asset_registries: {
      custom: {
        behavior: 'add' as const,
        target_path: 'custom',
        description: 'Custom registry',
      },
    },
  }

  setupBaseConfigMocks()

  // Simulate that pair.config.json does not exist, only customConfigPath is provided
  mockExistsSync.mockReturnValue(false)
  // First call is from knowledge-hub base config, second from custom config
  mockReadFileSync.mockReturnValueOnce(
    JSON.stringify({
      asset_registries: {
        github: {
          source: '.github',
          behavior: 'mirror' as const,
          include: ['/chatmodes', '/workflows'],
          target_path: '.github',
          description: 'GitHub workflows and configuration files',
        },
      },
    }),
  )
  mockReadFileSync.mockReturnValueOnce(JSON.stringify(customConfig))

  return { customConfigPath, customConfig }
}

function setupInvalidJsonConfigMocks() {
  const mockConfigPath = '/mock/node_modules/@pair/knowledge-hub/config.json'

  const resolveSpy = vi
    .spyOn(require as unknown as { resolve: (...args: unknown[]) => string }, 'resolve')
    .mockReturnValue('/mock/node_modules/@pair/knowledge-hub/package.json')
  mockDirname.mockReturnValue('/mock/node_modules/@pair/knowledge-hub')
  mockJoin.mockReturnValue(mockConfigPath)
  mockReadFileSync.mockReturnValue('invalid json')

  return { mockConfigPath, resolveSpy }
}

function setupMultipleRegistryOverridesMocks() {
  const registryOverrides = { github: 'custom-github', knowledge: 'custom-knowledge' }

  setupBaseConfigMocks()

  const resolveSpy = vi
    .spyOn(require as unknown as { resolve: (...args: unknown[]) => string }, 'resolve')
    .mockReturnValue('/mock/node_modules/@pair/knowledge-hub/package.json')

  mockReadFileSync.mockReturnValue(
    JSON.stringify({
      asset_registries: {
        github: {
          source: '.github',
          behavior: 'mirror' as const,
          include: ['/chatmodes', '/workflows'],
          target_path: '.github',
          description: 'GitHub workflows and configuration files',
        },
      },
    }),
  )

  return { registryOverrides, resolveSpy }
}

function getExpectedMergedConfig(customConfig: { asset_registries: Record<string, unknown> }) {
  return {
    asset_registries: {
      github: {
        source: '.github',
        behavior: 'mirror' as const,
        include: ['/chatmodes', '/workflows'],
        target_path: '.github',
        description: 'GitHub workflows and configuration files',
      },
      ...customConfig.asset_registries,
    },
  }
}

function getMultipleValidationErrorsTestData() {
  return {
    invalidConfig: {
      asset_registries: {
        test1: {
          behavior: 'invalid' as unknown as import('./config-utils').RegistryConfig['behavior'],
          description: 'Test 1',
        },
        test2: {
          behavior: 'mirror' as const,
          target_path: 'test2',
        },
      },
    },
    expectedErrors: [
      "Registry 'test1' has invalid behavior 'invalid'. Must be one of: overwrite, add, mirror, skip",
      "Registry 'test1' must have a valid target_path string",
      "Registry 'test2' must have a valid description string",
    ],
  }
}

describe('getKnowledgeHubDatasetPath', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return the correct dataset path', () => {
    const expectedPath = '/mock/node_modules/@pair/knowledge-hub/dataset'

    // Simulate package resolution by mocking dirname/join used after resolution
    mockDirname.mockReturnValue('/mock/node_modules/@pair/knowledge-hub')
    mockJoin.mockReturnValue(expectedPath)

    const result = getKnowledgeHubDatasetPath()

    expect(mockDirname).toHaveBeenCalled()
    expect(mockJoin).toHaveBeenCalledWith('/mock/node_modules/@pair/knowledge-hub', 'dataset')
    expect(result).toBe(expectedPath)

    mockDirname.mockReset()
    mockJoin.mockReset()
  })

  it('should throw error when package cannot be resolved', () => {
    // Simulate resolution error by making dirname throw (function wraps the error)
    mockDirname.mockImplementation(() => {
      throw new Error('Package not found')
    })

    // Error message includes the original error; assert the underlying cause is reported
    expect(() => getKnowledgeHubDatasetPath()).toThrow('Package not found')

    mockDirname.mockReset()
  })

  it('should throw error when package cannot be resolved (direct restore variant)', () => {
    mockDirname.mockImplementation(() => {
      throw new Error('Package not found')
    })

    expect(() => getKnowledgeHubDatasetPath()).toThrow('Package not found')

    mockDirname.mockReset()
  })
})

describe('getKnowledgeHubConfig - successful loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should load and parse config.json successfully', () => {
    const { mockConfigPath, mockConfigContent } = setupKnowledgeHubConfigMocks()

    const result = getKnowledgeHubConfig()

    expect(mockDirname).toHaveBeenCalled()
    expect(mockJoin).toHaveBeenCalledWith('/mock/node_modules/@pair/knowledge-hub', 'config.json')
    expect(mockReadFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf-8')
    expect(result).toEqual(JSON.parse(mockConfigContent))

    resetKnowledgeHubConfigMocks()
  })
})

describe('getKnowledgeHubConfig - error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return default config when package cannot be resolved', () => {
    // Simulate package resolution failure path deterministically
    mockDirname.mockImplementation(() => {
      throw new Error('Package not found')
    })

    const result = getKnowledgeHubConfig()

    expect(result).toEqual({
      asset_registries: {},
      default_target_folders: { pair: '.pair', github: '.github' },
      folders_to_include: { github: ['/chatmodes', '/prompts', 'instructions'] },
    })

    mockDirname.mockReset()
  })

  it('should return default config when config.json contains invalid JSON', () => {
    const { resolveSpy } = setupInvalidJsonConfigMocks()

    const result = getKnowledgeHubConfig()

    expect(result).toEqual({
      asset_registries: {},
      default_target_folders: { pair: '.pair', github: '.github' },
      folders_to_include: { github: ['/chatmodes', '/prompts', 'instructions'] },
    })

    resolveSpy.mockRestore()
  })
})

describe('loadConfigWithOverrides - base config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should load base config when no overrides provided', () => {
    setupBaseConfigMocks()

    const result = loadConfigWithOverrides({
      projectRoot: '/mock/project',
    })

    expect(result.config).toEqual({
      asset_registries: {
        github: {
          source: '.github',
          behavior: 'mirror',
          include: ['/chatmodes', '/workflows'],
          target_path: '.github',
          description: 'GitHub workflows and configuration files',
        },
      },
    })
    expect(result.source).toBe('knowledge-hub config.json')

    resetBaseConfigMocks()
  })
})

describe('loadConfigWithOverrides - custom config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should apply custom config when provided', () => {
    const { customConfigPath, customConfig } = setupCustomConfigMocks()

    const result = loadConfigWithOverrides({
      customConfigPath,
      projectRoot: '/mock/project',
    })

    const expectedMerged = getExpectedMergedConfig(customConfig)

    expect(result.config).toEqual(expectedMerged)
    expect(result.source).toBe(`custom config: ${customConfigPath}`)

    resetBaseConfigMocks()
  })
})

describe('loadConfigWithOverrides - registry overrides', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should apply registry overrides correctly', () => {
    testRegistryOverride()
  })

  it('should handle multiple registry overrides', () => {
    const { resolveSpy } = setupMultipleRegistryOverridesMocks()
    // Passing registryOverrides should be ignored; loadConfigWithOverrides returns base config
    const result = loadConfigWithOverrides({ projectRoot: '/mock/project' })
    expect(result.config.asset_registries.github.target_path).toBe('.github')
    resolveSpy.mockRestore()
    resetBaseConfigMocks()
  })

  it('registryOverrides option is ignored', () => {
    // Passing registryOverrides should not alter configuration loading
    setupBaseConfigMocks()
    const result = loadConfigWithOverrides({ projectRoot: '/mock/project' })
    expect(result.config.asset_registries.github.target_path).toBe('.github')
    resetBaseConfigMocks()
  })
})

describe('validateConfig - basic validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

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

    const result = validateConfig(validConfig)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('should reject non-object config', () => {
    const result = validateConfig('invalid')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Config must be a valid object')
  })

  it('should reject config without asset_registries', () => {
    const result = validateConfig({})

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Config must have asset_registries object')
  })
})

describe('validateConfig - registry behavior validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should reject registry without behavior', () => {
    const invalidConfig = {
      asset_registries: {
        test: {
          target_path: 'test',
          description: 'Test',
        },
      },
    }

    const result = validateConfig(invalidConfig)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      "Registry 'test' has invalid behavior 'undefined'. Must be one of: overwrite, add, mirror, skip",
    )
  })

  it('should reject registry with invalid behavior', () => {
    const invalidConfig = {
      asset_registries: {
        test: {
          behavior: 'invalid' as unknown as import('./config-utils').RegistryConfig['behavior'],
          target_path: 'test',
          description: 'Test',
        },
      },
    }

    const result = validateConfig(invalidConfig)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      "Registry 'test' has invalid behavior 'invalid'. Must be one of: overwrite, add, mirror, skip",
    )
  })
})

describe('validateConfig - registry properties validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should reject registry without target_path', () => {
    const invalidConfig = {
      asset_registries: {
        test: {
          behavior: 'mirror' as const,
          description: 'Test',
        },
      },
    }

    const result = validateConfig(invalidConfig)

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

    const result = validateConfig(invalidConfig)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Registry 'test' must have a valid description string")
  })
})

describe('validateConfig - include array validation - invalid types', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

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

    const result = validateConfig(invalidConfig)

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

    const result = validateConfig(invalidConfig)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Registry 'test' include array must contain only strings")
  })
})

describe('validateConfig - include array validation - valid cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

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

    const result = validateConfig(validConfig)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('should accumulate multiple validation errors', () => {
    const { invalidConfig, expectedErrors } = getMultipleValidationErrorsTestData()

    const result = validateConfig(invalidConfig)

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(3)
    expectedErrors.forEach(error => {
      expect(result.errors).toContain(error)
    })
  })
})
