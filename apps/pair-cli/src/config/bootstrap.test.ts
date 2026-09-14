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

    // The accessibility check must judge the path step 2 RESOLVED (`${cwd}/downloaded`),
    // not the bundled dataset path it probed before deciding to download.
    const failure = bootstrapEnvironment({
      fsService: fs,
      httpClient: client,
      version,
      kb: true,
    })
    await expect(failure).rejects.toThrow(DatasetNotFoundError)
    await expect(failure).rejects.toThrow(`${cwd}/downloaded`)

    expect(resolver.getKnowledgeHubDatasetPathWithFallback).toHaveBeenCalled()
  })

  /**
   * US-395 round 18 — the shape of a RELEASED install, which no other test here has.
   *
   * In a published package `@pair/knowledge-hub` is a SIBLING of `pair-cli` under
   * `node_modules/@pair/` (npm hoisting, and pnpm's flat symlink layout too), never nested
   * under the CLI's own package directory, and `postbuild.js` bundles no dataset — so
   * `getKnowledgeHubDatasetPath` THROWS rather than returning a missing path. Every fixture
   * above seeds a monorepo layout, which is why reviving the pre-flight could ship with a
   * green suite while `pair-cli install` aborted for every real user: the download populated the
   * cache slot and the final check then probed the bundled path that does not exist.
   */
  it('succeeds in a released layout, where no bundled dataset path can even be resolved', async () => {
    vi.mocked(resolver.getKnowledgeHubDatasetPath).mockImplementation(() => {
      throw new Error('Unable to find @pair/knowledge-hub package')
    })
    const slot = '/home/u/.pair/kb/1.0.0'
    vi.mocked(resolver.getKnowledgeHubDatasetPathWithFallback).mockResolvedValue(slot)

    const fs = new InMemoryFileSystemService({ [`${slot}/manifest.json`]: '{}' }, cwd, cwd)
    const client = new MockHttpClientService()

    await expect(
      bootstrapEnvironment({
        fsService: fs,
        httpClient: client,
        version,
        kb: true,
      }),
    ).resolves.toBeUndefined()
  })

  /**
   * The `--url` + `--no-kb` rejection used to be asserted HERE, on a `url` parameter this
   * function no longer takes: any named source makes the hook skip the pre-flight (round 21),
   * so a guard below the skip would never fire and the parameter could only cause a second
   * download of the source the command fetches itself. The rule now lives where the flags are
   * read — `runKbPreflight`, covered in `cli.test.ts` end to end, and in `cli-options.test.ts`
   * as a unit.
   */

  it('skips KB setup when kb is false', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    const client = new MockHttpClientService()

    await bootstrapEnvironment({
      fsService: fs,
      httpClient: client,
      version,
      kb: false,
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
      }),
    ).rejects.toThrow(DatasetAccessError)
  })

  it('warms the OFFICIAL KB only — it is given no source to warm', async () => {
    // The counterpart of the removed `url` parameter: whatever the user named, this layer
    // resolves the default dataset. A local `--url` used to return early here; it now never
    // arrives, because the hook skips the pre-flight for any named source.
    vi.mocked(resolver.getKnowledgeHubDatasetPath).mockReturnValue(`${cwd}/dataset`)
    const fs = new InMemoryFileSystemService({ [`${cwd}/dataset/index.md`]: 'data' }, cwd, cwd)
    const client = new MockHttpClientService()

    await bootstrapEnvironment({ fsService: fs, httpClient: client, version, kb: true })

    expect(vi.mocked(resolver.getKnowledgeHubDatasetPathWithFallback).mock.calls).toEqual([])
    expect(resolver.getKnowledgeHubDatasetPath).toHaveBeenCalled()
  })
})
