import { describe, it, expect, vi } from 'vitest'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import {
  InMemoryFileSystemService,
  MockHttpClientService,
  buildTestResponse,
  toIncomingMessage,
} from '@pair/content-ops'
import { installKB, installKBFromGit, installKBFromLocalZip } from './kb-installer'
import { getSourceCachePath } from './cache-slot-key'
import * as gitClone from './git-clone'

// A local source owns a slot keyed by its own identity, not by the CLI version (US-395)
const zipSlot = (path: string) => getSourceCachePath({ kind: 'zip', path })

describe('KB Installer', () => {
  it('downloads and installs when checksum absent', async () => {
    vi.clearAllMocks()
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const version = '0.2.0'
    const cachePath = join(homedir(), '.pair', 'kb', version)
    const downloadUrl = `https://github.com/foomakers/pair/releases/download/v${version}/knowledge-base-${version}.zip`
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    // Mock fs.extractZip to simulate extraction
    vi.spyOn(fs, 'extractZip').mockImplementation(async (_zipPath, targetPath) => {
      await fs.writeFile(join(targetPath, 'manifest.json'), JSON.stringify({ version }))
    })

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp]) // file first, checksum second

    const result = await installKB(version, cachePath, downloadUrl, {
      httpClient,
      fs,
    })

    expect(result).toBe(cachePath)
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('KB not found, downloading v0.2.0 from GitHub'),
    )
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✅ KB v0.2.0 installed'))

    consoleLogSpy.mockRestore()
  })

  /**
   * US-395 review round 5: `installKB` serves the OFFICIAL release AND `--url <remote zip>`,
   * so a staging file named after the CLI version alone is shared by two different sources
   * at the same version — the exact keying this story abolishes, one layer lower.
   *
   * It is not merely a concurrency window: `resume-manager.shouldResume()` decides to resume
   * from the existence and SIZE of `<staging>.partial` alone, with no binding to the URL
   * that produced those bytes, and then issues `Range: bytes=<n>-` against the NEW url. An
   * interrupted official download followed by `pair install --url https://acme…/kb.zip` at
   * the same CLI version would append the acme body onto the official KB's bytes and
   * finalize the hybrid as one archive.
   */
  it('stages a download under a name keyed by the source URL, not by the CLI version alone', async () => {
    const version = '0.2.0'
    const staged: string[] = []

    const stageOne = async (downloadUrl: string): Promise<void> => {
      const fs = new InMemoryFileSystemService({}, '/', '/')
      vi.spyOn(fs, 'extractZip').mockImplementation(async (zipPath, targetPath) => {
        staged.push(zipPath)
        await fs.writeFile(join(targetPath, 'manifest.json'), JSON.stringify({ version }))
      })
      const httpClient = new MockHttpClientService()
      httpClient.setRequestResponses([
        toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' })),
      ])
      httpClient.setGetResponses([
        toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data')),
        toIncomingMessage(buildTestResponse(404)),
      ])
      await installKB(version, getSourceCachePath({ kind: 'remote', url: downloadUrl }), downloadUrl, {
        httpClient,
        fs,
      })
    }

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await stageOne(
      `https://github.com/foomakers/pair/releases/download/v${version}/knowledge-base-${version}.zip`,
    )
    await stageOne('https://acme.example/acme-kb.zip')
    consoleLogSpy.mockRestore()

    expect(staged).toHaveLength(2)
    // Two sources, two staging files — neither is the version-keyed path they used to share
    expect(staged[0]).not.toBe(staged[1])
    expect(staged).not.toContain(join(tmpdir(), `kb-${version}.zip`))
  })

  it('preserves extraction errors and cleans up zip', async () => {
    vi.clearAllMocks()

    const version = '0.2.0'
    const cachePath = join(homedir(), '.pair', 'kb', version)
    const downloadUrl = `https://github.com/foomakers/pair/releases/download/v${version}/knowledge-base-${version}.zip`
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    // Mock fs.extractZip to throw error
    vi.spyOn(fs, 'extractZip').mockRejectedValue(new Error('Invalid zip'))

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp]) // file first, checksum second

    await expect(async () => {
      await installKB(version, cachePath, downloadUrl, { httpClient, fs })
    }).rejects.toThrow(/invalid zip/i)
  })

  it('downloaded install returns cachePath (not .pair subfolder) after extract', async () => {
    vi.clearAllMocks()

    const version = '0.3.0'
    const cachePath = join(homedir(), '.pair', 'kb', version)
    const downloadUrl = `https://github.com/foomakers/pair/releases/download/v${version}/knowledge-base-${version}.zip`
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    // Mock fs.extractZip to simulate extraction with .pair directory
    vi.spyOn(fs, 'extractZip').mockImplementation(async (_zipPath, targetPath) => {
      await fs.writeFile(join(targetPath, '.pair', 'knowledge', 'installed.md'), 'ok')
      await fs.writeFile(join(targetPath, 'manifest.json'), JSON.stringify({ version }))
    })

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp]) // file first, checksum second

    const result = await installKB(version, cachePath, downloadUrl, {
      httpClient,
      fs,
    })

    expect(result).toBe(cachePath)
  })

  /**
   * US-395 review round 3: `installKB` serves the official download AND `--url <remote zip>`.
   * The local-ZIP path unwraps an archive whose content sits under a single root directory
   * (`normalizeExtractedKB`); this one did not, so an external KB packaged that way gave a
   * dataset root one level too high — inside the source-identity model this story defines.
   */
  it('unwraps a downloaded ZIP nested under a single root directory', async () => {
    const version = '0.4.3'
    const downloadUrl = 'https://acme.example.com/acme-kb.zip'
    const cachePath = getSourceCachePath({ kind: 'remote', url: downloadUrl })
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    vi.spyOn(fs, 'extractZip').mockImplementation(async (_zipPath, targetPath) => {
      await fs.writeFile(join(targetPath, 'acme-kb-1.0.0', 'manifest.json'), '{"name":"acme-kb"}')
      await fs.writeFile(join(targetPath, 'acme-kb-1.0.0', '.pair', 'knowledge', 'a.md'), '# a')
    })

    httpClient.setRequestResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' })),
    ])
    httpClient.setGetResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data')),
      toIncomingMessage(buildTestResponse(404)),
    ])

    const result = await installKB(version, cachePath, downloadUrl, { httpClient, fs })

    expect(result).toBe(cachePath)
    expect(fs.existsSync(join(cachePath, '.pair', 'knowledge', 'a.md'))).toBe(true)
    expect(fs.existsSync(join(cachePath, 'acme-kb-1.0.0'))).toBe(false)
  })
})

