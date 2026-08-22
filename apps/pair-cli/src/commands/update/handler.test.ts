import { describe, expect, beforeEach, vi, test } from 'vitest'
import { handleUpdateCommand } from './handler'
import type { UpdateCommandConfig } from './parser'
import { handleInstallCommand } from '../install/handler'
import type { InstallCommandConfig } from '../install/parser'
import {
  BackupService,
  buildTestResponse,
  InMemoryFileSystemService,
  MockHttpClientService,
  toIncomingMessage,
} from '@pair/content-ops'

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

  /**
   * US-395 review round 5: an explicit `--url` is no longer outranked by a monorepo dataset,
   * so this case now really downloads. It used to pass while asserting nothing about the
   * URL — the spy on `getKnowledgeHubDatasetPathWithFallback` never intercepted anything
   * (`resolveDatasetRoot` calls it inside its own module) and the monorepo dataset seeded in
   * `beforeEach` produced the expected content whatever the url was.
   */
  test('supports remote resolution by updating from what the url served', async () => {
    const url = 'https://example.com/kb.zip'
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(fs, 'extractZip').mockImplementation(async (_zipPath, targetPath) => {
      await fs.writeFile(`${targetPath}/manifest.json`, JSON.stringify({ name: 'acme-kb' }))
      await fs.writeFile(`${targetPath}/test-registry/file1.md`, '# Content from the url')
    })
    httpClient.setRequestResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' })),
    ])
    httpClient.setGetResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data')),
      toIncomingMessage(buildTestResponse(404)),
    ])

    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'remote',
      url,
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(config, fs, { httpClient })

    expect(httpClient.getUrls()[0]).toBe(url)
    const content = await fs.readFile(`${cwd}/.pair/test-registry/file1.md`)
    expect(content).toBe('# Content from the url')

    consoleLogSpy.mockRestore()
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
              source: '.pair/adoption/tech',
              behavior: 'mirror',
              description: 'Tech adoption files',
              targets: [{ path: '.pair/adoption/tech', mode: 'canonical' }],
            },
          },
        }),
        [`${datasetSrc}/.pair/adoption/tech/tech-stack.md`]: '# Tech Stack\n\nStack content.',
        // Pre-existing file (update scenario)
        [`${cwd}/.pair/adoption/tech/tech-stack.md`]: '# Old Stack',
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

/**
 * #261: update records the applied KB version (AC4 "record it" loop) and
 * prints a non-blocking drift hint (AC3) when the recorded version differs
 * from the one about to be applied.
 */
describe('update — KB version recording (#261)', () => {
  const cwd = '/version-test-project'
  const datasetSrc = `${cwd}/packages/knowledge-hub/dataset`

  function baseFiles(kbVersion?: string, priorInstalledVersion?: string) {
    return {
      [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
      [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
        name: '@pair/knowledge-hub',
        ...(kbVersion && { version: kbVersion }),
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
      [`${datasetSrc}/test-registry/file1.md`]: '# New Content',
      [`${cwd}/.pair/test-registry/file1.md`]: '# Old Content',
      ...(priorInstalledVersion && {
        [`${cwd}/.pair/.kb-version.json`]: JSON.stringify({ version: priorInstalledVersion }),
      }),
    }
  }

  test('records the updated KB version on success', async () => {
    const fs = new InMemoryFileSystemService(baseFiles('1.2.0'), cwd, cwd)

    await handleUpdateCommand(
      { command: 'update', resolution: 'default', kb: true, offline: false },
      fs,
    )

    expect(await fs.exists(`${cwd}/.pair/.kb-version.json`)).toBe(true)
    const marker = JSON.parse(await fs.readFile(`${cwd}/.pair/.kb-version.json`))
    expect(marker.version).toBe('1.2.0')
  })

  test('prints a non-blocking drift hint with migration URL when versions differ', async () => {
    const fs = new InMemoryFileSystemService(baseFiles('1.2.0', '1.1.0'), cwd, cwd)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await handleUpdateCommand(
      { command: 'update', resolution: 'default', kb: true, offline: false },
      fs,
    )

    const output = logSpy.mock.calls.map(args => args.join(' ')).join('\n')
    expect(output).toContain('KB version drift')
    expect(output).toContain('Migration guide')

    const marker = JSON.parse(await fs.readFile(`${cwd}/.pair/.kb-version.json`))
    expect(marker.version).toBe('1.2.0')

    logSpy.mockRestore()
  })

  test('does not write a marker when the KB source carries no version metadata', async () => {
    const fs = new InMemoryFileSystemService(baseFiles(), cwd, cwd)

    await handleUpdateCommand(
      { command: 'update', resolution: 'default', kb: true, offline: false },
      fs,
    )

    expect(await fs.exists(`${cwd}/.pair/.kb-version.json`)).toBe(false)
  })
})

/**
 * Moved from cli-link.e2e.test.ts (#199 test reorg) — genuine gap: no coverage of the
 * options.linkStyle wire-through on update. The former e2e version chained a real
 * installCommand call first only to satisfy the "targets must exist" precondition; per
 * the confirmed reorg decision, we reseed that pre-existing state directly via fs writes
 * instead, matching this file's own fixture convention (see BUG #04 above).
 */
describe('update — linkStyle option', () => {
  const cwd = '/project'
  const datasetSrc = `${cwd}/packages/knowledge-hub/dataset`

  function seedFs() {
    return new InMemoryFileSystemService(
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
          },
        }),
        [`${datasetSrc}/.pair/knowledge/guide.md`]: '# New Guide',
        // Pre-existing target — simulates a project already installed, without
        // chaining a real install call.
        [`${cwd}/.pair/knowledge/guide.md`]: '# Old Guide',
      },
      cwd,
      cwd,
    )
  }

  test('updates successfully with linkStyle: absolute', async () => {
    const fs = seedFs()
    const httpClient = new MockHttpClientService()

    await handleUpdateCommand(
      { command: 'update', resolution: 'default', kb: true, offline: false },
      fs,
      { httpClient, linkStyle: 'absolute' },
    )

    expect(await fs.readFile(`${cwd}/.pair/knowledge/guide.md`)).toBe('# New Guide')
  })

  test('updates successfully with linkStyle: auto', async () => {
    const fs = seedFs()
    const httpClient = new MockHttpClientService()

    await handleUpdateCommand(
      { command: 'update', resolution: 'default', kb: true, offline: false },
      fs,
      { httpClient, linkStyle: 'auto' },
    )

    expect(await fs.readFile(`${cwd}/.pair/knowledge/guide.md`)).toBe('# New Guide')
  })
})

