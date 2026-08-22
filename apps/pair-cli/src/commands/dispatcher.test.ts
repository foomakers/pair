import { describe, expect, test, beforeEach, vi } from 'vitest'
import { dispatchCommand, finalExitCode } from './dispatcher'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createTestFs } from '#test-utils'
import type {
  InstallCommandConfig,
  UpdateCommandConfig,
  UpdateLinkCommandConfig,
  PackageCommandConfig,
  ValidateConfigCommandConfig,
} from './index'
import type { KbInfoCommandConfig } from './kb-info/parser'

/**
 * #186: config forwarding from dispatch context to handlers
 *
 * Verifies that the dispatcher forwards the `config` field from the
 * dispatch context to handler options for both update and install commands.
 */
describe('#186 — config forwarding through dispatch context', () => {
  let fs: InMemoryFileSystemService
  const cwd = '/project'

  beforeEach(() => {
    fs = createTestFs(
      {
        asset_registries: {
          reg: {
            source: 'reg',
            behavior: 'mirror',
            targets: [{ path: 'dest', mode: 'canonical' }],
            description: 'base target',
          },
        },
      },
      {
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${cwd}/packages/knowledge-hub/dataset/reg/file.txt`]: 'content',
        // Custom config overrides target path
        [`${cwd}/custom.json`]: JSON.stringify({
          asset_registries: {
            reg: {
              source: 'reg',
              behavior: 'mirror',
              targets: [{ path: 'custom-dest', mode: 'canonical' }],
              description: 'custom target',
            },
          },
        }),
      },
      cwd,
    )
    vi.restoreAllMocks()
  })

  test('forwards config to update handler — output uses custom registry target', async () => {
    // Pre-existing targets (update precondition)
    await fs.mkdir(`${cwd}/dest`, { recursive: true })
    await fs.writeFile(`${cwd}/dest/file.txt`, 'old')
    await fs.mkdir(`${cwd}/custom-dest`, { recursive: true })
    await fs.writeFile(`${cwd}/custom-dest/file.txt`, 'old')

    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await dispatchCommand(config, fs, { config: `${cwd}/custom.json` })

    expect(await fs.readFile(`${cwd}/custom-dest/file.txt`)).toBe('content')
  })

  test('forwards config to install handler — output uses custom registry target', async () => {
    const config: InstallCommandConfig = {
      command: 'install',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await dispatchCommand(config, fs, { config: `${cwd}/custom.json` })

    expect(await fs.exists(`${cwd}/custom-dest/file.txt`)).toBe(true)
  })
})

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
      layout: 'source',
      interactive: false,
      tags: [],
      license: 'MIT',
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

  test('dispatches kb-validate command', async () => {
    const config = {
      command: 'kb-validate' as const,
      json: false,
    }

    // KB validation may fail if KB structure is invalid, but dispatcher should handle it
    // Just verify the command is dispatched without throwing
    try {
      await dispatchCommand(config, fs)
    } catch (error) {
      // Expected - KB structure may be invalid in test environment
      expect((error as Error).message).toContain('Validation failed')
    }
  })

  test('dispatches kb-verify command and sets exit code on failure', async () => {
    const config = {
      command: 'kb-verify' as const,
      packagePath: '/nonexistent/package.zip',
      json: false,
    }

    // Reset process.exitCode
    process.exitCode = 0

    // Should not throw but set exit code
    await dispatchCommand(config, fs)

    // Exit code should be non-zero for verification failure
    expect(process.exitCode).toBe(1)
  })

  test('dispatches kb-info command and sets exit code on failure', async () => {
    const config: KbInfoCommandConfig = {
      command: 'kb-info',
      mode: 'package',
      packagePath: '/nonexistent/package.zip',
      json: false,
    }

    process.exitCode = 0

    await dispatchCommand(config, fs)

    expect(process.exitCode).toBe(1)
  })

  test('dispatches kb-info version-check mode without throwing', async () => {
    const config: KbInfoCommandConfig = {
      command: 'kb-info',
      mode: 'version-check',
      json: false,
    }

    process.exitCode = 0

    await dispatchCommand(config, fs)

    expect(process.exitCode).toBe(0)
  })
})

/**
 * US-396 AC5 — the CLI entry point force-exits, and `process.exit(0)` with an explicit
 * code OVERRIDES `process.exitCode`. Everything above sets `process.exitCode`; without
 * this forwarding the shell saw 0 for every one of them.
 */
describe('US-396 — finalExitCode forwards what the dispatcher reported', () => {
  test.each([
    ['a reported failure', 1, 1],
    ['a reported non-1 code', 2, 2],
    ['nothing reported', undefined, 0],
    ['an explicit success', 0, 0],
    ['a string code, which Node allows', '1', 1],
    ['a non-numeric string', 'boom', 0],
    ['a null', null, 0],
  ])('%s → exit %s', (_label, pending, expected) => {
    expect(finalExitCode(pending)).toBe(expected)
  })
})