/**
 * US-395 review round 3 — the ADL's invariant "a slot is never deleted before its
 * replacement is in hand" must hold for the git path too: it purged the slot and only then
 * cloned, and `cloneGitRepo` rm -rf's the destination on failure, so an offline/auth error
 * left the user with an empty slot where a working clone had been.
 */
describe('KB Installer - installKBFromGit', () => {
  it('keeps the previous clone when the new clone fails', async () => {
    const url = 'https://github.com/acme/kb.git#v1.0.0'
    const slot = getSourceCachePath({ kind: 'git', url })
    const fs = new InMemoryFileSystemService(
      {
        [join(slot, 'manifest.json')]: '{"name":"acme-kb"}',
        [join(slot, '.pair', 'knowledge', 'index.md')]: '# working clone',
      },
      '/',
      '/',
    )

    vi.spyOn(gitClone, 'cloneGitRepo').mockImplementation(() => {
      throw new Error('Git clone failed: network unreachable')
    })

    await expect(installKBFromGit(url, fs)).rejects.toThrow(/Git clone failed/)

    expect(await fs.readFile(join(slot, '.pair', 'knowledge', 'index.md'))).toBe('# working clone')
    expect(fs.existsSync(`${slot}.bak`)).toBe(false)
  })

  it('replaces the slot wholesale on a successful clone, leaving no backup behind', async () => {
    const url = 'https://github.com/acme/kb.git'
    const slot = getSourceCachePath({ kind: 'git', url })
    const fs = new InMemoryFileSystemService(
      { [join(slot, '.pair', 'knowledge', 'stale.md')]: '# from a previous clone' },
      '/',
      '/',
    )

    vi.spyOn(gitClone, 'cloneGitRepo').mockImplementation(() => {})

    const result = await installKBFromGit(url, fs)

    expect(result).toBe(slot)
    expect(fs.existsSync(join(slot, '.pair', 'knowledge', 'stale.md'))).toBe(false)
    expect(fs.existsSync(`${slot}.bak`)).toBe(false)
  })

  /**
   * Same invariant as `ensureKBAvailable`: discarding the set-aside clone happens after the
   * new clone is on disk, so its failure must not reach the `catch` that RESTORES the old
   * one — that would delete the fresh clone and reinstate the stale one over an unrelated
   * fs error (EPERM/EBUSY on a just-renamed tree).
   */
  it('keeps a successful clone when discarding the set-aside one fails', async () => {
    const url = 'https://github.com/acme/kb.git#v2.0.0'
    const slot = getSourceCachePath({ kind: 'git', url })
    const fs = new InMemoryFileSystemService(
      {
        [join(slot, 'manifest.json')]: '{"name":"acme-kb"}',
        [join(slot, '.pair', 'knowledge', 'stale.md')]: '# from a previous clone',
      },
      '/',
      '/',
    )

    let cloned = false
    vi.spyOn(gitClone, 'cloneGitRepo').mockImplementation(() => {
      // `cloneGitRepo` is synchronous; the in-memory write lands before the promise settles
      void fs.writeFile(join(slot, '.pair', 'knowledge', 'fresh.md'), '# fresh clone')
      cloned = true
    })

    const realRm = fs.rm.bind(fs)
    vi.spyOn(fs, 'rm').mockImplementation(async (path, options) => {
      if (cloned && path.endsWith('.bak')) {
        throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
      }
      return realRm(path, options)
    })

    const result = await installKBFromGit(url, fs)

    expect(result).toBe(slot)
    expect(await fs.readFile(join(slot, '.pair', 'knowledge', 'fresh.md'))).toBe('# fresh clone')
    expect(fs.existsSync(join(slot, '.pair', 'knowledge', 'stale.md'))).toBe(false)
  })

  /**
   * Round 5, the RESTORE half of the same invariant: the restore runs inside the `catch`,
   * so if it throws, its fs error REPLACES the actionable one the user needs ("Git clone
   * failed: network unreachable"). A cleanup must not undo the work it follows — and it
   * must not hide why that work failed either.
   */
  it('reports the clone failure, not a failure of the restore that follows it', async () => {
    const url = 'https://github.com/acme/kb.git#v3.0.0'
    const slot = getSourceCachePath({ kind: 'git', url })
    const fs = new InMemoryFileSystemService(
      {
        [join(slot, 'manifest.json')]: '{"name":"acme-kb"}',
        [join(slot, '.pair', 'knowledge', 'index.md')]: '# working clone',
      },
      '/',
      '/',
    )

    vi.spyOn(gitClone, 'cloneGitRepo').mockImplementation(() => {
      throw new Error('Git clone failed: network unreachable')
    })
    const realRm = fs.rm.bind(fs)
    vi.spyOn(fs, 'rm').mockImplementation(async (path, options) => {
      // the recursive delete of the half-written slot, inside the restore, fails
      if (path === slot) {
        throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
      }
      return realRm(path, options)
    })

    let err: Error | undefined
    try {
      await installKBFromGit(url, fs)
    } catch (e) {
      err = e as Error
    }

    expect(err?.message).toMatch(/Git clone failed/)
    expect(err?.message).not.toMatch(/EBUSY/)
  })
})

