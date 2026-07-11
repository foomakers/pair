import { describe, expect, beforeEach, vi, test } from 'vitest'
import { handleUpdateCommand } from './handler'
import type { UpdateCommandConfig } from './parser'
import { handleInstallCommand } from '../install/handler'
import type { InstallCommandConfig } from '../install/parser'
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

/**
 * #186: config override via options.config
 *
 * Verifies that handleUpdateCommand uses a custom config when
 * options.config is provided, and falls back to base config otherwise.
 */
describe('#186: config override via options.config', () => {
  let fs: InMemoryFileSystemService
  let httpClient: MockHttpClientService

  const cwd = '/project'
  const datasetSrc = '/project/packages/knowledge-hub/dataset'

  beforeEach(() => {
    fs = new InMemoryFileSystemService(
      {
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            'test-registry': {
              source: 'test-registry',
              behavior: 'mirror',
              targets: [{ path: '.pair/test-registry', mode: 'canonical' }],
              description: 'Base registry',
            },
          },
        }),
        [`${datasetSrc}/test-registry/file.md`]: '# Base Content',
        [`${datasetSrc}/custom-registry/data.md`]: '# Custom Data',
        [`${cwd}/.pair/test-registry/file.md`]: '# Old Base',
      },
      cwd,
      cwd,
    )
    httpClient = new MockHttpClientService()
  })

  test('uses custom config registries when options.config is provided', async () => {
    const customConfig = {
      asset_registries: {
        'custom-registry': {
          source: 'custom-registry',
          behavior: 'mirror',
          targets: [{ path: '.pair/custom-target', mode: 'canonical' }],
          description: 'Custom registry',
        },
      },
    }
    await fs.writeFile(`${cwd}/custom-config.json`, JSON.stringify(customConfig))
    // Pre-existing target (update precondition)
    await fs.mkdir(`${cwd}/.pair/custom-target`, { recursive: true })
    await fs.writeFile(`${cwd}/.pair/custom-target/data.md`, '# Old Custom')

    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(config, fs, {
      httpClient,
      config: `${cwd}/custom-config.json`,
    })

    expect(await fs.readFile(`${cwd}/.pair/custom-target/data.md`)).toBe('# Custom Data')
  })

  test('uses base config when options.config is not provided', async () => {
    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(config, fs, { httpClient })

    expect(await fs.readFile(`${cwd}/.pair/test-registry/file.md`)).toBe('# Base Content')
  })

  test('throws when options.config points to non-existent file', async () => {
    // Pre-existing target so we don't fail on the precondition check
    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await expect(
      handleUpdateCommand(config, fs, {
        httpClient,
        config: `${cwd}/nonexistent.json`,
      }),
    ).rejects.toThrow(/Failed to load custom config/)
  })
})

/**
 * BUG 4: update precondition — targets must exist
 *
 * `update` = subsequent update of an already-installed project. If no
 * canonical registry targets exist, it means the project was never installed.
 * The command should reject with a message suggesting `pair install` first.
 * Currently it creates targets from scratch (behaves like install).
 */
describe('BUG 4: update precondition — targets must exist', () => {
  test('T4.2 — rejects when no registry targets exist (project not installed)', async () => {
    const cwd = '/project'
    const datasetSrc = `${cwd}/packages/knowledge-hub/dataset`

    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
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
        // Source files exist in dataset
        [`${datasetSrc}/test-registry/file1.md`]: '# Content',
        // NO target at .pair/test-registry/ — project not installed
      },
      cwd,
      cwd,
    )

    const httpClient = new MockHttpClientService()
    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    // Should reject because no targets exist (project not installed)
    await expect(handleUpdateCommand(config, fs, { httpClient })).rejects.toThrow(
      /not.*installed|install.*first/i,
    )
  })
})

/**
 * Bug regression tests: KB distribution pipeline
 *
 * These tests cover three interconnected bugs discovered during skills distribution:
 *
 * Bug 1 — skillNameMap not propagated across registries:
 *   Skills registry produces a skillNameMap (e.g., next → pair-capability-next)
 *   via flatten+prefix. AGENTS.md in the agents registry references skill names
 *   (e.g., /next) that must be rewritten to their prefixed form (/pair-capability-next).
 *   Currently, doCopyAndUpdateLinks discards the skillNameMap and registries
 *   are processed independently with no cross-registry state.
 *
 * Bug 2 — link re-root with deep datasetRoot (node_modules):
 *   When datasetRoot resolves to a path inside node_modules (installed package),
 *   skill links like ../../.pair/adoption/... should resolve to .pair/ at the
 *   target project root, not to the node_modules source path.
 *
 * Bug 3 — target directory uses CWD which pnpm overrides:
 *   When running via pnpm --filter, CWD is changed to the package dir.
 *   The handler should support INIT_CWD (set by npm/pnpm to the original CWD)
 *   to resolve the target directory correctly in monorepo scenarios.
 */
