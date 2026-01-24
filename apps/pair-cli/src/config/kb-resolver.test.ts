import { describe, expect, it, vi } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { getKnowledgeHubDatasetPath, getKnowledgeHubDatasetPathWithFallback } from './kb-resolver'

describe('kb-resolver', () => {
  const cwd = '/project'

  it('getKnowledgeHubDatasetPath finds dataset in monorepo', () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/packages/knowledge-hub/package.json`]: '{}',
        [`${cwd}/packages/knowledge-hub/dataset/index.md`]: 'data',
      },
      cwd,
      cwd,
    )

    const result = getKnowledgeHubDatasetPath(fs)
    expect(result).toBe(`${cwd}/packages/knowledge-hub/dataset`)
  })

  it('getKnowledgeHubDatasetPathWithFallback returns local if available', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/packages/knowledge-hub/package.json`]: '{}',
        [`${cwd}/packages/knowledge-hub/dataset/index.md`]: 'data',
      },
      cwd,
      cwd,
    )

    const result = await getKnowledgeHubDatasetPathWithFallback({
      fsService: fs,
      version: '1.0.0',
    })
    expect(result).toBe(`${cwd}/packages/knowledge-hub/dataset`)
  })

  it('getKnowledgeHubDatasetPathWithFallback triggers download if local missing', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    const mockEnsure = vi.fn().mockResolvedValue('/cached/path')

    const result = await getKnowledgeHubDatasetPathWithFallback({
      fsService: fs,
      version: '1.0.0',
      ensureKBAvailableFn: mockEnsure,
      isKBCachedFn: async () => false,
    })

    expect(result).toBe('/cached/path/dataset')
    expect(mockEnsure).toHaveBeenCalled()
  })
})
