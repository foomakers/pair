import { describe, expect, beforeEach, vi, test } from 'vitest'
import { handleUpdateCommand } from './handler'
import type { UpdateCommandConfig } from './parser'
import { InMemoryFileSystemService, MockHttpClientService } from '@pair/content-ops'

describe('handleUpdateCommand - integration with in-memory services', () => {
  let fs: InMemoryFileSystemService
  let httpClient: MockHttpClientService

  const cwd = '/project'
  const datasetSrc = '/project/packages/knowledge-hub/dataset' // Match discovery logic

  beforeEach(() => {
    // Setup initial FS state
    fs = new InMemoryFileSystemService(
      {
        // package.json for discovery
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        // packages/knowledge-hub/package.json for monorepo discovery
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        // Config file
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            'test-registry': {
              source: 'test-registry',
              behavior: 'mirror',
              targets: [{ path: '.pair/test-registry', mode: 'canonical' }],
              description: 'Test registry',
            },
          },
        }),
        // Source files in dataset
        [`${datasetSrc}/test-registry/file1.md`]: '# New Content',
        [`${datasetSrc}/test-registry/nested/file2.md`]: '# Nested New Content',
        // Existing files in project (for update/backup verification)
        [`${cwd}/.pair/test-registry/file1.md`]: '# Old Content',
      },
      cwd, // Root module dir (simulated)
      cwd, // CWD
    )

    httpClient = new MockHttpClientService()
    vi.restoreAllMocks()
  })

  test('successfully updates registry from default source', async () => {
    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(config, fs, { httpClient })

    // Verify update happened
    const content = await fs.readFile(`${cwd}/.pair/test-registry/file1.md`)
    expect(content).toBe('# New Content')

    // Verify nested file creation
    const nestedContent = await fs.readFile(`${cwd}/.pair/test-registry/nested/file2.md`)
    expect(nestedContent).toBe('# Nested New Content')
  })

  test('creates backup before update when persistBackup is true', async () => {
    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(config, fs, { httpClient, persistBackup: true })

    // Verify backup existence
    const backupsDir = `${cwd}/.pair/backups`
    const backupSessions = await fs.readdir(backupsDir)
    expect(backupSessions.length).toBeGreaterThan(0)

    const sessionDir = backupSessions[0]!.name
    const backupFile = `${backupsDir}/${sessionDir}/.pair/test-registry/file1.md`

    expect(await fs.exists(backupFile)).toBe(true)
    const backupContent = await fs.readFile(backupFile)
    expect(backupContent).toBe('# Old Content')
  })

  test('performs rollback on failure (autoRollback=true)', async () => {
    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    // Induce failure during update by spying on writeFile
    // We purposefully fail on the nested file to ensure partial update is rolled back
    const originalWriteFile = fs.writeFile.bind(fs)
    vi.spyOn(fs, 'writeFile').mockImplementation(async (path, content) => {
      if (path.includes('file2.md')) {
        throw new Error('Simulated write failure')
      }
      return originalWriteFile(path, content)
    })

    await expect(handleUpdateCommand(config, fs, { httpClient })).rejects.toThrow(
      'Simulated write failure',
    )

    // Verify file1.md was rolled back to old content
    const content = await fs.readFile(`${cwd}/.pair/test-registry/file1.md`)
    expect(content).toBe('# Old Content')
  })

  test('skips rollback when autoRollback is false', async () => {
    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    const originalWriteFile = fs.writeFile.bind(fs)
    vi.spyOn(fs, 'writeFile').mockImplementation(async (path, content) => {
      if (path.includes('file2.md')) {
        throw new Error('Simulated write failure')
      }
      return originalWriteFile(path, content)
    })

    await expect(
      handleUpdateCommand(config, fs, {
        httpClient,
        autoRollback: false,
      }),
    ).rejects.toThrow('Simulated write failure')

    // Verify no backup was created (optimization for autoRollback=false)
    const backupsDir = `${cwd}/.pair/backups`
    expect(await fs.exists(backupsDir)).toBe(false)
  })

  test('uses installKBFromLocalZip for .zip local resolution', async () => {
    const kbInstaller = await import('#kb-manager/kb-installer')
    vi.spyOn(kbInstaller, 'installKBFromLocalZip').mockResolvedValue(datasetSrc)

    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'local',
      path: '/tmp/kb.zip',
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(config, fs, { httpClient })

    const content = await fs.readFile(`${cwd}/.pair/test-registry/file1.md`)
    expect(content).toBe('# New Content')
  })

  test('supports remote resolution by calling getKnowledgeHubDatasetPathWithFallback', async () => {
    const cfg = await import('#config')
    vi.spyOn(cfg, 'getKnowledgeHubDatasetPathWithFallback').mockResolvedValue(datasetSrc)

    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'remote',
      url: 'https://example.com/kb.zip',
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(config, fs, { httpClient })

    const content = await fs.readFile(`${cwd}/.pair/test-registry/file1.md`)
    expect(content).toBe('# New Content')
  })

  test('continues update when fs.readdir returns empty entries while PAIR_DIAG=1', async () => {
    process.env['PAIR_DIAG'] = '1'
    const originalReaddir = fs.readdir.bind(fs)
    let first = true
    vi.spyOn(fs, 'readdir').mockImplementation(async (path: string) => {
      // First diagnostic check should throw (exercise catch branch), subsequent calls should succeed so copy proceeds
      if (path.includes('packages/knowledge-hub') && first) {
        first = false
        throw new Error('nope')
      }
      return originalReaddir(path)
    })

    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(config, fs, { httpClient })

    const content = await fs.readFile(`${cwd}/.pair/test-registry/file1.md`)
    expect(content).toBe('# New Content')
    delete process.env['PAIR_DIAG']
  })
})
