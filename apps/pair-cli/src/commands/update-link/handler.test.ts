import { describe, expect, beforeEach, vi, test } from 'vitest'
import { handleUpdateLinkCommand } from './handler'
import type { UpdateLinkCommandConfig } from './parser'
import { InMemoryFileSystemService } from '@pair/content-ops'

describe('handleUpdateLinkCommand - integration with in-memory services', () => {
  let fs: InMemoryFileSystemService
  const cwd = '/project'

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
        // Fake KB installed
        [`${cwd}/.pair/knowledge/file1.md`]: '[link](/absolute/path)',
        [`${cwd}/.pair/knowledge/file2.md`]: '[link](./relative/path)',
        // dataset folders for resolution
        [`${cwd}/packages/knowledge-hub/dataset/.pair/knowledge/file1.md`]:
          '[link](/absolute/path)',
      },
      cwd, // Root module dir
      cwd, // CWD
    )
    vi.restoreAllMocks()
  })

  test('successfully processes files (dry run)', async () => {
    const config: UpdateLinkCommandConfig = {
      command: 'update-link',
      dryRun: true,
    }

    // Spy on writeFile to ensure no writes happen
    const writeSpy = vi.spyOn(fs, 'writeFile')

    await handleUpdateLinkCommand(config, fs)

    expect(writeSpy).not.toHaveBeenCalled()
  })

  test('converts files to absolute paths', async () => {
    const config: UpdateLinkCommandConfig = {
      command: 'update-link',
      dryRun: false,
      absolute: true,
    }

    await handleUpdateLinkCommand(config, fs)

    // Verify content changed
    const content = await fs.readFile(`${cwd}/.pair/knowledge/file2.md`)
    // ./relative/path should become an absolute path (starting with /)
    expect(content).toContain('(/')
  })

  test('creates backup before modification', async () => {
    const config: UpdateLinkCommandConfig = {
      command: 'update-link',
      dryRun: false,
    }

    await handleUpdateLinkCommand(config, fs, { persistBackup: true })

    // Verify backup
    const backupsDir = `${cwd}/.pair/backups`
    const backupSessions = await fs.readdir(backupsDir)
    expect(backupSessions.length).toBeGreaterThan(0)

    const sessionDir = backupSessions[0]!.name
    expect(await fs.exists(`${backupsDir}/${sessionDir}/.pair/knowledge/file1.md`)).toBe(true)
  })

  test('performs rollback on failure', async () => {
    const config: UpdateLinkCommandConfig = {
      command: 'update-link',
      dryRun: false,
    }

    // Induce failure
    vi.spyOn(fs, 'writeFile').mockImplementation(async () => {
      throw new Error('Simulated write failure')
    })

    await expect(handleUpdateLinkCommand(config, fs)).rejects.toThrow('Simulated write failure')

    // Verify content rolled back or unchanged
    const content = await fs.readFile(`${cwd}/.pair/knowledge/file1.md`)
    expect(content).toBe('[link](/absolute/path)')
  })
})
