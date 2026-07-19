import { describe, expect, beforeEach, afterEach, vi, test } from 'vitest'

// Mock @inquirer/prompts so the guided (--interactive) path can be exercised
// without a real terminal. Non-interactive tests never touch these.
vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  confirm: vi.fn(),
}))

import { handlePackageCommand } from './handler'
import type { PackageCommandConfig } from './parser'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { input, confirm } from '@inquirer/prompts'
import * as defaultsResolver from './defaults-resolver'

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
      layout: 'source',
      interactive: false,
      tags: [],
      license: 'MIT',
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

  test('quick path (no --name flag) resolves manifest name from package.json via shared cascade', async () => {
    // Repo whose package.json name is 'foo' → manifest name must be 'foo', NOT the
    // hardcoded 'kb-package'. Proves the non-interactive/quick path reads the same
    // resolveDefaults() cascade (packageJson > gitConfig > preferences) the guided
    // (--interactive) path uses — not manifest hardcoded defaults only. (#276)
    await fs.writeFile(`${cwd}/package.json`, JSON.stringify({ name: 'foo', version: '2.5.0' }))

    const outputPath = `${cwd}/dist/foo-kb.zip`
    const config: PackageCommandConfig = {
      command: 'package',
      output: outputPath,
      layout: 'source',
      interactive: false,
      tags: [],
      license: 'MIT',
    }

    await handlePackageCommand(config, fs)

    const extractDir = `${cwd}/extracted`
    await fs.extractZip(outputPath, extractDir)
    const manifest = JSON.parse(await fs.readFile(`${extractDir}/manifest.json`))

    expect(manifest.name).toBe('foo')
    expect(manifest.version).toBe('2.5.0')
  })

  test('quick path: explicit --name flag overrides package.json name', async () => {
    // CLI flags are highest precedence in the shared cascade, in quick mode too.
    await fs.writeFile(`${cwd}/package.json`, JSON.stringify({ name: 'foo', version: '2.5.0' }))

    const outputPath = `${cwd}/dist/override-kb.zip`
    const config: PackageCommandConfig = {
      command: 'package',
      output: outputPath,
      name: 'explicit-kb',
      layout: 'source',
      interactive: false,
      tags: [],
      license: 'MIT',
    }

    await handlePackageCommand(config, fs)

    const extractDir = `${cwd}/extracted`
    await fs.extractZip(outputPath, extractDir)
    const manifest = JSON.parse(await fs.readFile(`${extractDir}/manifest.json`))

    expect(manifest.name).toBe('explicit-kb')
    // version not supplied as a flag → still falls through to package.json
    expect(manifest.version).toBe('2.5.0')
  })

  test('creates package with org metadata in manifest', async () => {
    const outputPath = `${cwd}/dist/org-kb.zip`
    const config: PackageCommandConfig = {
      command: 'package',
      output: outputPath,
      name: 'org-kb',
      version: '1.0.0',
      layout: 'source',
      interactive: false,
      tags: [],
      license: 'MIT',
      org: true,
      orgName: 'Acme Corp',
      team: 'Platform',
      department: 'Engineering',
    }

    await handlePackageCommand(config, fs)

    const extractDir = `${cwd}/extracted`
    await fs.extractZip(outputPath, extractDir)
    const manifestStr = await fs.readFile(`${extractDir}/manifest.json`)
    const manifest = JSON.parse(manifestStr)

    expect(manifest.organization).toBeDefined()
    expect(manifest.organization.name).toBe('Acme Corp')
    expect(manifest.organization.team).toBe('Platform')
    expect(manifest.organization.department).toBe('Engineering')
    expect(manifest.organization.distribution).toBe('open')
    expect(manifest.organization.compliance).toEqual([])
  })

  test('creates package without org metadata when --org not set', async () => {
    const outputPath = `${cwd}/dist/standard-kb.zip`
    const config: PackageCommandConfig = {
      command: 'package',
      output: outputPath,
      layout: 'source',
      interactive: false,
      tags: [],
      license: 'MIT',
    }

    await handlePackageCommand(config, fs)

    const extractDir = `${cwd}/extracted`
    await fs.extractZip(outputPath, extractDir)
    const manifestStr = await fs.readFile(`${extractDir}/manifest.json`)
    const manifest = JSON.parse(manifestStr)

    expect(manifest.organization).toBeUndefined()
  })

  test('uses org template defaults when no CLI flags', async () => {
    await fs.writeFile(
      `${cwd}/.pair/org-template.json`,
      JSON.stringify({
        name: 'Template Corp',
        team: 'Default Team',
        distribution: 'private',
      }),
    )

    const outputPath = `${cwd}/dist/template-kb.zip`
    const config: PackageCommandConfig = {
      command: 'package',
      output: outputPath,
      layout: 'source',
      interactive: false,
      tags: [],
      license: 'MIT',
      org: true,
    }

    await handlePackageCommand(config, fs)

    const extractDir = `${cwd}/extracted`
    await fs.extractZip(outputPath, extractDir)
    const manifestStr = await fs.readFile(`${extractDir}/manifest.json`)
    const manifest = JSON.parse(manifestStr)

    expect(manifest.organization.name).toBe('Template Corp')
    expect(manifest.organization.team).toBe('Default Team')
    expect(manifest.organization.distribution).toBe('private')
  })

  test('CLI flags override org template values', async () => {
    await fs.writeFile(
      `${cwd}/.pair/org-template.json`,
      JSON.stringify({
        name: 'Template Corp',
        team: 'Template Team',
      }),
    )

    const outputPath = `${cwd}/dist/override-kb.zip`
    const config: PackageCommandConfig = {
      command: 'package',
      output: outputPath,
      layout: 'source',
      interactive: false,
      tags: [],
      license: 'MIT',
      org: true,
      orgName: 'CLI Corp',
    }

    await handlePackageCommand(config, fs)

    const extractDir = `${cwd}/extracted`
    await fs.extractZip(outputPath, extractDir)
    const manifestStr = await fs.readFile(`${extractDir}/manifest.json`)
    const manifest = JSON.parse(manifestStr)

    expect(manifest.organization.name).toBe('CLI Corp')
    expect(manifest.organization.team).toBe('Template Team')
  })

  test('fails when --org used without org-name and no template', async () => {
    const config: PackageCommandConfig = {
      command: 'package',
      output: `${cwd}/dist/fail.zip`,
      layout: 'source',
      interactive: false,
      tags: [],
      license: 'MIT',
      org: true,
    }

    await expect(handlePackageCommand(config, fs)).rejects.toThrow(
      'Organization name cannot be empty',
    )
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
      layout: 'source',
      interactive: false,
      tags: [],
      license: 'MIT',
    }

    await expect(handlePackageCommand(config, fs)).rejects.toThrow(/source path does not exist/)
  })
})