describe('KB Installer - installKBFromLocalZip', () => {
  it('should install KB from absolute path local ZIP and return cachePath', async () => {
    // Arrange
    const version = '0.2.0'
    const zipPath = '/absolute/path/kb.zip'
    const expectedCachePath = zipSlot(zipPath)

    // Create valid ZIP content in InMemoryFS format (JSON serialized)
    const zipContent = {
      '.pair/knowledge/test.md': 'extracted content',
      'manifest.json': JSON.stringify({ version: '0.2.0' }),
    }

    const fs = new InMemoryFileSystemService(
      {
        [zipPath]: JSON.stringify(zipContent), // Valid ZIP format for InMemoryFS
      },
      '/',
      '/',
    )

    // Act - uses real fs.extractZip, no mock needed!
    const result = await installKBFromLocalZip(version, zipPath, fs, true)

    // Assert — datasetRoot must be cachePath, not cachePath/.pair
    expect(result).toBe(expectedCachePath)
    expect(await fs.exists(join(expectedCachePath, '.pair', 'knowledge', 'test.md'))).toBe(true)
  })

  it('should install KB from relative path local ZIP', async () => {
    // Arrange
    const version = '0.2.0'
    const zipPath = './downloads/kb.zip'
    // relative paths resolve against the INJECTED cwd ('/'), not process.cwd()
    const resolvedZipPath = '/downloads/kb.zip'
    const expectedCachePath = zipSlot(resolvedZipPath)

    // Create valid ZIP content
    const zipContent = {
      'AGENTS.md': 'extracted content',
      'manifest.json': JSON.stringify({ version: '0.2.0' }),
    }

    const fs = new InMemoryFileSystemService(
      {
        [resolvedZipPath]: JSON.stringify(zipContent),
      },
      '/',
      '/',
    )

    // Act - uses real fs.extractZip
    const result = await installKBFromLocalZip(version, zipPath, fs, true)

    // Assert
    expect(result).toBe(expectedCachePath)
    expect(await fs.exists(join(expectedCachePath, 'AGENTS.md'))).toBe(true)
  })

  it('should throw error if ZIP file does not exist', async () => {
    // Arrange
    const version = '0.2.0'
    const zipPath = '/nonexistent/kb.zip'
    const fs = new InMemoryFileSystemService({}, '/', '/')

    // Act & Assert
    await expect(installKBFromLocalZip(version, zipPath, fs)).rejects.toThrow(
      'ZIP file not found: /nonexistent/kb.zip',
    )
  })

  it('should validate KB structure after extraction', async () => {
    // Arrange
    const version = '0.2.0'
    const zipPath = '/path/kb.zip'

    // Create empty ZIP (no KB structure files)
    const zipContent = {} // Empty ZIP = invalid structure

    const fs = new InMemoryFileSystemService(
      {
        [zipPath]: JSON.stringify(zipContent),
      },
      '/',
      '/',
    )

    // Act & Assert - real extractZip extracts nothing, validation fails
    await expect(installKBFromLocalZip(version, zipPath, fs, true)).rejects.toThrow(
      'Invalid KB structure',
    )
  })

  it('should handle ZIP with single root directory containing KB structure and return cachePath', async () => {
    // Arrange - Simulates ZIP created by `pair package` which has .zip-temp/ root
    const version = '0.2.0'
    const zipPath = '/path/kb.zip'
    const cachePath = zipSlot(zipPath)

    // Create valid ZIP with .zip-temp root directory structure
    const zipContent = {
      '.zip-temp/.pair/knowledge/test.md': 'test content',
      '.zip-temp/manifest.json': JSON.stringify({ version: '0.2.0' }),
    }

    const fs = new InMemoryFileSystemService(
      {
        [zipPath]: JSON.stringify(zipContent),
      },
      '/',
      '/',
    )

    // Act - uses real fs.extractZip
    const result = await installKBFromLocalZip(version, zipPath, fs, true)

    // Assert — datasetRoot must be cachePath, not cachePath/.pair
    expect(result).toBe(cachePath)
    expect(fs.existsSync(`${cachePath}/.pair/knowledge/test.md`)).toBe(true)
    expect(fs.existsSync(`${cachePath}/manifest.json`)).toBe(true)
  })

  it('should reject when ZIP contains only manifest.json at root', async () => {
    // Arrange
    const version = '0.2.0'
    const zipPath = '/path/manifest-only.zip'
    const fs = new InMemoryFileSystemService(
      {
        // ZIP that extracts to manifest.json only
        [zipPath]: JSON.stringify({ 'manifest.json': '{}' }),
      },
      '/',
      '/',
    )

    // Act & Assert
    await expect(installKBFromLocalZip(version, zipPath, fs, true)).rejects.toThrow(
      'Invalid KB structure',
    )
  })

  it('should accept when ZIP contains manifest.json and another file at root', async () => {
    // Arrange
    const version = '0.2.0'
    const zipPath = '/path/manifest-plus.zip'
    const cachePath = zipSlot(zipPath)

    // Pre-populate extraction output so extractZip (test path) results in both files
    const fs = new InMemoryFileSystemService(
      {
        // ZIP exists (content not used by extract when fs param is provided),
        [zipPath]: JSON.stringify({ 'manifest.json': '{}', 'AGENTS.md': 'agents' }),
        // Simulate extraction output already present
        [`${cachePath}/manifest.json`]: '{}',
        [`${cachePath}/AGENTS.md`]: 'agents',
      },
      '/',
      '/',
    )

    // Act
    const result = await installKBFromLocalZip(version, zipPath, fs, true)

    // Assert
    expect(result).toBe(cachePath)
    expect(fs.existsSync(`${cachePath}/manifest.json`)).toBe(true)
    expect(fs.existsSync(`${cachePath}/AGENTS.md`)).toBe(true)
  })

  it('should reject when ZIP has a single root directory (.zip-temp) containing only manifest.json', async () => {
    // Arrange - simulate .zip-temp with only manifest.json
    const version = '0.2.0'
    const zipPath = '/path/ziptemp-manifest-only.zip'
    const fs = new InMemoryFileSystemService(
      {
        [zipPath]: JSON.stringify({ '.zip-temp/manifest.json': '{}' }),
      },
      '/',
      '/',
    )

    // Act & Assert
    await expect(installKBFromLocalZip(version, zipPath, fs, true)).rejects.toThrow(
      'Invalid KB structure',
    )
  })
})

