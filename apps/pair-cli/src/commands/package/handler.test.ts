import { describe, expect, beforeEach, vi, test } from 'vitest'
import { handlePackageCommand } from './handler'
import type { PackageCommandConfig } from './parser'
import { InMemoryFileSystemService } from '@pair/content-ops'

describe('handlePackageCommand - real services integration', () => {
  let fs: InMemoryFileSystemService
  const cwd = '/my-project'

  beforeEach(() => {
    // Setup initial FS state with a valid project structure
    fs = new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            reg1: {
              source: 'source/reg1',
              behavior: 'mirror',
              targets: [{ path: '.pair/reg1', mode: 'canonical' }],
              description: 'Registry 1',
            },
          },
        }),
        [`${cwd}/source/reg1/file.txt`]: 'content of reg1',
        [`${cwd}/README.md`]: '# My KB',
      },
      cwd,
      cwd,
    )
    vi.restoreAllMocks()
  })

  test('successfully creates a package with manifest', async () => {
    const outputPath = `${cwd}/dist/my-kb.zip`
    const config: PackageCommandConfig = {
      command: 'package',
      output: outputPath,
      name: 'test-kb',
      version: '1.2.3',
    }

    await handlePackageCommand(config, fs)

    // Verify ZIP was created
    expect(await fs.exists(outputPath)).toBe(true)

    // Verify we can "extract" it (since it's an in-memory ZIP)
    const extractDir = `${cwd}/extracted`
    await fs.extractZip(outputPath, extractDir)

    // Verify manifest content
    const manifestStr = await fs.readFile(`${extractDir}/manifest.json`)
    const manifest = JSON.parse(manifestStr)
    expect(manifest.version).toBe('1.2.3')
    expect(manifest.name).toBe('test-kb')

    // Verify registry content
    expect(await fs.exists(`${extractDir}/source/reg1/file.txt`)).toBe(true)
    expect(await fs.readFile(`${extractDir}/source/reg1/file.txt`)).toBe('content of reg1')
  })

  test('fails if registry source does not exist', async () => {
    const invalidConfig = {
      asset_registries: {
        broken: {
          source: 'non-existent',
          behavior: 'mirror',
          targets: [{ path: 'pkg', mode: 'canonical' }],
          description: 'broken',
        },
      },
    }
    await fs.writeFile(`${cwd}/config.json`, JSON.stringify(invalidConfig))

    const config: PackageCommandConfig = {
      command: 'package',
    }

    await expect(handlePackageCommand(config, fs)).rejects.toThrow(/source path does not exist/)
  })
})
