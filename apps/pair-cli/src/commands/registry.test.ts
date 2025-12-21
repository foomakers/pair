import { describe, it, expect, vi } from 'vitest'
import {
  loadRegistriesFromConfig,
  validateRegistries,
  calculateEffectiveTarget,
  calculateRegistryPaths,
  processAssetRegistries,
} from './registry'
import type { FileSystemService } from '@pair/content-ops'
import type { AssetRegistryConfig } from './registry'

describe('registry utilities', () => {
  describe('loadRegistriesFromConfig', () => {
    it('loads from asset_registries field', () => {
      const config = {
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror' as const,
            target_path: '.github',
            description: 'GitHub config',
          },
        },
      }

      const result = loadRegistriesFromConfig(config)

      expect(result).toEqual(config.asset_registries)
      expect(Object.keys(result)).toHaveLength(1)
    })

    it('loads from dataset_registries field (legacy)', () => {
      const config = {
        dataset_registries: {
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror' as const,
            target_path: '.pair/knowledge',
            description: 'Knowledge base',
          },
        },
      }

      const result = loadRegistriesFromConfig(config)

      expect(result).toEqual(config.dataset_registries)
    })

    it('prefers asset_registries over dataset_registries', () => {
      const config = {
        asset_registries: {
          github: { behavior: 'mirror' as const, target_path: '.github', description: 'GitHub' },
        },
        dataset_registries: {
          knowledge: {
            behavior: 'mirror' as const,
            target_path: '.pair',
            description: 'Knowledge',
          },
        },
      }

      const result = loadRegistriesFromConfig(config)

      expect(result).toEqual(config.asset_registries)
      expect(result).not.toEqual(config.dataset_registries)
    })

    it('returns empty object when no registries field exists', () => {
      const config = { other: 'value' }

      const result = loadRegistriesFromConfig(config)

      expect(result).toEqual({})
    })

    it('returns empty object for empty config', () => {
      const result = loadRegistriesFromConfig({})

      expect(result).toEqual({})
    })

    it('handles null/undefined config', () => {
      expect(loadRegistriesFromConfig(null)).toEqual({})
      expect(loadRegistriesFromConfig(undefined)).toEqual({})
    })
  })

  describe('validateRegistries', () => {
    it('validates correct registry config', () => {
      const registries: Record<string, AssetRegistryConfig> = {
        github: {
          behavior: 'mirror',
          target_path: '.github',
          description: 'GitHub config',
        },
      }

      const result = validateRegistries(registries)

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('fails when registries is empty', () => {
      const result = validateRegistries({})

      expect(result.valid).toBe(false)
      expect(result.error).toBe('no asset registries found in config')
    })

    it('fails when registries is null/undefined', () => {
      const resultNull = validateRegistries(null as unknown as Record<string, AssetRegistryConfig>)
      const resultUndef = validateRegistries(
        undefined as unknown as Record<string, AssetRegistryConfig>,
      )

      expect(resultNull.valid).toBe(false)
      expect(resultUndef.valid).toBe(false)
    })

    it('fails when registry missing target_path', () => {
      const registries = {
        github: {
          behavior: 'mirror' as const,
          description: 'GitHub config',
        },
      } as unknown as Record<string, AssetRegistryConfig>

      const result = validateRegistries(registries)

      expect(result.valid).toBe(false)
      expect(result.error).toBe("registry 'github' missing required field: target_path")
    })

    it('fails when registry missing behavior', () => {
      const registries = {
        github: {
          target_path: '.github',
          description: 'GitHub config',
        },
      } as unknown as Record<string, AssetRegistryConfig>

      const result = validateRegistries(registries)

      expect(result.valid).toBe(false)
      expect(result.error).toBe("registry 'github' missing required field: behavior")
    })

    it('validates multiple registries', () => {
      const registries: Record<string, AssetRegistryConfig> = {
        github: { behavior: 'mirror', target_path: '.github', description: 'GitHub' },
        knowledge: { behavior: 'add', target_path: '.pair/knowledge', description: 'Knowledge' },
        adoption: { behavior: 'mirror', target_path: '.pair/adoption', description: 'Adoption' },
      }

      const result = validateRegistries(registries)

      expect(result.valid).toBe(true)
    })

    it('returns first error when multiple registries invalid', () => {
      const registries = {
        github: { behavior: 'mirror' as const, description: 'GitHub' },
        knowledge: { target_path: '.pair', description: 'Knowledge' },
      } as unknown as Record<string, AssetRegistryConfig>

      const result = validateRegistries(registries)

      expect(result.valid).toBe(false)
      // Should fail on first registry (github) missing target_path
      expect(result.error).toContain('github')
      expect(result.error).toContain('target_path')
    })
  })

  describe('calculateEffectiveTarget', () => {
    const mockFs: FileSystemService = {
      resolve: vi.fn((...paths: string[]) => paths.join('/')),
    } as unknown as FileSystemService

    it('uses target_path from config', () => {
      const config: AssetRegistryConfig = {
        behavior: 'mirror',
        target_path: '.github',
        description: 'GitHub config',
      }

      const result = calculateEffectiveTarget('github', config, undefined, mockFs)

      expect(result).toBe('.github')
      expect(mockFs.resolve).toHaveBeenCalledWith('.github')
    })

    it('uses registry name when target_path is undefined', () => {
      const config = {
        behavior: 'mirror' as const,
        description: 'GitHub config',
      } as unknown as AssetRegistryConfig

      const result = calculateEffectiveTarget('github', config, undefined, mockFs)

      expect(result).toBe('github')
      expect(mockFs.resolve).toHaveBeenCalledWith('github')
    })

    it('resolves relative to baseTarget when provided', () => {
      const config: AssetRegistryConfig = {
        behavior: 'mirror',
        target_path: '.github',
        description: 'GitHub config',
      }

      const result = calculateEffectiveTarget('github', config, '/base/path', mockFs)

      expect(result).toBe('/base/path/.github')
      expect(mockFs.resolve).toHaveBeenCalledWith('/base/path', '.github')
    })

    it('handles absolute target paths', () => {
      const config: AssetRegistryConfig = {
        behavior: 'mirror',
        target_path: '/absolute/path/.github',
        description: 'GitHub config',
      }

      const result = calculateEffectiveTarget('github', config, undefined, mockFs)

      expect(result).toBe('/absolute/path/.github')
    })
  })

  describe('calculateRegistryPaths', () => {
    const mockFs: FileSystemService = {
      resolve: vi.fn((...paths: string[]) => paths.join('/')),
    } as unknown as FileSystemService

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('calculates source and target paths', () => {
      const config: AssetRegistryConfig = {
        behavior: 'mirror',
        target_path: '.github',
        description: 'GitHub config',
      }

      const result = calculateRegistryPaths({
        registryName: 'github',
        registryConfig: config,
        datasetRoot: '/dataset',
        baseTarget: undefined,
        fsService: mockFs,
      })

      expect(result.source).toBe('/dataset/github')
      expect(result.target).toBe('.github')
      expect(mockFs.resolve).toHaveBeenCalledWith('/dataset', 'github')
      expect(mockFs.resolve).toHaveBeenCalledWith('.github')
    })

    it('uses baseTarget for target resolution', () => {
      const config: AssetRegistryConfig = {
        behavior: 'mirror',
        target_path: '.github',
        description: 'GitHub config',
      }

      const result = calculateRegistryPaths({
        registryName: 'github',
        registryConfig: config,
        datasetRoot: '/dataset',
        baseTarget: '/install/base',
        fsService: mockFs,
      })

      expect(result.source).toBe('/dataset/github')
      expect(result.target).toBe('/install/base/.github')
      expect(mockFs.resolve).toHaveBeenCalledWith('/install/base', '.github')
    })

    it('handles missing target_path', () => {
      const config = {
        behavior: 'mirror' as const,
        description: 'GitHub config',
      } as unknown as AssetRegistryConfig

      const result = calculateRegistryPaths({
        registryName: 'myRegistry',
        registryConfig: config,
        datasetRoot: '/dataset',
        baseTarget: undefined,
        fsService: mockFs,
      })

      expect(result.source).toBe('/dataset/myRegistry')
      expect(result.target).toBe('myRegistry')
    })

    it('normalizes paths correctly', () => {
      const mockFsWithNormalization: FileSystemService = {
        resolve: vi.fn((...paths: string[]) => {
          // Join paths and normalize slashes
          return paths.join('/').replace(/\/+/g, '/')
        }),
      } as unknown as FileSystemService

      const config: AssetRegistryConfig = {
        behavior: 'add' as const,
        target_path: '.pair/knowledge',
        description: 'Knowledge config',
      }

      const result = calculateRegistryPaths({
        registryName: 'knowledge',
        registryConfig: config,
        datasetRoot: '/dataset/',
        baseTarget: '/base/',
        fsService: mockFsWithNormalization,
      })

      expect(result.source).toBe('/dataset/knowledge')
      expect(result.target).toBe('/base/.pair/knowledge')
    })
  })

  describe('processAssetRegistries', () => {
    it('processes single registry', async () => {
      const registries: Record<string, AssetRegistryConfig> = {
        github: { behavior: 'mirror', target_path: '.github', description: 'GitHub' },
      }

      const handler = vi.fn().mockResolvedValue('result1')

      const results = await processAssetRegistries(registries, handler)

      expect(results).toEqual(['result1'])
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith('github', registries.github, 0)
    })

    it('processes multiple registries in order', async () => {
      const registries: Record<string, AssetRegistryConfig> = {
        github: { behavior: 'mirror', target_path: '.github', description: 'GitHub' },
        knowledge: { behavior: 'add', target_path: '.pair/knowledge', description: 'Knowledge' },
        adoption: { behavior: 'mirror', target_path: '.pair/adoption', description: 'Adoption' },
      }

      const handler = vi
        .fn()
        .mockImplementation((name: string) => Promise.resolve(`result-${name}`))

      const results = await processAssetRegistries(registries, handler)

      expect(results).toEqual(['result-github', 'result-knowledge', 'result-adoption'])
      expect(handler).toHaveBeenCalledTimes(3)
      expect(handler).toHaveBeenNthCalledWith(1, 'github', registries.github, 0)
      expect(handler).toHaveBeenNthCalledWith(2, 'knowledge', registries.knowledge, 1)
      expect(handler).toHaveBeenNthCalledWith(3, 'adoption', registries.adoption, 2)
    })

    it('propagates handler errors', async () => {
      const registries: Record<string, AssetRegistryConfig> = {
        github: { behavior: 'mirror', target_path: '.github', description: 'GitHub' },
      }

      const error = new Error('handler failed')
      const handler = vi.fn().mockRejectedValue(error)

      await expect(processAssetRegistries(registries, handler)).rejects.toThrow('handler failed')
    })

    it('handles empty registries', async () => {
      const handler = vi.fn()

      const results = await processAssetRegistries({}, handler)

      expect(results).toEqual([])
      expect(handler).not.toHaveBeenCalled()
    })

    it('provides correct index to handler', async () => {
      const registries: Record<string, AssetRegistryConfig> = {
        first: { behavior: 'mirror', target_path: '1', description: '1' },
        second: { behavior: 'mirror', target_path: '2', description: '2' },
        third: { behavior: 'mirror', target_path: '3', description: '3' },
      }

      const indexes: number[] = []
      const handler = vi.fn().mockImplementation((_name, _config, index: number) => {
        indexes.push(index)
        return Promise.resolve(index)
      })

      await processAssetRegistries(registries, handler)

      expect(indexes).toEqual([0, 1, 2])
    })

    it('collects all handler results', async () => {
      const registries: Record<string, AssetRegistryConfig> = {
        one: { behavior: 'mirror', target_path: '1', description: '1' },
        two: { behavior: 'add', target_path: '2', description: '2' },
      }

      const handler = vi
        .fn()
        .mockImplementation((name: string) => Promise.resolve({ name, processed: true }))

      const results = await processAssetRegistries(registries, handler)

      expect(results).toEqual([
        { name: 'one', processed: true },
        { name: 'two', processed: true },
      ])
    })
  })
})