/**
 * Moved from cli-packaging.e2e.test.ts (#199 test reorg) — 'update distributes skills
 * with flatten + prefix to canonical target' was a redundant duplicate of the #238 AC4
 * test above and was deleted; only the secondary (symlink) target assertion below was a
 * genuine gap.
 */
describe('update — skills registry secondary (symlink) targets', () => {
  test('creates symlinks for secondary skills targets', async () => {
    const cwd = '/test-skills-symlink'
    const datasetBase = `${cwd}/dataset`
    const seed: Record<string, string> = {
      // Pre-existing target for a different registry — satisfies the "already installed"
      // precondition without pre-seeding the skills target itself.
      [`${cwd}/.pair/knowledge/old.md`]: '# old',
      [`${datasetBase}/.pair/knowledge/index.md`]: '# Knowledge Base',
      [`${datasetBase}/.skills/next/SKILL.md`]:
        '---\nname: next\ndescription: Project navigator\n---\n# /next',
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            description: 'Knowledge base content',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
          },
          skills: {
            source: '.skills',
            behavior: 'mirror',
            flatten: true,
            prefix: 'pair',
            description: 'Agent skills distributed to AI tool directories',
            targets: [
              { path: '.claude/skills/', mode: 'canonical' },
              { path: '.github/skills/', mode: 'symlink' },
              { path: '.cursor/skills/', mode: 'symlink' },
            ],
          },
        },
      }),
    }
    const fs = new InMemoryFileSystemService(seed, cwd, cwd)

    await handleUpdateCommand(
      { command: 'update', resolution: 'local', path: datasetBase, offline: true, kb: true },
      fs,
    )

    const symlinks = fs.getSymlinks()
    expect(symlinks.has(`${cwd}/.github/skills`)).toBe(true)
    expect(symlinks.has(`${cwd}/.cursor/skills`)).toBe(true)
  })
})

/**
 * Moved from cli-update.e2e.test.ts (#199 test reorg) — the former e2e tests had zero
 * real assertions (only checked the call didn't throw). 'absolute path ZIP' is covered
 * (with real assertions) by the 'uses installKBFromLocalZip for .zip local resolution'
 * test above; 'relative path ZIP' and 'relative path directory' were genuinely uncovered
 * anywhere, so they are added here with real assertions.
 */