describe('KB distribution pipeline — bug regression', () => {
  let httpClient: MockHttpClientService

  beforeEach(() => {
    httpClient = new MockHttpClientService()
  })

  describe('Bug 1: skillNameMap cross-registry propagation', () => {
    test('AGENTS.md skill references are transformed using skillNameMap from skills registry', async () => {
      const moduleDir = '/project'
      const datasetSrc = `${moduleDir}/packages/knowledge-hub/dataset`

      const skillsAgentsConfig = {
        asset_registries: {
          skills: {
            source: '.skills',
            behavior: 'mirror',
            flatten: true,
            prefix: 'pair',
            description: 'Agent skills',
            targets: [{ path: '.claude/skills/', mode: 'canonical' }],
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'mirror',
            description: 'AI agents guidance',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
          },
        },
      }

      const fs = new InMemoryFileSystemService(
        {
          [`${moduleDir}/package.json`]: JSON.stringify({
            name: 'test-project',
            version: '0.1.0',
          }),
          [`${moduleDir}/packages/knowledge-hub/package.json`]: JSON.stringify({
            name: '@pair/knowledge-hub',
          }),
          [`${moduleDir}/config.json`]: JSON.stringify(skillsAgentsConfig),
          // Skills source — two skills under different categories
          [`${datasetSrc}/.skills/process/next/SKILL.md`]:
            '# /next — Navigator\n\nUse /verify-quality to check gates.',
          [`${datasetSrc}/.skills/capability/verify-quality/SKILL.md`]:
            '# /verify-quality — Quality Gate',
          // AGENTS.md source referencing skills by their original short names
          [`${datasetSrc}/AGENTS.md`]:
            '# AGENTS\n\nRun /next to get started.\nUse /verify-quality for checks.\n',
          // Pre-existing target (update scenario — project already installed)
          [`${moduleDir}/AGENTS.md`]: '# old agents',
        },
        moduleDir,
        moduleDir,
      )

      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      await handleUpdateCommand(config, fs, { httpClient })

      // Verify skills were distributed with prefix
      expect(await fs.exists(`${moduleDir}/.claude/skills/pair-process-next/SKILL.md`)).toBe(true)
      expect(
        await fs.exists(`${moduleDir}/.claude/skills/pair-capability-verify-quality/SKILL.md`),
      ).toBe(true)

      // AGENTS.md must have transformed skill references
      const agentsContent = await fs.readFile(`${moduleDir}/AGENTS.md`)
      expect(agentsContent).toContain('/pair-process-next')
      expect(agentsContent).toContain('/pair-capability-verify-quality')
      // Original short names must NOT remain (except as substrings of the prefixed names)
      expect(agentsContent).not.toMatch(/(?<![a-z-])\/next(?![a-z-])/)
      expect(agentsContent).not.toMatch(/(?<![a-z-])\/verify-quality(?![a-z-])/)
    })
  })

  describe('Bug 2: link re-root with deep datasetRoot', () => {
    test('skill links point to installed .pair/ at target root, not to node_modules source', async () => {
      // Simulates: datasetRoot is in node_modules (installed KB package)
      // Skill link ../../.pair/adoption/... should resolve to .pair/ relative to target,
      // not to the deep node_modules path
      const moduleDir = '/project/apps/pair-cli'
      const datasetSrc = `${moduleDir}/node_modules/@pair/knowledge-hub/dataset`

      const skillsConfig = {
        asset_registries: {
          skills: {
            source: '.skills',
            behavior: 'mirror',
            flatten: true,
            prefix: 'pair',
            description: 'Agent skills',
            targets: [{ path: '.claude/skills/', mode: 'canonical' }],
          },
        },
      }

      const fs = new InMemoryFileSystemService(
        {
          [`${moduleDir}/package.json`]: JSON.stringify({
            name: '@pair/pair-cli',
            version: '0.1.0',
          }),
          [`${moduleDir}/node_modules/@pair/knowledge-hub/package.json`]: JSON.stringify({
            name: '@pair/knowledge-hub',
          }),
          [`${moduleDir}/config.json`]: JSON.stringify(skillsConfig),
          // Skill source with relative link to .pair/ adoption file
          // From .skills/process/implement/SKILL.md, ../../ goes to .skills/, then ../ to dataset root
          [`${datasetSrc}/.skills/process/implement/SKILL.md`]:
            '# /implement\n\nRead [way-of-working](../../../.pair/adoption/tech/way-of-working.md) for config.',
          // The .pair/ content (exists in dataset, would be distributed separately)
          [`${datasetSrc}/.pair/adoption/tech/way-of-working.md`]: '# Way of Working',
          // Pre-existing target (update scenario — project already installed)
          [`${moduleDir}/.claude/skills/old/SKILL.md`]: '# old',
        },
        moduleDir,
        moduleDir,
      )

      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      await handleUpdateCommand(config, fs, { httpClient })

      const skillContent = await fs.readFile(
        `${moduleDir}/.claude/skills/pair-process-implement/SKILL.md`,
      )
      // Link must NOT contain node_modules path
      expect(skillContent).not.toContain('node_modules')
      // Link must point to .pair/ relative to the target project root
      // From .claude/skills/pair-process-implement/SKILL.md, 3 levels up reaches moduleDir
      expect(skillContent).toContain('.pair/adoption/tech/way-of-working.md')
    })
  })

  describe('Bug 3: target directory resolution in monorepo', () => {
    test('output targets CWD, not rootModuleDir, when they differ', async () => {
      // Simulates: rootModuleDir is the pair-cli package dir, but CWD is the monorepo root
      // (user runs from monorepo root, pair-cli lives in apps/pair-cli)
      const moduleDir = '/project/apps/pair-cli'
      const userCwd = '/project'
      const datasetSrc = `${moduleDir}/node_modules/@pair/knowledge-hub/dataset`

      const registryConfig = {
        asset_registries: {
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            description: 'Knowledge base',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
          },
        },
      }

      const fs = new InMemoryFileSystemService(
        {
          // Config at moduleDir (pair-cli's config.json, loaded by loadBaseConfig from rootModuleDir)
          [`${moduleDir}/config.json`]: JSON.stringify(registryConfig),
          [`${moduleDir}/package.json`]: JSON.stringify({
            name: '@pair/pair-cli',
            version: '0.1.0',
          }),
          [`${moduleDir}/node_modules/@pair/knowledge-hub/package.json`]: JSON.stringify({
            name: '@pair/knowledge-hub',
          }),
          // Source content
          [`${datasetSrc}/.pair/knowledge/README.md`]: '# Knowledge Base',
          [`${datasetSrc}/.pair/knowledge/guidelines/testing.md`]: '# Testing Guidelines',
          // Pre-existing target (update scenario — project already installed)
          [`${userCwd}/.pair/knowledge/old.md`]: '# old',
        },
        moduleDir,
        userCwd,
      )

      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      await handleUpdateCommand(config, fs, { httpClient })

      // Output must be at CWD (user's working directory), not at rootModuleDir
      expect(await fs.exists(`${userCwd}/.pair/knowledge/README.md`)).toBe(true)
      expect(await fs.exists(`${userCwd}/.pair/knowledge/guidelines/testing.md`)).toBe(true)
    })

    test('baseTarget option overrides CWD for target resolution (pnpm --filter workaround)', async () => {
      // Simulates pnpm --filter behavior: both CWD and rootModuleDir are the package dir.
      // The caller (CLI entry point) should read INIT_CWD and pass it as baseTarget.
      const packageDir = '/project/apps/pair-cli'
      const monorepoRoot = '/project'
      const datasetSrc = `${packageDir}/node_modules/@pair/knowledge-hub/dataset`

      const registryConfig = {
        asset_registries: {
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            description: 'Knowledge base',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
          },
        },
      }

      // Both rootModuleDir and CWD are the package dir (pnpm behavior)
      const fs = new InMemoryFileSystemService(
        {
          [`${packageDir}/config.json`]: JSON.stringify(registryConfig),
          [`${packageDir}/package.json`]: JSON.stringify({
            name: '@pair/pair-cli',
            version: '0.1.0',
          }),
          [`${packageDir}/node_modules/@pair/knowledge-hub/package.json`]: JSON.stringify({
            name: '@pair/knowledge-hub',
          }),
          [`${datasetSrc}/.pair/knowledge/README.md`]: '# Knowledge Base',
          // Pre-existing target at monorepoRoot (update scenario — project already installed)
          [`${monorepoRoot}/.pair/knowledge/old.md`]: '# old',
        },
        packageDir,
        packageDir,
      )

      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      // Pass baseTarget explicitly (CLI entry point reads INIT_CWD and passes it here)
      await handleUpdateCommand(config, fs, { httpClient, baseTarget: monorepoRoot })

      // Output must be at baseTarget (monorepo root), not at the package dir
      expect(await fs.exists(`${monorepoRoot}/.pair/knowledge/README.md`)).toBe(true)
      // Must NOT be at the package dir
      expect(await fs.exists(`${packageDir}/.pair/knowledge/README.md`)).toBe(false)
    })

    test('config.target "." resolves to CWD, not to relative process.cwd()', async () => {
      // Simulates: pnpm --filter pair-cli dev update .
      // pnpm changes CWD to apps/pair-cli. User passes "." meaning "here" = monorepo root.
      // But "." resolves relative to process.cwd() which pnpm changed.
      // Fix: baseTarget from options must take precedence over config.target.
      const packageDir = '/project/apps/pair-cli'
      const monorepoRoot = '/project'
      const datasetSrc = `${packageDir}/node_modules/@pair/knowledge-hub/dataset`

      const registryConfig = {
        asset_registries: {
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            description: 'Knowledge base',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
          },
        },
      }

      const fs = new InMemoryFileSystemService(
        {
          [`${packageDir}/config.json`]: JSON.stringify(registryConfig),
          [`${packageDir}/package.json`]: JSON.stringify({
            name: '@pair/pair-cli',
            version: '0.1.0',
          }),
          [`${packageDir}/node_modules/@pair/knowledge-hub/package.json`]: JSON.stringify({
            name: '@pair/knowledge-hub',
          }),
          [`${datasetSrc}/.pair/knowledge/README.md`]: '# Knowledge Base',
          // Pre-existing target at monorepoRoot (update scenario — project already installed)
          [`${monorepoRoot}/.pair/knowledge/old.md`]: '# old',
        },
        packageDir,
        packageDir,
      )

      const config: UpdateCommandConfig = {
        command: 'update',
        resolution: 'default',
        kb: true,
        offline: false,
        target: '.', // User passed "." on CLI
      }

      // baseTarget from INIT_CWD should override config.target "."
      await handleUpdateCommand(config, fs, { httpClient, baseTarget: monorepoRoot })

      // Output must be at monorepo root (INIT_CWD), not resolved from "." via process.cwd()
      expect(await fs.exists(`${monorepoRoot}/.pair/knowledge/README.md`)).toBe(true)
      expect(await fs.exists(`${packageDir}/.pair/knowledge/README.md`)).toBe(false)
    })
  })
})

