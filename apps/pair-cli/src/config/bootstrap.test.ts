import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InMemoryFileSystemService, MockHttpClientService } from '@pair/content-ops'
import { bootstrapEnvironment } from './bootstrap'
import * as resolver from './kb-resolver'
import { DatasetAccessError, DatasetNotFoundError } from './errors'

vi.mock('./kb-resolver', async importOriginal => {
  const actual = await importOriginal<typeof import('./kb-resolver')>()
  return {
    ...actual,
    getKnowledgeHubDatasetPath: vi.fn(),
    getKnowledgeHubDatasetPathWithFallback: vi.fn(),
  }
})

describe('config bootstrap', () => {
  const cwd = '/project'
  const version = '1.0.0'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('successfully bootstraps when local dataset exists', async () => {
    vi.mocked(resolver.getKnowledgeHubDatasetPath).mockReturnValue(`${cwd}/dataset`)
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/dataset/index.md`]: 'data',
      },
      cwd,
      cwd,
    )
    const client = new MockHttpClientService()

    await bootstrapEnvironment({
      fsService: fs,
      httpClient: client,
      version,
      kb: true,
      url: undefined,
    })

    expect(resolver.getKnowledgeHubDatasetPathWithFallback).not.toHaveBeenCalled()
  })

  it('triggers download when local dataset is missing', async () => {
    vi.mocked(resolver.getKnowledgeHubDatasetPath).mockReturnValue(`${cwd}/missing`)
    vi.mocked(resolver.getKnowledgeHubDatasetPathWithFallback).mockResolvedValue(
      `${cwd}/downloaded`,
    )

    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    const client = new MockHttpClientService()

    await expect(
      bootstrapEnvironment({
        fsService: fs,
        httpClient: client,
        version,
        kb: true,
        url: undefined,
      }),
    ).rejects.toThrow(DatasetNotFoundError)

    expect(resolver.getKnowledgeHubDatasetPathWithFallback).toHaveBeenCalled()
  })

  it('skips KB setup when kb is false', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    const client = new MockHttpClientService()

    await bootstrapEnvironment({
      fsService: fs,
      httpClient: client,
      version,
      kb: false,
      url: undefined,
    })

    expect(resolver.getKnowledgeHubDatasetPathWithFallback).not.toHaveBeenCalled()
  })

  it('throws when dataset is not readable', async () => {
    vi.mocked(resolver.getKnowledgeHubDatasetPath).mockReturnValue(`${cwd}/dataset`)
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/dataset/f.md`]: 'd',
      },
      cwd,
      cwd,
    )
    // Spy on accessSync to throw
    vi.spyOn(fs, 'accessSync').mockImplementation(() => {
      throw new Error('Permission denied')
    })
    const client = new MockHttpClientService()

    await expect(
      bootstrapEnvironment({
        fsService: fs,
        httpClient: client,
        version,
        kb: true,
        url: undefined,
      }),
    ).rejects.toThrow(DatasetAccessError)
  })

  it('skips accessibility check for local customUrl', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd) // Empty FS
    const client = new MockHttpClientService()

    await bootstrapEnvironment({
      fsService: fs,
      httpClient: client,
      version,
      kb: true,
      url: '/some/local/path', // Not starting with http
    })

    // Should pass even if FS is empty because it skips check for local customUrl
    expect(resolver.getKnowledgeHubDatasetPath).not.toHaveBeenCalled()
  })
})