describe('update — local source path styles (#199 reorg)', () => {
  test('updates from a local .zip source given as a relative path', async () => {
    const cwd = '/project'
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
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
        // Pre-existing target — project already installed
        [`${cwd}/.pair/test-registry/file1.md`]: '# Old Content',
      },
      cwd,
      cwd,
    )

    const kbInstaller = await import('#kb-manager/kb-installer')
    const extractedPath = '/cached/unzipped-rel-update'
    vi.spyOn(kbInstaller, 'installKBFromLocalZip').mockResolvedValue(extractedPath)
    await fs.writeFile(`${extractedPath}/test-registry/file1.md`, '# New Content')

    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'local',
      path: './downloads/kb.zip',
      kb: true,
      offline: true,
    }

    await handleUpdateCommand(config, fs)

    expect(await fs.readFile(`${cwd}/.pair/test-registry/file1.md`)).toBe('# New Content')
  })

  test('updates from a local directory source given as a relative path', async () => {
    const cwd = '/project'
    const dirPath = 'dataset'
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
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
        // Dataset source (relative dir, resolved against CWD) — AGENTS.md marks it as a valid KB
        [`${cwd}/${dirPath}/AGENTS.md`]: 'this is agents.md',
        [`${cwd}/${dirPath}/test-registry/file1.md`]: '# New Content',
        // Pre-existing target — project already installed
        [`${cwd}/.pair/test-registry/file1.md`]: '# Old Content',
      },
      cwd,
      cwd,
    )

    const config: UpdateCommandConfig = {
      command: 'update',
      resolution: 'local',
      path: `./${dirPath}`,
      kb: true,
      offline: true,
    }

    await handleUpdateCommand(config, fs)

    expect(await fs.readFile(`${cwd}/.pair/test-registry/file1.md`)).toBe('# New Content')
  })
})

/**
 * #407 — the wiring, at the layer the story names: `pair update` reads
 * `flattenDepth` from the registry config and the copy pipeline honours it.
 * Without the resolver/validation/buildCopyOptions chain the option is dropped
 * silently and this installs the sibling `pair-process-review-references/`.
 */