/**
 * BUG #04: --persist-backup creates empty directory
 *
 * In production, the backup was empty because Bug #02 caused incomplete installs
 * (missing registries). This test verifies that backup captures ALL registry files
 * when the project is fully installed.
 */
describe('BUG #04: --persist-backup captures actual file content', () => {
  test('backup contains files from all installed registries', async () => {
    const cwd = '/project'
    const datasetSrc = `${cwd}/packages/knowledge-hub/dataset`

    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            knowledge: {
              source: '.pair/knowledge',
              behavior: 'mirror',
              targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
              description: 'KB',
            },
            agents: {
              source: 'AGENTS.md',
              behavior: 'mirror',
              targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
              description: 'Agents',
            },
          },
        }),
        // Dataset source (new content for update)
        [`${datasetSrc}/.pair/knowledge/guide.md`]: '# New Guide',
        [`${datasetSrc}/AGENTS.md`]: '# New Agents',
        // Pre-existing targets (old content to be backed up)
        [`${cwd}/.pair/knowledge/guide.md`]: '# Old Guide',
        [`${cwd}/AGENTS.md`]: '# Old Agents',
      },
      cwd,
      cwd,
    )

    const httpClient = new MockHttpClientService()
    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(config, fs, { httpClient, persistBackup: true })

    // Verify backup directory exists and is NOT empty
    const backupsDir = `${cwd}/.pair/backups`
    const sessions = await fs.readdir(backupsDir)
    expect(sessions.length).toBeGreaterThan(0)

    const sessionDir = sessions[0]!.name

    // Both registries must be backed up
    const kbBackup = `${backupsDir}/${sessionDir}/.pair/knowledge/guide.md`
    const agentsBackup = `${backupsDir}/${sessionDir}/AGENTS.md`

    expect(await fs.exists(kbBackup)).toBe(true)
    expect(await fs.readFile(kbBackup)).toBe('# Old Guide')
    expect(await fs.exists(agentsBackup)).toBe(true)
    expect(await fs.readFile(agentsBackup)).toBe('# Old Agents')

    // Verify update happened
    expect(await fs.readFile(`${cwd}/.pair/knowledge/guide.md`)).toBe('# New Guide')
    expect(await fs.readFile(`${cwd}/AGENTS.md`)).toBe('# New Agents')
  })
})

