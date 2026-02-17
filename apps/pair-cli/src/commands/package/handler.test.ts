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

  test('creates package with org metadata in manifest', async () => {
    const outputPath = `${cwd}/dist/org-kb.zip`
    const config: PackageCommandConfig = {
      command: 'package',
      output: outputPath,
      name: 'org-kb',
      version: '1.0.0',
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
      interactive: false,
      tags: [],
      license: 'MIT',
    }

    await expect(handlePackageCommand(config, fs)).rejects.toThrow(/source path does not exist/)
  })
})
