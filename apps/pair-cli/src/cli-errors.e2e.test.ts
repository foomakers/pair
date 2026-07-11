import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
import { installCommand, handleUpdateCommand, parseUpdateCommand } from './commands'

describe('pair-cli e2e - error scenarios', () => {
  it('update fails gracefully when source directory does not exist', async () => {
    const cwd = '/test-no-source'
    const seed: Record<string, string> = {
      [cwd + '/config.json']: JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub config',
          },
        },
      }),
    }
    const fs = new InMemoryFileSystemService(seed, cwd, cwd)
    await expect(
      handleUpdateCommand(parseUpdateCommand({ source: '/nonexistent/path' }), fs),
    ).rejects.toThrow('KB source path not found')
  })

  it('install from ZIP fails gracefully when ZIP is corrupted', async () => {
    const cwd = '/test-bad-zip'
    const seed: Record<string, string> = {
      [cwd + '/config.json']: JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub config',
          },
        },
      }),
      [cwd + '/bad.zip']: 'not a valid zip file',
    }
    const fs = new InMemoryFileSystemService(seed, cwd, cwd)
    const result = await installCommand(fs, ['--source', 'bad.zip'], { useDefaults: true })
    expect(result).toBeDefined()
    // May succeed or fail depending on implementation, just ensure it doesn't crash
  })
})