describe('update — llms.txt generation', () => {
  test('generates .pair/llms.txt after update with adopted content', async () => {
    const cwd = '/project'
    const datasetSrc = `${cwd}/packages/knowledge-hub/dataset`

    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            adoption: {
              source: '.pair/tech/adopted',
              behavior: 'mirror',
              description: 'Tech adoption files',
              targets: [{ path: '.pair/tech/adopted', mode: 'canonical' }],
            },
          },
        }),
        [`${datasetSrc}/.pair/tech/adopted/tech-stack.md`]: '# Tech Stack\n\nStack content.',
        // Pre-existing file (update scenario)
        [`${cwd}/.pair/tech/adopted/tech-stack.md`]: '# Old Stack',
      },
      cwd,
      cwd,
    )

    const httpClient = new MockHttpClientService()
    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(config, fs, { httpClient })

    expect(await fs.exists(`${cwd}/.pair/llms.txt`)).toBe(true)
    const llmsTxt = await fs.readFile(`${cwd}/.pair/llms.txt`)
    expect(llmsTxt).toMatch(/^# pair/)
    expect(llmsTxt).toContain('## Adoption — Tech')
    expect(llmsTxt).toContain('[Tech Stack]')
  })
})

describe('Bug 4: skill refs not transformed in secondary (copy) targets', () => {
  test('CLAUDE.md (copy target of agents registry) gets skill refs rewritten', async () => {
    const moduleDir = '/project'
    const datasetSrc = `${moduleDir}/packages/knowledge-hub/dataset`

    const config_json = {
      asset_registries: {
        agents: {
          source: 'AGENTS.md',
          behavior: 'mirror',
          description: 'AI agents guidance',
          targets: [
            { path: 'AGENTS.md', mode: 'canonical' },
            { path: 'CLAUDE.md', mode: 'copy', transform: { prefix: 'claude' } },
          ],
        },
        skills: {
          source: '.skills',
          behavior: 'mirror',
          flatten: true,
          prefix: 'pair',
          description: 'Agent skills',
          targets: [{ path: '.claude/skills/', mode: 'canonical' }],
        },
      },
    }

    const fs = new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${moduleDir}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${moduleDir}/config.json`]: JSON.stringify(config_json),
        [`${datasetSrc}/.skills/process/next/SKILL.md`]: '# /next — Navigator',
        [`${datasetSrc}/.skills/capability/verify-quality/SKILL.md`]:
          '# /verify-quality — Quality Gate',
        [`${datasetSrc}/AGENTS.md`]:
          '# AGENTS\n\nRun /next to start.\nUse /verify-quality for checks.\n',
        // Pre-existing target (update scenario — project already installed)
        [`${moduleDir}/AGENTS.md`]: '# old agents',
      },
      moduleDir,
      moduleDir,
    )

    const httpClient = new MockHttpClientService()
    const updateConfig: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(updateConfig, fs, { httpClient })

    // Canonical AGENTS.md must have transformed refs
    const agentsContent = await fs.readFile(`${moduleDir}/AGENTS.md`)
    expect(agentsContent).toContain('/pair-process-next')
    expect(agentsContent).not.toMatch(/(?<![a-z-])\/next(?![a-z-])/)

    // Secondary CLAUDE.md must ALSO have transformed refs
    const claudeContent = await fs.readFile(`${moduleDir}/CLAUDE.md`)
    expect(claudeContent).toContain('/pair-process-next')
    expect(claudeContent).toContain('/pair-capability-verify-quality')
    expect(claudeContent).not.toMatch(/(?<![a-z-])\/next(?![a-z-])/)
    expect(claudeContent).not.toMatch(/(?<![a-z-])\/verify-quality(?![a-z-])/)
  })
})

describe('Bug 5: skill ref rewrite with agents-before-skills config order', () => {
  test('AGENTS.md refs are rewritten even when agents registry precedes skills in config', async () => {
    // Real config order: github, knowledge, adoption, agents, skills
    // agents is processed BEFORE skills in the loop, but the rewrite must
    // happen AFTER all registries (including skills) are processed.
    const moduleDir = '/project'
    const datasetSrc = `${moduleDir}/packages/knowledge-hub/dataset`

    // Deliberately put agents BEFORE skills (matches real config.json)
    const config_json = {
      asset_registries: {
        agents: {
          source: 'AGENTS.md',
          behavior: 'mirror',
          description: 'AI agents guidance',
          targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
        },
        skills: {
          source: '.skills',
          behavior: 'mirror',
          flatten: true,
          prefix: 'pair',
          description: 'Agent skills',
          targets: [{ path: '.claude/skills/', mode: 'canonical' }],
        },
      },
    }

    const fs = new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${moduleDir}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${moduleDir}/config.json`]: JSON.stringify(config_json),
        [`${datasetSrc}/.skills/process/implement/SKILL.md`]: '# /implement — Task Impl',
        [`${datasetSrc}/.skills/capability/verify-quality/SKILL.md`]:
          '# /verify-quality — Quality Gate',
        [`${datasetSrc}/AGENTS.md`]:
          '# AGENTS\n\nRun /implement to start.\nUse /verify-quality for checks.\n',
        // Pre-existing AGENTS.md at target (update scenario)
        [`${moduleDir}/AGENTS.md`]: '# old agents',
      },
      moduleDir,
      moduleDir,
    )

    const httpClient = new MockHttpClientService()
    const updateConfig: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(updateConfig, fs, { httpClient })

    const agentsContent = await fs.readFile(`${moduleDir}/AGENTS.md`)
    // Skill refs MUST be transformed regardless of registry processing order
    expect(agentsContent).toContain('/pair-process-implement')
    expect(agentsContent).toContain('/pair-capability-verify-quality')
    expect(agentsContent).not.toMatch(/(?<![a-z-])\/implement(?![a-z-])/)
    expect(agentsContent).not.toMatch(/(?<![a-z-])\/verify-quality(?![a-z-])/)
  })
})