describe('handlePackageCommand - guided path resolves defaults once', () => {
  const cwd = '/my-project'
  const originalIsTTY = process.stdout.isTTY
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true })
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
      },
      cwd,
      cwd,
    )
  })

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true })
  })

  test('does NOT re-run resolvePackageDefaults after the interactive flow', async () => {
    // The guided flow resolves the shared cascade internally; the handler must
    // consume that result, not resolve a second time (redundant git/config read).
    vi.mocked(input)
      .mockResolvedValueOnce('guided-kb') // name
      .mockResolvedValueOnce('4.1.0') // version
      .mockResolvedValueOnce('Guided description') // description
      .mockResolvedValueOnce('Guided Author') // author
      .mockResolvedValueOnce('') // tags
      .mockResolvedValueOnce('MIT') // license
    vi.mocked(confirm).mockResolvedValueOnce(true)

    const resolveSpy = vi.spyOn(defaultsResolver, 'resolvePackageDefaults')

    const config: PackageCommandConfig = {
      command: 'package',
      output: `${cwd}/dist/guided-kb.zip`,
      layout: 'source',
      interactive: true,
      tags: [],
      license: 'MIT',
    }

    await handlePackageCommand(config, fs)

    // Exactly one resolution — inside runInteractiveFlow only. Pre-fix this was 2
    // (once in the flow, once again in the handler on the merged config).
    expect(resolveSpy).toHaveBeenCalledTimes(1)

    // Interactive answers still win: they flow through to the manifest unchanged.
    const extractDir = `${cwd}/extracted`
    await fs.extractZip(`${cwd}/dist/guided-kb.zip`, extractDir)
    const manifest = JSON.parse(await fs.readFile(`${extractDir}/manifest.json`))
    expect(manifest.name).toBe('guided-kb')
    expect(manifest.version).toBe('4.1.0')
    expect(manifest.author).toBe('Guided Author')
  })
})
