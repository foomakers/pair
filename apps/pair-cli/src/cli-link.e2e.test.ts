import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
import { installCommand, updateCommand } from './commands'
import { withTempConfig, createTestConfig, getDeploymentConfig } from '#test-utils/cli-e2e-helpers'

describe('pair-cli e2e - link strategy', () => {
  it('install with relative link style', async () => {
    const { fs } = getDeploymentConfig('dev')
    await withTempConfig(fs, createTestConfig(), async () => {
      const configPath = fs.rootModuleDirectory() + '/config.json'
      const result = await installCommand(fs, [], {
        customConfigPath: configPath,
        useDefaults: true,
        linkStyle: 'relative',
      })
      expect((result as { success?: boolean }).success).toBe(true)
    })
  })

  it('update with absolute link style', async () => {
    const { fs } = getDeploymentConfig('dev')
    await withTempConfig(fs, createTestConfig(), async () => {
      const configPath = fs.rootModuleDirectory() + '/config.json'
      // First install to set up targets
      await installCommand(fs, [], { customConfigPath: configPath, useDefaults: true })
      // Then update with absolute style and defaults
      const result = await updateCommand(fs, [], { useDefaults: true, linkStyle: 'absolute' })
      expect((result as { success?: boolean }).success).toBe(true)
    })
  })

  it('update with auto link style detection', async () => {
    const { fs } = getDeploymentConfig('dev')
    await withTempConfig(fs, createTestConfig(), async () => {
      const configPath = fs.rootModuleDirectory() + '/config.json'
      // First install to establish baseline
      await installCommand(fs, [], { customConfigPath: configPath, useDefaults: true })
      // Then update with auto detection and defaults
      await updateCommand(fs, [], { useDefaults: true, linkStyle: 'auto' })
      // Auto detection should succeed
    })
  })
})

describe('pair-cli e2e - preferences persistence', () => {
  it('saves and reads preferences with custom directory', async () => {
    const { readPreferences, savePreferences } = await import('./commands/package/preferences.js')
    const cwd = '/test-prefs'
    const prefsDir = `${cwd}/.custom-pair`
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    const data = {
      packageMetadata: { name: 'my-kb', author: 'Test Author', tags: ['ai', 'kb'] },
      updatedAt: '2026-02-17T00:00:00.000Z',
    }

    await savePreferences(data, fs, prefsDir)
    const result = readPreferences(fs, prefsDir)

    expect(result).toEqual(data)
  })

  it('preferences from one session become defaults in next', async () => {
    const { readPreferences, savePreferences } = await import('./commands/package/preferences.js')
    const { resolveDefaults } = await import('./commands/package/defaults-resolver.js')

    const cwd = '/test-prefs-flow'
    const prefsDir = `${cwd}/.pair`
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    // Session 1: save preferences
    await savePreferences(
      {
        packageMetadata: { name: 'saved-kb', author: 'Saved Author', license: 'Apache-2.0' },
        updatedAt: new Date().toISOString(),
      },
      fs,
      prefsDir,
    )

    // Session 2: read preferences and resolve defaults
    const prefs = readPreferences(fs, prefsDir)
    const defaults = resolveDefaults({ preferences: prefs?.packageMetadata })

    expect(defaults.name).toBe('saved-kb')
    expect(defaults.author).toBe('Saved Author')
    expect(defaults.license).toBe('Apache-2.0')
    // Non-saved fields fall back to hardcoded
    expect(defaults.version).toBe('1.0.0')
  })

  it('package command produces ZIP with non-optional manifest fields', async () => {
    const { handlePackageCommand } = await import('./commands/package/handler.js')
    const cwd = '/test-pkg-manifest'
    const seed: Record<string, string> = {
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'KB content',
          },
        },
      }),
      [`${cwd}/.pair/knowledge/doc.md`]: '# Doc',
    }
    const fs = new InMemoryFileSystemService(seed, cwd, cwd)
    const outputPath = `${cwd}/dist/kb.zip`

    await handlePackageCommand(
      {
        command: 'package',
        output: outputPath,
        interactive: false,
        tags: ['ai', 'devops'],
        license: 'Apache-2.0',
      },
      fs,
    )

    expect(await fs.exists(outputPath)).toBe(true)

    // Extract and verify manifest has all required fields
    const extractDir = `${cwd}/extracted`
    await fs.extractZip(outputPath, extractDir)
    const manifest = JSON.parse(await fs.readFile(`${extractDir}/manifest.json`))

    expect(manifest.tags).toEqual(['ai', 'devops'])
    expect(manifest.license).toBe('Apache-2.0')
    expect(manifest.description).toBe('Knowledge base package') // default
    expect(manifest.author).toBe('unknown') // default
    expect(typeof manifest.name).toBe('string')
    expect(typeof manifest.version).toBe('string')
    expect(typeof manifest.created_at).toBe('string')
  })
})