describe('#238: idempotent skill name registry (manifest-backed)', () => {
  const moduleDir = '/project'
  const datasetSrc = `${moduleDir}/packages/knowledge-hub/dataset`

  function skillsAgentsConfig(prefix: string) {
    return {
      asset_registries: {
        skills: {
          source: '.skills',
          behavior: 'mirror',
          flatten: true,
          prefix,
          description: 'Agent skills',
          targets: [{ path: '.claude/skills/', mode: 'canonical' }],
        },
        agents: {
          source: 'AGENTS.md',
          behavior: 'mirror',
          description: 'AI agents guidance',
          targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
        },
      },
    }
  }

  function seedFs(prefix: string) {
    return new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({
          name: 'test-project',
          version: '0.1.0',
        }),
        [`${moduleDir}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${moduleDir}/config.json`]: JSON.stringify(skillsAgentsConfig(prefix)),
        [`${datasetSrc}/.skills/process/next/SKILL.md`]:
          '---\nname: next\n---\n# /next\n\nComposes /verify-quality.\n',
        [`${datasetSrc}/.skills/capability/verify-quality/SKILL.md`]:
          '---\nname: verify-quality\n---\n# /verify-quality\n',
        [`${datasetSrc}/AGENTS.md`]: '# AGENTS\n\nRun /next to get started.\n',
      },
      moduleDir,
      moduleDir,
    )
  }

  test('AC4: install -> update -> update produces byte-identical skill, AGENTS.md and manifest content', async () => {
    const fs = seedFs('pair')
    const httpClient = new MockHttpClientService()

    const installConfig: InstallCommandConfig = {
      command: 'install',
      resolution: 'default',
      kb: true,
      offline: false,
    }
    await handleInstallCommand(installConfig, fs, { httpClient })

    const skillPath = `${moduleDir}/.claude/skills/pair-process-next/SKILL.md`
    const agentsPath = `${moduleDir}/AGENTS.md`
    const manifestPath = `${moduleDir}/.pair/.skill-name-map.json`

    const afterInstall = {
      skill: await fs.readFile(skillPath),
      agents: await fs.readFile(agentsPath),
      manifest: await fs.readFile(manifestPath),
    }

    // Sanity: rewriting actually happened
    expect(afterInstall.agents).toContain('/pair-process-next')
    expect(afterInstall.manifest).toContain('pair-process-next')

    const updateConfig: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(updateConfig, fs, { httpClient, persistBackup: false })
    const afterUpdate1 = {
      skill: await fs.readFile(skillPath),
      agents: await fs.readFile(agentsPath),
      manifest: await fs.readFile(manifestPath),
    }
    expect(afterUpdate1).toEqual(afterInstall)

    await handleUpdateCommand(updateConfig, fs, { httpClient, persistBackup: false })
    const afterUpdate2 = {
      skill: await fs.readFile(skillPath),
      agents: await fs.readFile(agentsPath),
      manifest: await fs.readFile(manifestPath),
    }
    expect(afterUpdate2).toEqual(afterUpdate1)
  })

  test('AC4 edge case: prefix change removes the old flattened dir and rewrites already-installed references recorded in the manifest', async () => {
    // Simulates the state left behind by a previous install/update run with
    // prefix "pair": the manifest, the flattened skill dir, and a stale
    // reference baked into an `add`-behavior adoption doc that is never
    // re-derived from source (so it can only be fixed via the recorded
    // mapping, not by re-copying).
    const fs = new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({
          name: 'test-project',
          version: '0.1.0',
        }),
        [`${moduleDir}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${moduleDir}/config.json`]: JSON.stringify({
          asset_registries: {
            skills: {
              source: '.skills',
              behavior: 'mirror',
              flatten: true,
              prefix: 'foo', // prefix changed from "pair" to "foo"
              description: 'Agent skills',
              targets: [{ path: '.claude/skills/', mode: 'canonical' }],
            },
            adoption: {
              source: 'adoption',
              behavior: 'add', // never re-copied once a file exists at target
              description: 'Adoption doc',
              targets: [{ path: '.pair/adoption/', mode: 'canonical' }],
            },
          },
        }),
        [`${datasetSrc}/.skills/process/next/SKILL.md`]: '---\nname: next\n---\n# /next\n',
        [`${datasetSrc}/adoption/ADOPTED.md`]:
          '# fresh adoption doc (never used — target pre-exists)\n',
        // Previous run's leftovers:
        [`${moduleDir}/.pair/.skill-name-map.json`]: JSON.stringify({
          version: 1,
          skills: { next: 'pair-process-next' },
        }),
        [`${moduleDir}/.claude/skills/pair-process-next/SKILL.md`]:
          '---\nname: pair-process-next\n---\n# /pair-process-next\n',
        [`${moduleDir}/.pair/adoption/ADOPTED.md`]: 'Use /pair-process-next for planning.\n',
      },
      moduleDir,
      moduleDir,
    )

    const updateConfig: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }
    await handleUpdateCommand(updateConfig, fs, { persistBackup: false })

    // Old prefixed directory is gone, new one exists
    await expect(fs.exists(`${moduleDir}/.claude/skills/pair-process-next/SKILL.md`)).resolves.toBe(
      false,
    )
    await expect(fs.exists(`${moduleDir}/.claude/skills/foo-process-next/SKILL.md`)).resolves.toBe(
      true,
    )

    // The `add`-behavior file was never re-copied, but its stale reference
    // is rewritten via the recorded previous mapping.
    const adoptionContent = await fs.readFile(`${moduleDir}/.pair/adoption/ADOPTED.md`)
    expect(adoptionContent).toBe('Use /foo-process-next for planning.\n')

    // Manifest reflects the new mapping for the next run
    const manifest = JSON.parse(await fs.readFile(`${moduleDir}/.pair/.skill-name-map.json`))
    expect(manifest.skills.next).toBe('foo-process-next')
  })

  test('AC4 edge case: a reference to a removed skill is left as-is (not rewritten, not deleted)', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({
          name: 'test-project',
          version: '0.1.0',
        }),
        [`${moduleDir}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${moduleDir}/config.json`]: JSON.stringify({
          asset_registries: {
            skills: {
              source: '.skills',
              behavior: 'mirror',
              flatten: true,
              prefix: 'pair',
              description: 'Agent skills',
              targets: [{ path: '.claude/skills/', mode: 'canonical' }],
            },
            adoption: {
              source: 'adoption',
              behavior: 'add',
              description: 'Adoption doc',
              targets: [{ path: '.pair/adoption/', mode: 'canonical' }],
            },
          },
        }),
        // "oldskill" no longer exists in the source dataset — only "next" remains
        [`${datasetSrc}/.skills/process/next/SKILL.md`]: '---\nname: next\n---\n# /next\n',
        [`${datasetSrc}/adoption/ADOPTED.md`]:
          '# fresh adoption doc (never used — target pre-exists)\n',
        [`${moduleDir}/.pair/.skill-name-map.json`]: JSON.stringify({
          version: 1,
          skills: { next: 'pair-process-next', oldskill: 'pair-capability-oldskill' },
        }),
        [`${moduleDir}/.claude/skills/pair-process-next/SKILL.md`]:
          '---\nname: pair-process-next\n---\n# /pair-process-next\n',
        [`${moduleDir}/.pair/adoption/ADOPTED.md`]:
          'Use /pair-capability-oldskill for the legacy flow.\n',
      },
      moduleDir,
      moduleDir,
    )

    const updateConfig: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }
    await handleUpdateCommand(updateConfig, fs, { persistBackup: false })

    // Left exactly as-is — there is no correct new name to rewrite it to
    const adoptionContent = await fs.readFile(`${moduleDir}/.pair/adoption/ADOPTED.md`)
    expect(adoptionContent).toBe('Use /pair-capability-oldskill for the legacy flow.\n')

    // The removed skill's own installed dir is gone (mirror cleanup)
    await expect(
      fs.exists(`${moduleDir}/.claude/skills/pair-capability-oldskill/SKILL.md`),
    ).resolves.toBe(false)
  })
})