/**
 * BUG #05: auto-download KB path coverage
 *
 * The remote download path (installKB) was never exercised in the release binary
 * because the dataset was embedded. With Bug #01 fix (removed INCLUDE_DATASET),
 * download becomes the primary path. These tests ensure it handles errors correctly.
 */
describe('BUG #05: installKB remote download error handling', () => {
  it('should fail with clear error on HTTP 404 (release not found)', async () => {
    vi.clearAllMocks()

    const version = '0.4.1'
    const cachePath = join(homedir(), '.pair', 'kb', version)
    const downloadUrl = `https://github.com/foomakers/pair/releases/download/v${version}/knowledge-base-${version}.zip`
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '0' }))
    const fileResp = toIncomingMessage(buildTestResponse(404))

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp])

    await expect(installKB(version, cachePath, downloadUrl, { httpClient, fs })).rejects.toThrow(
      /http|404|download/i,
    )
  })

  it('should fail with clear error on corrupted zip', async () => {
    vi.clearAllMocks()

    const version = '0.4.1'
    const cachePath = join(homedir(), '.pair', 'kb', version)
    const downloadUrl = `https://github.com/foomakers/pair/releases/download/v${version}/knowledge-base-${version}.zip`
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    // extractZip fails because content is not a real zip
    vi.spyOn(fs, 'extractZip').mockRejectedValue(new Error('Corrupted zip'))

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'not a real zip'),
    )

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])

    await expect(installKB(version, cachePath, downloadUrl, { httpClient, fs })).rejects.toThrow(
      /corrupted zip/i,
    )
  })

  it('should fail with checksum mismatch when hash does not match', async () => {
    vi.clearAllMocks()

    const version = '0.4.1'
    const cachePath = join(homedir(), '.pair', 'kb', version)
    const downloadUrl = `https://github.com/foomakers/pair/releases/download/v${version}/knowledge-base-${version}.zip`
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    vi.spyOn(fs, 'extractZip').mockImplementation(async () => {})

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )
    // Return a checksum file with a hash that won't match the downloaded content
    const checksumResp = toIncomingMessage(
      buildTestResponse(
        200,
        {},
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  knowledge-base-0.4.1.zip',
      ),
    )

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])

    await expect(installKB(version, cachePath, downloadUrl, { httpClient, fs })).rejects.toThrow(
      /checksum/i,
    )
  })
})