describe('#407: a skill nested references/ dir installs inside the skill via pair update', () => {
  const moduleDir = '/project'
  const datasetSrc = `${moduleDir}/packages/knowledge-hub/dataset`

  const configWith = (flattenDepth?: number) => ({
    asset_registries: {
      skills: {
        source: '.skills',
        behavior: 'mirror',
        flatten: true,
        ...(flattenDepth !== undefined && { flattenDepth }),
        prefix: 'pair',
        description: 'Agent skills',
        targets: [{ path: '.claude/skills/', mode: 'canonical' }],
      },
    },
  })

  const seed = (flattenDepth?: number) =>
    new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${moduleDir}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${moduleDir}/config.json`]: JSON.stringify(configWith(flattenDepth)),
        [`${datasetSrc}/.skills/process/review/SKILL.md`]:
          '---\nname: review\n---\n# /review\nDetail in [deep dive](./references/deep.md).',
        [`${datasetSrc}/.skills/process/review/references/deep.md`]:
          '# Deep dive\nBack to [SKILL](../SKILL.md).',
        // Pre-existing target — `update` requires the project to be installed.
        [`${moduleDir}/.claude/skills/pair-process-review/SKILL.md`]: '# stale',
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

  test('installs it inside the skill, with both links intact', async () => {
    const fs = seed(2)
    await handleUpdateCommand(updateConfig, fs, { httpClient: new MockHttpClientService() })

    const installed = `${moduleDir}/.claude/skills/pair-process-review`
    expect(await fs.exists(`${installed}/references/deep.md`)).toBe(true)
    expect(
      await fs.exists(`${moduleDir}/.claude/skills/pair-process-review-references/deep.md`),
    ).toBe(false)
    expect(await fs.readFile(`${installed}/SKILL.md`)).toContain(
      '[deep dive](./references/deep.md)',
    )
    expect(await fs.readFile(`${installed}/references/deep.md`)).toContain('[SKILL](../SKILL.md)')
  })

  test('without flattenDepth the same dataset still installs the pre-#407 sibling layout', async () => {
    const fs = seed()
    await handleUpdateCommand(updateConfig, fs, { httpClient: new MockHttpClientService() })

    expect(
      await fs.exists(`${moduleDir}/.claude/skills/pair-process-review-references/deep.md`),
    ).toBe(true)
  })

  test('rejects a config typo instead of silently flattening everything', async () => {
    const fs = seed(0)
    await expect(
      handleUpdateCommand(updateConfig, fs, { httpClient: new MockHttpClientService() }),
    ).rejects.toThrow(/flattenDepth must be a positive integer/)
  })
})

/**
 * US-396 — update reports on the same contract as install: a registry the source does not
 * ship is SKIPPED (not counted as updated), and the exit code follows the tally instead of
 * being 0 whatever happened.
 */
describe('US-396: update distinguishes skipped from updated, and the exit code follows', () => {
  const cwd = '/consumer'
  const kb = '/acme-kb'

  const twoRegistries = {
    asset_registries: {
      knowledge: {
        source: '.pair/knowledge',
        behavior: 'mirror',
        targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
        description: 'KB',
      },
      github: {
        source: '.github',
        behavior: 'mirror',
        targets: [{ path: '.github', mode: 'canonical' }],
        description: 'GH',
      },
    },
  }

  const sourceUpdate: UpdateCommandConfig = {
    command: 'update',
    resolution: 'local',
    path: kb,
    offline: true,
    kb: true,
  }

  function consumerFs(extra: Record<string, string> = {}) {
    return new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify(twoRegistries),
        [`${cwd}/package.json`]: JSON.stringify({ name: 'consumer', version: '0.1.0' }),
        // Already installed, so update has something to work on
        [`${cwd}/.pair/knowledge/guide.md`]: '# Old guide',
        [`${kb}/.pair/knowledge/guide.md`]: '# New guide',
        ...extra,
      },
      cwd,
      cwd,
    )
  }

  test('a registry the source does not ship is reported as skipped, not as updated', async () => {
    const fs = consumerFs()
    const lines: string[] = []
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(m => {
      lines.push(String(m))
    })

    const exitCode = await handleUpdateCommand(sourceUpdate, fs, { autoRollback: false })
    consoleSpy.mockRestore()

    expect(exitCode).toBe(0)
    const printed = lines.join('\n')
    expect(printed).toContain('1 ok, 1 skipped')
    expect(printed).toContain('not shipped by this source')
    expect(printed).toContain('github')
    expect(await fs.readFile(`${cwd}/.pair/knowledge/guide.md`)).toContain('# New guide')
  })

  test('a run that updates nothing does not report success', async () => {
    // The source ships neither registry — nothing to update, so the status code must say so
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify(twoRegistries),
        [`${cwd}/package.json`]: JSON.stringify({ name: 'consumer', version: '0.1.0' }),
        [`${cwd}/.pair/knowledge/guide.md`]: '# Old guide',
        // A valid KB that simply ships neither of the registries this project installs
        [`${kb}/AGENTS.md`]: '# Agents',
        [`${kb}/.pair/other/thing.md`]: '# unrelated',
      },
      cwd,
      cwd,
    )

    const exitCode = await handleUpdateCommand(sourceUpdate, fs, { autoRollback: false })

    expect(exitCode).toBe(1)
    // ...and the old content is still there: "nothing to update" is not "wiped"
    expect(await fs.readFile(`${cwd}/.pair/knowledge/guide.md`)).toContain('# Old guide')
  })

  test('a run that updates nothing records no version marker', async () => {
    // The marker is what `kb-info` and the drift hint read. Written after a run that
    // applied nothing, it reports the project as running that KB version and SILENCES the
    // drift warning it exists to raise (US-396 review round 3).
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify(twoRegistries),
        [`${cwd}/package.json`]: JSON.stringify({ name: 'consumer', version: '0.1.0' }),
        [`${cwd}/.pair/knowledge/guide.md`]: '# Old guide',
        [`${kb}/package.json`]: JSON.stringify({ name: 'acme-kb', version: '9.9.9' }),
        [`${kb}/AGENTS.md`]: '# Agents',
      },
      cwd,
      cwd,
    )

    const exitCode = await handleUpdateCommand(sourceUpdate, fs, { autoRollback: false })

    expect(exitCode).toBe(1)
    expect(await fs.exists(`${cwd}/.pair/.kb-version.json`)).toBe(false)
  })

  test('the summary prints AFTER the post-copy steps, never above a rollback', async () => {
    // `--link-style` runs after the copies and can throw, which rolls the whole run back.
    // Printed inside `updateRegistries`, the summary reached the console FIRST: the user
    // read `✓ Update complete (…)`, then `Rolling back...`, then an error, then exit 1.
    const fs = consumerFs()
    const printed: string[] = []
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(m => {
      printed.push(String(m))
    })
    // The backup commit is the one post-copy step that does NOT swallow its own error
    // (`applyLinkTransformation`, `writeProjectLlmsTxt` and `recordInstalledVersion` all
    // do), so it is the reachable path where a run is declared complete and then rolled
    // back.
    vi.spyOn(BackupService.prototype, 'commit').mockRejectedValue(
      new Error('post-copy step exploded'),
    )

    await expect(handleUpdateCommand(sourceUpdate, fs, { linkStyle: 'relative' })).rejects.toThrow(
      /exploded/,
    )
    consoleSpy.mockRestore()

    expect(printed.join('\n')).toContain('Rolling back')
    expect(printed.join('\n')).not.toContain('Update complete')
  })
})

/**
 * US-396 — `update --source` reads the source KB's declaration exactly as `install --source`
 * does. It did not, and the FIRST update after a successful install therefore re-installed
 * the same skills under the CLI's default prefix, leaving both copies behind (skills is
 * `overwrite`, so nothing cleans the first one up) — the very duplicate `prefix` exists to
 * prevent, in a state install alone could never produce.
 */
describe('US-396: update honours the source KB declaration, like install', () => {
  const cwd = '/consumer'
  const kb = '/acme-kb'

  const baseConfig = {
    asset_registries: {
      knowledge: {
        source: '.pair/knowledge',
        behavior: 'mirror',
        targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
        description: 'KB',
      },
      skills: {
        source: '.skills',
        behavior: 'overwrite',
        flatten: true,
        flattenDepth: 2,
        prefix: 'pair',
        targets: [{ path: '.claude/skills/', mode: 'canonical' }],
        description: 'Skills',
      },
    },
  }

  const named = { path: kb, offline: true, kb: true } as const
  const install: InstallCommandConfig = { command: 'install', resolution: 'local', ...named }
  const update: UpdateCommandConfig = { command: 'update', resolution: 'local', ...named }

  function consumerFs(extra: Record<string, string> = {}) {
    return new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify(baseConfig),
        [`${cwd}/package.json`]: JSON.stringify({ name: 'consumer', version: '0.1.0' }),
        [`${kb}/.pair/knowledge/guide.md`]: '# Acme guide',
        [`${kb}/.skills/example-skill/SKILL.md`]: '---\nname: example-skill\n---\n',
        [`${kb}/pair.config.json`]: JSON.stringify({
          asset_registries: { skills: { prefix: 'acme-kb' } },
        }),
        ...extra,
      },
      cwd,
      cwd,
    )
  }

  test('the declared prefix survives an install → update round trip, with no duplicate skill', async () => {
    const fs = consumerFs()

    expect(await handleInstallCommand(install, fs)).toBe(0)
    expect(await fs.exists(`${cwd}/.claude/skills/acme-kb-example-skill/SKILL.md`)).toBe(true)

    expect(await handleUpdateCommand(update, fs, { autoRollback: false })).toBe(0)

    expect(await fs.exists(`${cwd}/.claude/skills/acme-kb-example-skill/SKILL.md`)).toBe(true)
    expect(await fs.exists(`${cwd}/.claude/skills/pair-example-skill/SKILL.md`)).toBe(false)
  })

  test('a registry the source declares but this CLI does not know is skipped on update too', async () => {
    const fs = consumerFs({
      [`${kb}/pair.config.json`]: JSON.stringify({
        asset_registries: { skills: { prefix: 'acme-kb' }, telemetry: { source: '.telemetry' } },
      }),
    })
    await handleInstallCommand(install, fs)

    const lines: string[] = []
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(m => {
      lines.push(String(m))
    })
    await handleUpdateCommand(update, fs, { autoRollback: false })
    consoleSpy.mockRestore()

    const printed = lines.join('\n')
    expect(printed).toContain('declared by source, unknown to this CLI')
    expect(printed).toContain('telemetry')
    expect(await fs.exists(`${cwd}/telemetry`)).toBe(false)
  })

  test('the announced registry count covers every registry the summary tallies', async () => {
    // Same split as install: `startOperation` counted only the known registries while the
    // tally the summary is built from also carries the declared-but-unknown ones.
    const fs = consumerFs({
      [`${kb}/pair.config.json`]: JSON.stringify({
        asset_registries: { skills: { prefix: 'acme-kb' }, telemetry: { source: '.telemetry' } },
      }),
    })
    await handleInstallCommand(install, fs)

    const lines: string[] = []
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(m => {
      lines.push(String(m))
    })
    await handleUpdateCommand(update, fs, { autoRollback: false })
    consoleSpy.mockRestore()

    const printed = lines.join('\n')
    expect(printed).toContain('Updating 3 registries')
    expect(printed).toContain('2 ok, 1 skipped')
  })

  test('a malformed source declaration is warned about on update, and update continues', async () => {
    const fs = consumerFs({ [`${kb}/pair.config.json`]: '{ broken' })
    await handleInstallCommand(install, fs)

    const warned: string[] = []
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(m => {
      warned.push(String(m))
    })
    const exitCode = await handleUpdateCommand(update, fs, { autoRollback: false })
    warnSpy.mockRestore()

    expect(warned.join('\n')).toContain('pair.config.json')
    expect(exitCode).toBe(0)
  })
})