/**
 * #257: `.pair/working/` excluded from KB registries + adoption path override (D14)
 *
 * Checkpoints and reports live outside every asset registry so `pair update`
 * never touches them — round-trip content must stay byte-identical.
 */
describe('#257: working area excluded from update (D14)', () => {
  test('populated working area survives update byte-identical (default path)', async () => {
    const cwd = '/project'
    const datasetSrc = `${cwd}/packages/knowledge-hub/dataset`

    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            knowledge: {
              source: '.pair/knowledge',
              behavior: 'mirror',
              description: 'Knowledge base',
              targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            },
          },
        }),
        [`${datasetSrc}/.pair/knowledge/guide.md`]: '# New Guide',
        [`${cwd}/.pair/knowledge/guide.md`]: '# Old Guide',
        // Operational working area — must survive untouched
        [`${cwd}/.pair/working/checkpoints/story-257.md`]: 'DO NOT TOUCH: checkpoint',
        [`${cwd}/.pair/working/reports/quality/report-1.md`]: 'DO NOT TOUCH: report',
      },
      cwd,
      cwd,
    )

    const httpClient = new MockHttpClientService()
    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(config, fs, { httpClient })

    // Registry content was updated as expected
    expect(await fs.readFile(`${cwd}/.pair/knowledge/guide.md`)).toBe('# New Guide')

    // Working area is byte-identical to before the update
    expect(await fs.readFile(`${cwd}/.pair/working/checkpoints/story-257.md`)).toBe(
      'DO NOT TOUCH: checkpoint',
    )
    expect(await fs.readFile(`${cwd}/.pair/working/reports/quality/report-1.md`)).toBe(
      'DO NOT TOUCH: report',
    )
  })

  test('rejects an update whose registry accidentally covers the working area, leaving files untouched', async () => {
    const cwd = '/project'
    const datasetSrc = `${cwd}/packages/knowledge-hub/dataset`

    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            pairroot: {
              source: '.pair',
              behavior: 'mirror',
              description: 'Accidentally mirrors the whole .pair root',
              targets: [{ path: '.pair', mode: 'canonical' }],
            },
          },
        }),
        [`${datasetSrc}/.pair/knowledge.md`]: '# KB',
        [`${cwd}/.pair/knowledge.md`]: '# old KB',
        [`${cwd}/.pair/working/checkpoints/story-257.md`]: 'DO NOT TOUCH',
      },
      cwd,
      cwd,
    )

    const httpClient = new MockHttpClientService()
    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await expect(handleUpdateCommand(config, fs, { httpClient })).rejects.toThrow(/reserved path/)

    // Nothing was touched — validation rejected the config before any copy ran
    expect(await fs.readFile(`${cwd}/.pair/working/checkpoints/story-257.md`)).toBe('DO NOT TOUCH')
    expect(await fs.readFile(`${cwd}/.pair/knowledge.md`)).toBe('# old KB')
  })

  test('respects an overridden working_path, excluding it from update instead of the default path', async () => {
    const cwd = '/project'
    const datasetSrc = `${cwd}/packages/knowledge-hub/dataset`

    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${cwd}/config.json`]: JSON.stringify({
          working_path: '.pair/scratch',
          asset_registries: {
            knowledge: {
              source: '.pair/knowledge',
              behavior: 'mirror',
              description: 'Knowledge base',
              targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            },
          },
        }),
        [`${datasetSrc}/.pair/knowledge/guide.md`]: '# New Guide',
        [`${cwd}/.pair/knowledge/guide.md`]: '# Old Guide',
        // Overridden working area — must survive untouched
        [`${cwd}/.pair/scratch/checkpoints/story-257.md`]: 'DO NOT TOUCH: overridden path',
      },
      cwd,
      cwd,
    )

    const httpClient = new MockHttpClientService()
    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(config, fs, { httpClient })

    expect(await fs.readFile(`${cwd}/.pair/knowledge/guide.md`)).toBe('# New Guide')
    expect(await fs.readFile(`${cwd}/.pair/scratch/checkpoints/story-257.md`)).toBe(
      'DO NOT TOUCH: overridden path',
    )
  })
})
