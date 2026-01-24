import { describe, expect, beforeEach, vi, test } from 'vitest'
import { handleUpdateCommand } from './handler'
import type { UpdateCommandConfig } from './parser'
import { InMemoryFileSystemService, MockHttpClientService } from '@pair/content-ops'

// Only mock external heavy-lifters/boundaries that strictly require native modules
// or download large files.
vi.mock('../../kb-manager/kb-installer', () => ({
  installKBFromLocalZip: vi.fn().mockResolvedValue('/test-local-zip-cache'),
}))

// We need to mock getKnowledgeHubDatasetPath because it relies on finding actual node_modules
// or package.json files relative to the executed module, which is hard to simulate perfectly
// in the test harness without pointing to real disk.
vi.mock('../../config-utils', async importOriginal => {
  const actual = await importOriginal<typeof import('../../config-utils')>()
  return {
    ...actual,
    getKnowledgeHubDatasetPath: vi.fn(() => '/dataset'),
    getKnowledgeHubDatasetPathWithFallback: vi.fn().mockResolvedValue('/dataset'),
  }
})

describe('handleUpdateCommand - integration with in-memory services', () => {
  let fs: InMemoryFileSystemService
  let httpClient: MockHttpClientService

  const cwd = '/project'
  const datasetSrc = '/dataset'

  beforeEach(() => {
    // Setup initial FS state
    fs = new InMemoryFileSystemService(
      {
        // Config file
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            'test-registry': {
              source: 'test-registry', // UPDATED: Match registry name for default resolution
              behavior: 'mirror',
              target_path: '.pair/test-registry',
              description: 'Test registry',
            },
          },
        }),
        // Source files in dataset
        [`${datasetSrc}/test-registry/file1.md`]: '# New Content', // UPDATED path
        [`${datasetSrc}/test-registry/nested/file2.md`]: '# Nested New Content', // UPDATED path
        // Existing files in project (for update/backup verification)
        [`${cwd}/.pair/test-registry/file1.md`]: '# Old Content',
      },
      cwd, // Root module dir (simulated)
      cwd, // CWD
    )

    httpClient = new MockHttpClientService()
    vi.clearAllMocks()
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
    // Backup paths are distinct by timestamp, so we search for the backup dir
    const backupsDir = `${cwd}/.pair/backups`
    const backupSessions = await fs.readdir(backupsDir)
    expect(backupSessions.length).toBeGreaterThan(0)

    const sessionDir = backupSessions[0].name
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
      // Use includes or check if path is targeting the nested file
      if (path.includes('file2.md')) {
        throw new Error('Simulated write failure')
      }
      return originalWriteFile(path, content)
    })

    await expect(handleUpdateCommand(config, fs, { httpClient })).rejects.toThrow(
      'Simulated write failure',
    )

    // Verify file1.md was rolled back to old content
    // Note: file1.md is written BEFORE file2.md usually (lexical order? or random iteration?)
    // 'file1.md' vs 'nested/file2.md'. 'file1.md' likely first.
    // If rollback works, content should be reverted.
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
})
