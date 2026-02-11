import { describe, expect, test, beforeEach, vi } from 'vitest'
import { dispatchCommand } from './dispatcher'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createTestFs } from '#test-utils'
import type {
  InstallCommandConfig,
  UpdateCommandConfig,
  UpdateLinkCommandConfig,
  PackageCommandConfig,
  ValidateConfigCommandConfig,
} from './index'

describe('dispatchCommand() - real handlers integration', () => {
  let fs: InMemoryFileSystemService
  const cwd = '/project'

  beforeEach(() => {
    // Basic setup for all commands
    fs = createTestFs(
      {
        asset_registries: {
          reg: {
            source: 'reg',
            behavior: 'mirror',
            targets: [{ path: 'dest', mode: 'canonical' }],
            description: 'desc',
          },
        },
      },
      {
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${cwd}/packages/knowledge-hub/dataset/reg/file.txt`]: 'content',
        [`${cwd}/reg/file.txt`]: 'content', // Source for package command
        [`${cwd}/.pair/knowledge/README.md`]: '# KB installed', // For update-link command verification
      },
      cwd,
    )
    vi.restoreAllMocks()
  })

  test('dispatches install command', async () => {
    const config: InstallCommandConfig = {
      command: 'install',
      kb: true,
      resolution: 'default',
      offline: false,
    }

    await dispatchCommand(config, fs)
    expect(await fs.exists(`${cwd}/dest/file.txt`)).toBe(true)
  })

  test('dispatches update command', async () => {
    // Setup existing dest
    await fs.mkdir(`${cwd}/dest`, { recursive: true })
    await fs.writeFile(`${cwd}/dest/file.txt`, 'old content')

    const config: UpdateCommandConfig = {
      command: 'update',
      kb: true,
      resolution: 'default',
      offline: false,
    }

    await dispatchCommand(config, fs)
    expect(await fs.readFile(`${cwd}/dest/file.txt`)).toBe('content')
  })

  test('dispatches update-link command', async () => {
    await fs.mkdir(`${cwd}/docs`, { recursive: true })
    await fs.writeFile(`${cwd}/docs/a.md`, '[link](/abs/path)')

    const config: UpdateLinkCommandConfig = {
      command: 'update-link',
      dryRun: false,
      absolute: false, // will try relative
    }

    await dispatchCommand(config, fs)
    // Effect check - it should have processed the file
    // We don't verify exact link transformation here as that's handler responsibility,
    // but just checking it ran without error.
  })

  test('dispatches package command', async () => {
    const outputPath = `${cwd}/pkg.zip`
    const config: PackageCommandConfig = {
      command: 'package',
      output: outputPath,
    }

    await dispatchCommand(config, fs)
    expect(await fs.exists(outputPath)).toBe(true)
  })

  test('passes baseTarget through to install handler', async () => {
    const externalRoot = '/external-root'
    await fs.mkdir(externalRoot, { recursive: true })

    const config: InstallCommandConfig = {
      command: 'install',
      kb: true,
      resolution: 'default',
      offline: false,
      target: '.', // relative dot — would resolve to CWD without baseTarget
    }

    await dispatchCommand(config, fs, { baseTarget: externalRoot })
    // Output should land in externalRoot, not in CWD (/project)
    expect(await fs.exists(`${externalRoot}/dest/file.txt`)).toBe(true)
    expect(await fs.exists(`${cwd}/dest/file.txt`)).toBe(false)
  })

  test('passes baseTarget through to update handler', async () => {
    const externalRoot = '/external-root'
    await fs.mkdir(`${externalRoot}/dest`, { recursive: true })
    await fs.writeFile(`${externalRoot}/dest/file.txt`, 'old')

    const config: UpdateCommandConfig = {
      command: 'update',
      kb: true,
      resolution: 'default',
      offline: false,
      target: '.', // relative dot
    }

    await dispatchCommand(config, fs, { baseTarget: externalRoot })
    expect(await fs.readFile(`${externalRoot}/dest/file.txt`)).toBe('content')
  })

  test('dispatches validate-config command', async () => {
    const config: ValidateConfigCommandConfig = {
      command: 'validate-config',
    }

    // Should not throw for valid config
    await expect(dispatchCommand(config, fs)).resolves.not.toThrow()

    // Break config and verify it fails
    await fs.writeFile(`${cwd}/config.json`, 'invalid json')
    await expect(dispatchCommand(config, fs)).rejects.toThrow()
  })
})
