import { describe, expect, it, vi } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import {
  getKnowledgeHubDatasetPath,
  getKnowledgeHubDatasetPathWithFallback,
  resolveDatasetRoot,
} from './kb-resolver'

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

describe('resolveDatasetRoot', () => {
  const cwd = '/project'

  it('default resolution returns local dataset path', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/packages/knowledge-hub/package.json`]: '{}',
        [`${cwd}/packages/knowledge-hub/dataset/index.md`]: 'data',
      },
      cwd,
      cwd,
    )

    const result = await resolveDatasetRoot(fs, { resolution: 'default' })
    expect(result).toBe(`${cwd}/packages/knowledge-hub/dataset`)
  })

  it('remote resolution delegates to getKnowledgeHubDatasetPathWithFallback', async () => {
    // Provide local dataset so fallback resolves without network
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/packages/knowledge-hub/package.json`]: '{}',
        [`${cwd}/packages/knowledge-hub/dataset/index.md`]: 'data',
      },
      cwd,
      cwd,
    )

    const result = await resolveDatasetRoot(
      fs,
      { resolution: 'remote', url: 'https://example.com/kb.zip' },
      { cliVersion: '1.0.0' },
    )
    expect(result).toBe(`${cwd}/packages/knowledge-hub/dataset`)
  })

  it('local resolution returns path directly for directories', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    const result = await resolveDatasetRoot(fs, {
      resolution: 'local',
      path: '/external/kb-dataset',
    })
    expect(result).toBe('/external/kb-dataset')
  })

  it('local resolution with .zip calls installKBFromLocalZip', async () => {
    const kbInstaller = await import('#kb-manager/kb-installer')
    vi.spyOn(kbInstaller, 'installKBFromLocalZip').mockResolvedValue('/cached/unzipped')

    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    const result = await resolveDatasetRoot(
      fs,
      { resolution: 'local', path: '/tmp/kb.zip' },
      { cliVersion: '2.0.0' },
    )
    expect(result).toBe('/cached/unzipped')
    expect(kbInstaller.installKBFromLocalZip).toHaveBeenCalledWith('2.0.0', '/tmp/kb.zip', fs)
  })

  it('uses fallback version 0.0.0 when cliVersion not provided', async () => {
    const kbInstaller = await import('#kb-manager/kb-installer')
    vi.spyOn(kbInstaller, 'installKBFromLocalZip').mockResolvedValue('/cached/path')

    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    await resolveDatasetRoot(fs, { resolution: 'local', path: '/tmp/kb.zip' })
    expect(kbInstaller.installKBFromLocalZip).toHaveBeenCalledWith('0.0.0', '/tmp/kb.zip', fs)
  })
})