/**
 * BUG #02: datasetRoot resolution — must return cachePath, NOT cachePath/.pair
 *
 * When the extracted/copied KB contains root-level registries (.github, AGENTS.md, .skills)
 * alongside .pair/, the datasetRoot must be cachePath so ALL registries are resolvable.
 * Currently all three install functions append .pair when it exists, making 3/5 registries
 * unreachable (they'd resolve to cachePath/.pair/.github which doesn't exist).
 */
describe('BUG #02: datasetRoot must NOT append .pair — all registries must be resolvable', () => {
  it('installKBFromLocalZip returns cachePath when ZIP has root-level registries beside .pair/', async () => {
    const version = '0.4.1'
    const zipPath = '/path/kb-full.zip'
    const cachePath = zipSlot(zipPath)

    // Full dataset structure matching real knowledge-base-0.4.1.zip
    const zipContent = {
      '.pair/knowledge/guidelines/testing.md': '# Testing',
      '.pair/adoption/tech/tech-stack.md': '# Tech Stack',
      '.github/workflows/ci.yml': 'name: CI',
      'AGENTS.md': '# AGENTS',
      '.skills/capability/next/SKILL.md': '# /next',
      'manifest.json': JSON.stringify({ version }),
    }

    const fs = new InMemoryFileSystemService({ [zipPath]: JSON.stringify(zipContent) }, '/', '/')

    const result = await installKBFromLocalZip(version, zipPath, fs, true)

    // datasetRoot must be cachePath (NOT cachePath/.pair)
    expect(result).toBe(cachePath)

    // All 5 registries must be accessible from datasetRoot
    expect(fs.existsSync(join(result, '.pair', 'knowledge'))).toBe(true)
    expect(fs.existsSync(join(result, '.pair', 'adoption'))).toBe(true)
    expect(fs.existsSync(join(result, '.github'))).toBe(true)
    expect(fs.existsSync(join(result, 'AGENTS.md'))).toBe(true)
    expect(fs.existsSync(join(result, '.skills'))).toBe(true)
  })

  it('installKB (remote download) returns cachePath when extract has root-level registries beside .pair/', async () => {
    vi.clearAllMocks()

    const version = '0.4.1'
    const cachePath = join(homedir(), '.pair', 'kb', version)
    const downloadUrl = `https://github.com/foomakers/pair/releases/download/v${version}/knowledge-base-${version}.zip`
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const httpClient = new MockHttpClientService()

    vi.spyOn(fs, 'extractZip').mockImplementation(async (_zipPath, targetPath) => {
      await fs.writeFile(join(targetPath, '.pair', 'knowledge', 'test.md'), '# Test')
      await fs.writeFile(join(targetPath, '.github', 'ci.yml'), 'ci')
      await fs.writeFile(join(targetPath, 'AGENTS.md'), '# AGENTS')
      await fs.writeFile(join(targetPath, '.skills', 'next', 'SKILL.md'), '# /next')
      await fs.writeFile(join(targetPath, 'manifest.json'), JSON.stringify({ version }))
    })

    const headResponse = toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }))
    const checksumResp = toIncomingMessage(buildTestResponse(404))
    const fileResp = toIncomingMessage(
      buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data'),
    )

    httpClient.setRequestResponses([headResponse])
    httpClient.setGetResponses([fileResp, checksumResp])

    const result = await installKB(version, cachePath, downloadUrl, { httpClient, fs })

    expect(result).toBe(cachePath)
    expect(fs.existsSync(join(result, '.pair', 'knowledge'))).toBe(true)
    expect(fs.existsSync(join(result, '.github'))).toBe(true)
    expect(fs.existsSync(join(result, 'AGENTS.md'))).toBe(true)
    expect(fs.existsSync(join(result, '.skills'))).toBe(true)
  })
})

/**
 * US-395: `install --source <zip>` used to extract an external KB into the OFFICIAL KB's
 * version-keyed slot (~/.pair/kb/<cliVersion>/), rewriting its manifest.json and
 * contaminating the shared cache of every other project on the machine.
 */
describe('US-395: an external source never lands in the official KB cache slot', () => {
  const OFFICIAL_MANIFEST = JSON.stringify({ name: 'knowledge-base', version: '0.4.3' })

  function populatedOfficialCache(version: string, extra: Record<string, string>) {
    const officialSlot = join(homedir(), '.pair', 'kb', version)
    return new InMemoryFileSystemService(
      {
        [`${officialSlot}/manifest.json`]: OFFICIAL_MANIFEST,
        [`${officialSlot}/.pair/knowledge/guidelines/testing.md`]: '# official testing guideline',
        [`${officialSlot}/getting-started.md`]: '# official getting started',
        ...extra,
      },
      '/',
      '/',
    )
  }

  it('leaves the official slot and its manifest untouched when installing an external ZIP (AC1)', async () => {
    const version = '0.4.3'
    const officialSlot = join(homedir(), '.pair', 'kb', version)
    const zipPath = '/downloads/acme-kb-1.0.0.zip'
    const fs = populatedOfficialCache(version, {
      [zipPath]: JSON.stringify({
        'manifest.json': JSON.stringify({ name: 'acme-kb', version: '1.0.0' }),
        '.pair/knowledge/acme.md': '# acme',
      }),
    })

    const result = await installKBFromLocalZip(version, zipPath, fs, true)

    expect(result).not.toBe(officialSlot)
    expect(await fs.readFile(`${officialSlot}/manifest.json`)).toBe(OFFICIAL_MANIFEST)
    expect(fs.existsSync(`${officialSlot}/.pair/knowledge/guidelines/testing.md`)).toBe(true)
  })

  it('installs only what the external ZIP ships — no official-KB files mixed in (AC2)', async () => {
    const version = '0.4.3'
    const officialSlot = join(homedir(), '.pair', 'kb', version)
    const zipPath = '/downloads/acme-kb-1.0.0.zip'
    const fs = populatedOfficialCache(version, {
      [zipPath]: JSON.stringify({
        'manifest.json': JSON.stringify({ name: 'acme-kb', version: '1.0.0' }),
        '.pair/knowledge/acme.md': '# acme',
      }),
    })

    const result = await installKBFromLocalZip(version, zipPath, fs, true)

    expect(fs.existsSync(join(result, '.pair', 'knowledge', 'acme.md'))).toBe(true)
    expect(fs.existsSync(join(result, 'getting-started.md'))).toBe(false)
    expect(fs.existsSync(join(result, '.pair', 'knowledge', 'guidelines', 'testing.md'))).toBe(
      false,
    )
    expect(result.startsWith(officialSlot)).toBe(false)
  })

  it('re-installing the same source replaces the slot instead of merging stale files', async () => {
    const version = '0.4.3'
    const zipPath = '/downloads/acme-kb.zip'
    const fs = new InMemoryFileSystemService(
      {
        [zipPath]: JSON.stringify({
          'manifest.json': JSON.stringify({ name: 'acme-kb', version: '2.0.0' }),
          '.pair/knowledge/new.md': '# new',
        }),
      },
      '/',
      '/',
    )

    const firstSlot = await installKBFromLocalZip(version, zipPath, fs, true)
    await fs.writeFile(join(firstSlot, '.pair', 'knowledge', 'stale.md'), '# from a previous KB')

    const secondSlot = await installKBFromLocalZip(version, zipPath, fs, true)

    expect(secondSlot).toBe(firstSlot)
    expect(fs.existsSync(join(secondSlot, '.pair', 'knowledge', 'stale.md'))).toBe(false)
    expect(fs.existsSync(join(secondSlot, '.pair', 'knowledge', 'new.md'))).toBe(true)
  })

  it('gives two different external ZIPs two different slots (AC4)', async () => {
    const version = '0.4.3'
    const zipA = '/team-a/dist/kb-1.0.0.zip'
    const zipB = '/team-b/dist/kb-1.0.0.zip'
    const payload = (name: string) =>
      JSON.stringify({
        'manifest.json': JSON.stringify({ name, version: '1.0.0' }),
        '.pair/knowledge/index.md': `# ${name}`,
      })
    const fs = new InMemoryFileSystemService(
      { [zipA]: payload('kb-a'), [zipB]: payload('kb-b') },
      '/',
      '/',
    )

    const slotA = await installKBFromLocalZip(version, zipA, fs, true)
    const slotB = await installKBFromLocalZip(version, zipB, fs, true)

    expect(slotA).not.toBe(slotB)
    expect(await fs.readFile(join(slotA, '.pair', 'knowledge', 'index.md'))).toBe('# kb-a')
    expect(await fs.readFile(join(slotB, '.pair', 'knowledge', 'index.md'))).toBe('# kb-b')
  })
})
