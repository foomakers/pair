import { describe, expect, beforeEach, test, vi } from 'vitest'
import { handleInstallCommand } from './handler'
import { parseInstallCommand } from './parser'
import type { InstallCommandConfig } from './parser'
import { createTestFs } from '#test-utils'
import {
  buildTestResponse,
  InMemoryFileSystemService,
  MockHttpClientService,
  toIncomingMessage,
} from '@pair/content-ops'

/**
 * #186: config override via options.config
 *
 * Verifies that handleInstallCommand uses a custom config when
 * options.config is provided, and falls back to base config otherwise.
 */
describe('#186: config override via options.config', () => {
  const cwd = '/test-project'
  const datasetSrc = `${cwd}/packages/knowledge-hub/dataset`

  let fs: ReturnType<typeof createTestFs>

  beforeEach(() => {
    fs = createTestFs(
      {
        asset_registries: {
          github: {
            source: 'github',
            behavior: 'mirror',
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub registry',
          },
        },
      },
      {
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test-pkg', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${datasetSrc}/github/workflow.yml`]: 'content: val',
        [`${datasetSrc}/custom-reg/data.md`]: '# Custom Install Data',
      },
      cwd,
    )
  })

  test('uses custom config registries when options.config is provided', async () => {
    const customConfig = {
      asset_registries: {
        'custom-reg': {
          source: 'custom-reg',
          behavior: 'mirror',
          targets: [{ path: '.custom-target', mode: 'canonical' }],
          description: 'Custom registry',
        },
      },
    }
    await fs.writeFile(`${cwd}/custom-config.json`, JSON.stringify(customConfig))

    const config: InstallCommandConfig = {
      command: 'install',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleInstallCommand(config, fs, {
      config: `${cwd}/custom-config.json`,
    })

    expect(await fs.exists(`${cwd}/.custom-target/data.md`)).toBe(true)
    expect(await fs.readFile(`${cwd}/.custom-target/data.md`)).toBe('# Custom Install Data')
  })

  test('uses base config when options.config is not provided', async () => {
    const config: InstallCommandConfig = {
      command: 'install',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleInstallCommand(config, fs)

    expect(await fs.exists(`${cwd}/.github/workflow.yml`)).toBe(true)
  })

  test('throws when options.config points to non-existent file', async () => {
    const config: InstallCommandConfig = {
      command: 'install',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await expect(
      handleInstallCommand(config, fs, {
        config: `${cwd}/nonexistent.json`,
      }),
    ).rejects.toThrow(/Failed to load custom config/)
  })
})

describe('handleInstallCommand - real services integration', () => {
  const cwd = '/test-project'

  const testConfig = {
    asset_registries: {
      github: {
        source: 'github',
        behavior: 'mirror',
        targets: [{ path: '.github', mode: 'canonical' }],
        description: 'GitHub registry',
      },
    },
  }

  const extraFiles = {
    [`${cwd}/package.json`]: JSON.stringify({ name: 'test-pkg', version: '0.1.0' }),
    [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({ name: '@pair/knowledge-hub' }),
    [`${cwd}/packages/knowledge-hub/dataset/github/workflow.yml`]: 'content: val',
    [`${cwd}/packages/knowledge-hub/dataset/github/README.md`]: '# GitHub Registry',
  }

  let fs: ReturnType<typeof createTestFs>

  beforeEach(() => {
    fs = createTestFs(testConfig, extraFiles, cwd)
  })

  describe('default resolution', () => {
    test('installs from default dataset root found via package.json', async () => {
      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      await handleInstallCommand(config, fs)

      // Verify files were actually copied to the target
      expect(await fs.exists(`${cwd}/.github/workflow.yml`)).toBe(true)
      expect(await fs.exists(`${cwd}/.github/README.md`)).toBe(true)
      expect(await fs.readFile(`${cwd}/.github/workflow.yml`)).toBe('content: val')
    })
  })

  describe('local resolution', () => {
    test('handles local path source to a directory', async () => {
      const externalKbPath = '/external/kb'
      await fs.mkdir(externalKbPath, { recursive: true })
      await fs.mkdir(`${externalKbPath}/my-reg`, { recursive: true })
      await fs.writeFile(`${externalKbPath}/my-reg/file.txt`, 'local content')
      await fs.writeFile(`${externalKbPath}/AGENTS.md`, '# KB marker')

      const localConfig = {
        asset_registries: {
          'my-reg': {
            behavior: 'mirror',
            targets: [{ path: 'dest', mode: 'canonical' }],
            description: 'Local reg',
          },
        },
      }

      // Update config in FS
      await fs.writeFile(`${cwd}/config.json`, JSON.stringify(localConfig))

      const command: InstallCommandConfig = {
        command: 'install',
        resolution: 'local',
        path: externalKbPath,
        offline: true,
        kb: true,
      }

      await handleInstallCommand(command, fs)

      expect(await fs.exists(`${cwd}/dest/file.txt`)).toBe(true)
      expect(await fs.readFile(`${cwd}/dest/file.txt`)).toBe('local content')
    })

    // Moved from cli-install.e2e.test.ts (#199 test reorg) — genuine gap: handler-level
    // content distribution had no coverage with a relative source path.
    test('handles local path source to a directory given as a relative path', async () => {
      await fs.mkdir(`${cwd}/relative-kb/my-reg`, { recursive: true })
      await fs.writeFile(`${cwd}/relative-kb/my-reg/file.txt`, 'relative content')
      await fs.writeFile(`${cwd}/relative-kb/AGENTS.md`, '# KB marker')

      const localConfig = {
        asset_registries: {
          'my-reg': {
            behavior: 'mirror',
            targets: [{ path: 'dest', mode: 'canonical' }],
            description: 'Local reg',
          },
        },
      }
      await fs.writeFile(`${cwd}/config.json`, JSON.stringify(localConfig))

      const command: InstallCommandConfig = {
        command: 'install',
        resolution: 'local',
        path: './relative-kb',
        offline: true,
        kb: true,
      }

      await handleInstallCommand(command, fs)

      expect(await fs.exists(`${cwd}/dest/file.txt`)).toBe(true)
      expect(await fs.readFile(`${cwd}/dest/file.txt`)).toBe('relative content')
    })

    // Moved from cli-install.e2e.test.ts (#199 test reorg) — genuine gap: no handler-level
    // coverage of the local .zip resolution branch (mocked like update/handler.test.ts's
    // equivalent zip test, since real zip extraction is covered by kb-installer.test.ts).
    test('handles local .zip source with an absolute path', async () => {
      const kbInstaller = await import('#kb-manager/kb-installer')
      const extractedPath = '/cached/unzipped-abs'
      vi.spyOn(kbInstaller, 'installKBFromLocalZip').mockResolvedValue(extractedPath)
      await fs.writeFile(`${extractedPath}/my-reg/file.txt`, 'zip content')

      const localConfig = {
        asset_registries: {
          'my-reg': {
            behavior: 'mirror',
            targets: [{ path: 'dest', mode: 'canonical' }],
            description: 'Local reg',
          },
        },
      }
      await fs.writeFile(`${cwd}/config.json`, JSON.stringify(localConfig))

      const command: InstallCommandConfig = {
        command: 'install',
        resolution: 'local',
        path: '/downloads/kb.zip',
        offline: true,
        kb: true,
      }

      await handleInstallCommand(command, fs)

      expect(await fs.exists(`${cwd}/dest/file.txt`)).toBe(true)
      expect(await fs.readFile(`${cwd}/dest/file.txt`)).toBe('zip content')
    })

    test('handles local .zip source with a relative path', async () => {
      const kbInstaller = await import('#kb-manager/kb-installer')
      const extractedPath = '/cached/unzipped-rel'
      vi.spyOn(kbInstaller, 'installKBFromLocalZip').mockResolvedValue(extractedPath)
      await fs.writeFile(`${extractedPath}/my-reg/file.txt`, 'zip content')

      const localConfig = {
        asset_registries: {
          'my-reg': {
            behavior: 'mirror',
            targets: [{ path: 'dest', mode: 'canonical' }],
            description: 'Local reg',
          },
        },
      }
      await fs.writeFile(`${cwd}/config.json`, JSON.stringify(localConfig))

      const command: InstallCommandConfig = {
        command: 'install',
        resolution: 'local',
        path: './downloads/kb.zip',
        offline: true,
        kb: true,
      }

      await handleInstallCommand(command, fs)

      expect(await fs.exists(`${cwd}/dest/file.txt`)).toBe(true)
      expect(await fs.readFile(`${cwd}/dest/file.txt`)).toBe('zip content')
    })
  })

  describe('error handling', () => {
    test('throws when registries are empty', async () => {
      const emptyConfig = { asset_registries: {} }
      await fs.writeFile(`${cwd}/config.json`, JSON.stringify(emptyConfig))

      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      await expect(handleInstallCommand(config, fs)).rejects.toThrow(/asset_registries/)
    })
  })
})

/**
 * #257: `.pair/working/` excluded from KB registries + adoption path override (D14)
 *
 * AC3: a fresh project without a working area is not scaffolded by `pair install` —
 * skills create it on demand later. AC1: install never touches a pre-existing one.
 */
describe('#257: working area exclusion on install (D14)', () => {
  const cwd = '/test-project'

  const testConfig = {
    asset_registries: {
      knowledge: {
        source: '.pair/knowledge',
        behavior: 'mirror',
        targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
        description: 'Knowledge base',
      },
    },
  }

  const extraFiles = {
    [`${cwd}/package.json`]: JSON.stringify({ name: 'test-pkg', version: '0.1.0' }),
    [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({ name: '@pair/knowledge-hub' }),
    [`${cwd}/packages/knowledge-hub/dataset/.pair/knowledge/guide.md`]: '# Guide',
  }

  test('does not scaffold the working area on a fresh install', async () => {
    const fs = createTestFs(testConfig, extraFiles, cwd)

    const config: InstallCommandConfig = {
      command: 'install',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleInstallCommand(config, fs)

    expect(await fs.exists(`${cwd}/.pair/knowledge/guide.md`)).toBe(true)
    expect(await fs.exists(`${cwd}/.pair/working`)).toBe(false)
  })
})

/**
 * Bug regression tests for install handler — same bugs as update handler.
 * See handler.test.ts in update/ for detailed bug descriptions.
 */
describe('install — KB distribution pipeline bug regression', () => {
  describe('Bug 1: skillNameMap cross-registry propagation', () => {
    test('AGENTS.md skill references are transformed after install', async () => {
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
          [`${datasetSrc}/.skills/process/next/SKILL.md`]:
            '# /next — Navigator\n\nUse /verify-quality to check gates.',
          [`${datasetSrc}/.skills/capability/verify-quality/SKILL.md`]:
            '# /verify-quality — Quality Gate',
          [`${datasetSrc}/AGENTS.md`]:
            '# AGENTS\n\nRun /next to get started.\nUse /verify-quality for checks.\n',
        },
        moduleDir,
        moduleDir,
      )

      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      await handleInstallCommand(config, fs)

      const agentsContent = await fs.readFile(`${moduleDir}/AGENTS.md`)
      expect(agentsContent).toContain('/pair-process-next')
      expect(agentsContent).toContain('/pair-capability-verify-quality')
      expect(agentsContent).not.toMatch(/(?<![a-z-])\/next(?![a-z-])/)
    })
  })

  describe('Bug 2: link re-root with deep datasetRoot', () => {
    test('skill links point to .pair/ at target root, not node_modules source', async () => {
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
          [`${datasetSrc}/.skills/process/implement/SKILL.md`]:
            '# /implement\n\nRead [way-of-working](../../../.pair/adoption/tech/way-of-working.md) for config.',
          [`${datasetSrc}/.pair/adoption/tech/way-of-working.md`]: '# Way of Working',
        },
        moduleDir,
        moduleDir,
      )

      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      await handleInstallCommand(config, fs)

      const skillContent = await fs.readFile(
        `${moduleDir}/.claude/skills/pair-process-implement/SKILL.md`,
      )
      expect(skillContent).not.toContain('node_modules')
      expect(skillContent).toContain('.pair/adoption/tech/way-of-working.md')
    })
  })

  describe('#313 T5 prerequisite: multi-file skill dir with deep datasetRoot', () => {
    test('ships sibling files and their cross-references resolve post-install', async () => {
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
          [`${datasetSrc}/.skills/process/implement/SKILL.md`]:
            '# /implement\n\nSee [edge cases](./edge-cases.md) when a step fails.',
          [`${datasetSrc}/.skills/process/implement/edge-cases.md`]:
            '# Edge Cases\n\nBack to [SKILL.md](./SKILL.md).',
        },
        moduleDir,
        moduleDir,
      )

      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      await handleInstallCommand(config, fs)

      const targetDir = `${moduleDir}/.claude/skills/pair-process-implement`
      // Sibling file shipped alongside SKILL.md, not dropped by flatten+prefix
      await expect(fs.exists(`${targetDir}/edge-cases.md`)).resolves.toBe(true)

      const skillContent = await fs.readFile(`${targetDir}/SKILL.md`)
      const edgeCasesContent = await fs.readFile(`${targetDir}/edge-cases.md`)
      // Same-directory cross-references resolve post-install (both files moved together)
      expect(skillContent).toContain('[edge cases](./edge-cases.md)')
      expect(edgeCasesContent).toContain('[SKILL.md](./SKILL.md)')
    })
  })

  describe('Bug 3: target directory resolution', () => {
    test('output targets CWD when rootModuleDir differs', async () => {
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
          [`${moduleDir}/config.json`]: JSON.stringify(registryConfig),
          [`${moduleDir}/package.json`]: JSON.stringify({
            name: '@pair/pair-cli',
            version: '0.1.0',
          }),
          [`${moduleDir}/node_modules/@pair/knowledge-hub/package.json`]: JSON.stringify({
            name: '@pair/knowledge-hub',
          }),
          [`${datasetSrc}/.pair/knowledge/README.md`]: '# Knowledge Base',
        },
        moduleDir,
        userCwd,
      )

      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      await handleInstallCommand(config, fs)

      expect(await fs.exists(`${userCwd}/.pair/knowledge/README.md`)).toBe(true)
    })

    test('baseTarget option overrides CWD (pnpm --filter workaround)', async () => {
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
        },
        packageDir,
        packageDir,
      )

      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
        kb: true,
        offline: false,
      }

      await handleInstallCommand(config, fs, { baseTarget: monorepoRoot })

      expect(await fs.exists(`${monorepoRoot}/.pair/knowledge/README.md`)).toBe(true)
      expect(await fs.exists(`${packageDir}/.pair/knowledge/README.md`)).toBe(false)
    })

    test('baseTarget overrides config.target "." (pnpm --filter + dot target)', async () => {
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
        },
        packageDir,
        packageDir,
      )

      const config: InstallCommandConfig = {
        command: 'install',
        resolution: 'default',
        kb: true,
        offline: false,
        target: '.', // User passed "." on CLI
      }

      // baseTarget from INIT_CWD must override config.target "."
      await handleInstallCommand(config, fs, { baseTarget: monorepoRoot })

      expect(await fs.exists(`${monorepoRoot}/.pair/knowledge/README.md`)).toBe(true)
      expect(await fs.exists(`${packageDir}/.pair/knowledge/README.md`)).toBe(false)
    })
  })
})

describe('install — Bug 4: skill refs in secondary (copy) targets', () => {
  test('CLAUDE.md (copy target) gets skill refs rewritten after install', async () => {
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
      },
      moduleDir,
      moduleDir,
    )

    const installConfig: InstallCommandConfig = {
      command: 'install',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleInstallCommand(installConfig, fs)

    const claudeContent = await fs.readFile(`${moduleDir}/CLAUDE.md`)
    expect(claudeContent).toContain('/pair-process-next')
    expect(claudeContent).toContain('/pair-capability-verify-quality')
    expect(claudeContent).not.toMatch(/(?<![a-z-])\/next(?![a-z-])/)
    expect(claudeContent).not.toMatch(/(?<![a-z-])\/verify-quality(?![a-z-])/)
  })
})

describe('install — llms.txt generation', () => {
  test('generates .pair/llms.txt after install with adopted content', async () => {
    const moduleDir = '/project'
    const datasetSrc = `${moduleDir}/packages/knowledge-hub/dataset`

    const registryConfig = {
      asset_registries: {
        adoption: {
          source: '.pair/tech/adopted',
          behavior: 'mirror',
          description: 'Tech adoption files',
          targets: [{ path: '.pair/tech/adopted', mode: 'canonical' }],
        },
      },
    }

    const fs = new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${moduleDir}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${moduleDir}/config.json`]: JSON.stringify(registryConfig),
        [`${datasetSrc}/.pair/tech/adopted/architecture.md`]: '# Architecture\n\nArch content.',
      },
      moduleDir,
      moduleDir,
    )

    const config: InstallCommandConfig = {
      command: 'install',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleInstallCommand(config, fs)

    expect(await fs.exists(`${moduleDir}/.pair/llms.txt`)).toBe(true)
    const llmsTxt = await fs.readFile(`${moduleDir}/.pair/llms.txt`)
    expect(llmsTxt).toMatch(/^# pair/)
    expect(llmsTxt).toContain('## Adoption — Tech')
    expect(llmsTxt).toContain('[Architecture]')
  })
})

/**
 * BUG 2: dataset root validation
 *
 * When resolveDatasetRoot returns a path that exists but has no content
 * (empty dataset directory), the handler iterates registries and silently
 * produces 0 files installed (each registry's source path doesn't exist,
 * it logs a warning and skips). The handler should reject upfront if the
 * resolved dataset root has no usable content.
 */
/**
 * A source that ships nothing installable is a NO-OP, reported as one — not a raw thrown
 * error (US-396 review round 3).
 *
 * The pre-flight this replaces (`validateDatasetContent`) threw
 * `Dataset root has no content for configured registries (expected: …)` before any summary
 * was built, so the story's own edge case — "report the no-op and the reason" — was
 * reachable in `summary.test.ts` and nowhere in the product. Every registry now prints its
 * resolved source → target, then its skip reason, and the exit code says the run installed
 * nothing.
 */
describe('BUG 2: dataset root validation', () => {
  test('T2.1 — reports a no-op, and writes nothing, when the dataset root has no content', async () => {
    const cwd = '/test-project'

    const testConfig = {
      asset_registries: {
        github: {
          source: 'github',
          behavior: 'mirror',
          targets: [{ path: '.github', mode: 'canonical' }],
          description: 'GitHub registry',
        },
      },
    }

    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify(testConfig),
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test-pkg', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        // dataset/ directory exists but is EMPTY — no github/ subdir, no content
        [`${cwd}/packages/knowledge-hub/dataset/.gitkeep`]: '',
      },
      cwd,
      cwd,
    )

    const config: InstallCommandConfig = {
      command: 'install',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    const lines: string[] = []
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(m => {
      lines.push(String(m))
    })

    const exitCode = await handleInstallCommand(config, fs)
    consoleSpy.mockRestore()

    // Non-zero: nothing was installed, so this is not a success
    expect(exitCode).toBe(1)
    expect(lines.join('\n')).toContain('Nothing to install')
    expect(lines.join('\n')).toContain('not shipped by this source')
    // ...and the project is untouched: no target, no index, no version marker
    expect(await fs.exists(`${cwd}/.github`)).toBe(false)
    expect(await fs.exists(`${cwd}/.pair/llms.txt`)).toBe(false)
    expect(await fs.exists(`${cwd}/.pair/.kb-version.json`)).toBe(false)
  })
})

/**
 * BUG 4: install precondition — targets must not exist
 *
 * `install` = first-time installation. If canonical registry targets already
 * exist, it means the project was already installed. The command should reject
 * with a message suggesting `pair update` instead. Currently it silently
 * overwrites (mirror) or skips (add) existing targets.
 */
describe('BUG 4: install precondition — targets must not exist', () => {
  test('T4.1 — rejects when canonical registry targets already exist', async () => {
    const cwd = '/test-project'

    const testConfig = {
      asset_registries: {
        github: {
          source: 'github',
          behavior: 'mirror',
          targets: [{ path: '.github', mode: 'canonical' }],
          description: 'GitHub registry',
        },
      },
    }

    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify(testConfig),
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test-pkg', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${cwd}/packages/knowledge-hub/dataset/github/workflow.yml`]: 'content: val',
        // Pre-existing target — project already installed
        [`${cwd}/.github/workflow.yml`]: 'existing: content',
      },
      cwd,
      cwd,
    )

    const config: InstallCommandConfig = {
      command: 'install',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    // Should reject because targets already exist (project already installed)
    await expect(handleInstallCommand(config, fs)).rejects.toThrow(/already.*install|use.*update/i)
  })
})

/**
 * BUG #03: install must report a registry whose source is missing
 *
 * Under the three-outcome model (US-396) a registry the source does not ship is
 * `skipped — not shipped by this source`, NEVER `failed`: it is absent, not broken,
 * so it costs the run neither a red summary nor a non-zero exit. `failed` is reserved
 * for a registry that was shipped and could not be installed. (`RegistryResult.ok` no
 * longer exists — the field is `status: ok | skipped | failed`.) Before this bug was
 * fixed the missing source was silently swallowed instead of being reported at all.
 */
describe('BUG #03: install reports skipped registries', () => {
  test('completes without throw when a registry source is missing', async () => {
    const cwd = '/project'
    const datasetSrc = `${cwd}/packages/knowledge-hub/dataset`

    const testConfig = {
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

    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify(testConfig),
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        // Only knowledge exists — github source is MISSING
        [`${datasetSrc}/.pair/knowledge/test.md`]: '# Test',
      },
      cwd,
      cwd,
    )

    const config: InstallCommandConfig = {
      command: 'install',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    // Should NOT throw — completes with skipped registries reported in summary
    const exitCode = await handleInstallCommand(config, fs)

    // Knowledge was installed, github was skipped — a skip is not a failure, so 0.
    expect(exitCode).toBe(0)
    expect(await fs.exists(`${cwd}/.pair/knowledge/test.md`)).toBe(true)
    expect(await fs.exists(`${cwd}/.github`)).toBe(false)
  })
})

describe('install — Bug 5: skill ref rewrite with agents-before-skills order', () => {
  test('AGENTS.md refs are rewritten even when agents precedes skills in config', async () => {
    const moduleDir = '/project'
    const datasetSrc = `${moduleDir}/packages/knowledge-hub/dataset`

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
      },
      moduleDir,
      moduleDir,
    )

    const installConfig: InstallCommandConfig = {
      command: 'install',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleInstallCommand(installConfig, fs)

    const agentsContent = await fs.readFile(`${moduleDir}/AGENTS.md`)
    expect(agentsContent).toContain('/pair-process-implement')
    expect(agentsContent).toContain('/pair-capability-verify-quality')
    expect(agentsContent).not.toMatch(/(?<![a-z-])\/implement(?![a-z-])/)
  })
})

describe('#238: flatten+prefix pipeline for external KB and collision detection', () => {
  const moduleDir = '/project'
  const datasetSrc = `${moduleDir}/packages/knowledge-hub/dataset`

  test('AC5: external KB installed via local --source path applies the same flatten/prefix/rewrite pipeline', async () => {
    const externalKbPath = '/external/kb'
    const fs = new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({
          name: 'test-project',
          version: '0.1.0',
        }),
        [`${moduleDir}/config.json`]: JSON.stringify({
          asset_registries: {
            skills: {
              source: '.skills',
              behavior: 'mirror',
              flatten: true,
              prefix: 'ext',
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
        }),
        // Minimal nested external KB — standard `.skills/<type>/<name>/` layout
        [`${externalKbPath}/AGENTS.md`]: '# AGENTS\n\nRun /next for the external KB.\n',
        [`${externalKbPath}/.skills/catalog/next/SKILL.md`]: '---\nname: next\n---\n# /next\n',
      },
      moduleDir,
      moduleDir,
    )

    const installConfig: InstallCommandConfig = {
      command: 'install',
      resolution: 'local',
      path: externalKbPath,
      offline: true,
      kb: true,
    }
    await handleInstallCommand(installConfig, fs)

    // Flattened + prefixed exactly like the official dataset pipeline
    await expect(fs.exists(`${moduleDir}/.claude/skills/ext-catalog-next/SKILL.md`)).resolves.toBe(
      true,
    )
    const skillContent = await fs.readFile(`${moduleDir}/.claude/skills/ext-catalog-next/SKILL.md`)
    expect(skillContent).toContain('name: ext-catalog-next')

    // Cross-registry rewrite applied without any source-side restructuring
    const agentsContent = await fs.readFile(`${moduleDir}/AGENTS.md`)
    expect(agentsContent).toContain('/ext-catalog-next')
  })

  // US-396: a collision is REPORTED, not thrown past the summary. The run no longer
  // succeeds silently and no longer aborts the registries after it — the registry is
  // marked failed with the collision message and the exit code carries it out (AC2).
  test('name collision after flattening fails install with an explicit error', async () => {
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
              description: 'Agent skills',
              targets: [{ path: '.claude/skills/', mode: 'canonical' }],
            },
          },
        }),
        // Two distinct source paths that flatten to the same target name
        [`${datasetSrc}/.skills/a/b/SKILL.md`]: '# Skill 1',
        [`${datasetSrc}/.skills/a-b/SKILL.md`]: '# Skill 2',
      },
      moduleDir,
      moduleDir,
    )

    const installConfig: InstallCommandConfig = {
      command: 'install',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    const printed: string[] = []
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(m => {
      printed.push(String(m))
    })
    const exitCode = await handleInstallCommand(installConfig, fs)
    consoleSpy.mockRestore()

    expect(exitCode).toBe(1)
    expect(printed.join('\n')).toMatch(/collision/i)
  })
})

/**
 * #261: install records the applied KB version so a later `pair kb-info`
 * version check has something to compare against (AC4 "record it" loop),
 * and prints a non-blocking drift hint when re-installing over a different
 * recorded version (AC3).
 */
describe('install — KB version recording (#261)', () => {
  const cwd = '/version-test-project'

  const testConfig = {
    asset_registries: {
      github: {
        source: 'github',
        behavior: 'mirror',
        targets: [{ path: '.github', mode: 'canonical' }],
        description: 'GitHub registry',
      },
    },
  }

  function baseFiles(kbVersion?: string) {
    return {
      [`${cwd}/package.json`]: JSON.stringify({ name: 'test-pkg', version: '0.1.0' }),
      [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
        name: '@pair/knowledge-hub',
        ...(kbVersion && { version: kbVersion }),
      }),
      [`${cwd}/packages/knowledge-hub/dataset/github/workflow.yml`]: 'content: val',
    }
  }

  test('records the installed KB version on success', async () => {
    const fs = createTestFs(testConfig, baseFiles('1.2.0'), cwd)

    await handleInstallCommand(
      { command: 'install', resolution: 'default', kb: true, offline: false },
      fs,
    )

    expect(await fs.exists(`${cwd}/.pair/.kb-version.json`)).toBe(true)
    const marker = JSON.parse(await fs.readFile(`${cwd}/.pair/.kb-version.json`))
    expect(marker.version).toBe('1.2.0')
    expect(marker.recordedAt).toBeTruthy()
  })

  test('does not write a marker when the KB source carries no version metadata', async () => {
    const fs = createTestFs(testConfig, baseFiles(), cwd)

    await handleInstallCommand(
      { command: 'install', resolution: 'default', kb: true, offline: false },
      fs,
    )

    expect(await fs.exists(`${cwd}/.pair/.kb-version.json`)).toBe(false)
  })

  test('prints a non-blocking drift hint with migration URL when a prior version is recorded', async () => {
    const fs = createTestFs(
      testConfig,
      {
        ...baseFiles('1.2.0'),
        [`${cwd}/.pair/.kb-version.json`]: JSON.stringify({ version: '1.1.0' }),
      },
      cwd,
    )
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await handleInstallCommand(
      { command: 'install', resolution: 'default', kb: true, offline: false },
      fs,
    )

    const output = logSpy.mock.calls.map(args => args.join(' ')).join('\n')
    expect(output).toContain('KB version drift')
    expect(output).toContain('1.1.0')
    expect(output).toContain('1.2.0')
    expect(output).toContain('Migration guide')

    // Install still succeeds and the marker now reflects the newly applied version
    expect(await fs.exists(`${cwd}/.github/workflow.yml`)).toBe(true)
    const marker = JSON.parse(await fs.readFile(`${cwd}/.pair/.kb-version.json`))
    expect(marker.version).toBe('1.2.0')

    logSpy.mockRestore()
  })

  test('drift hint omits the migration URL on a downgrade (installed newer than applied)', async () => {
    const fs = createTestFs(
      testConfig,
      {
        ...baseFiles('1.1.0'), // dataset applies the OLDER 1.1.0
        [`${cwd}/.pair/.kb-version.json`]: JSON.stringify({ version: '1.2.0' }), // recorded newer
      },
      cwd,
    )
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await handleInstallCommand(
      { command: 'install', resolution: 'default', kb: true, offline: false },
      fs,
    )

    const output = logSpy.mock.calls.map(args => args.join(' ')).join('\n')
    expect(output).toContain('KB version drift')
    // downgrade → no v{newer}-to-v{older} migration page
    expect(output).not.toContain('Migration guide')

    logSpy.mockRestore()
  })
})

// Moved from cli-link.e2e.test.ts (#199 test reorg) — genuine gap: no coverage of the
// options.linkStyle wire-through on install. The transformation logic itself is unit-tested
// in update-link/logic.test.ts; this only verifies install accepts and applies the option
// without breaking the distribution pipeline.
describe('install — linkStyle option', () => {
  const cwd = '/test-project'
  const testConfig = {
    asset_registries: {
      github: {
        source: 'github',
        behavior: 'mirror',
        targets: [{ path: '.github', mode: 'canonical' }],
        description: 'GitHub registry',
      },
    },
  }
  const extraFiles = {
    [`${cwd}/package.json`]: JSON.stringify({ name: 'test-pkg', version: '0.1.0' }),
    [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({ name: '@pair/knowledge-hub' }),
    [`${cwd}/packages/knowledge-hub/dataset/github/workflow.yml`]: 'content: val',
  }

  test('installs successfully with linkStyle: relative', async () => {
    const fs = createTestFs(testConfig, extraFiles, cwd)

    await handleInstallCommand(
      { command: 'install', resolution: 'default', kb: true, offline: false },
      fs,
      { linkStyle: 'relative' },
    )

    expect(await fs.exists(`${cwd}/.github/workflow.yml`)).toBe(true)
  })
})

// Moved from cli-packaging.e2e.test.ts (#199 test reorg) — the canonical-target
// flatten+prefix assertion is already covered by the #238 describe block above;
// only the secondary (symlink) target distribution was a genuine gap.
describe('install — skills registry secondary (symlink) targets', () => {
  test('creates symlinks for secondary skills targets', async () => {
    const cwd = '/test-skills-install'
    const seed: Record<string, string> = {
      [`${cwd}/dataset/.pair/knowledge/index.md`]: '# Knowledge Base',
      [`${cwd}/dataset/.skills/next/SKILL.md`]:
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

    await handleInstallCommand(
      { command: 'install', resolution: 'local', path: `${cwd}/dataset`, offline: true, kb: true },
      fs,
    )

    const symlinks = fs.getSymlinks()
    expect(symlinks.has(`${cwd}/.github/skills`)).toBe(true)
    expect(symlinks.has(`${cwd}/.cursor/skills`)).toBe(true)
  })
})

/**
 * US-395 review round 12 — END TO END, from the flags as Commander hands them over to the
 * bytes on disk. The global `--url` was consumed ONLY by the bootstrap pre-flight: the
 * install command itself parsed to `resolution: 'default'`, so once cache slots became
 * source-keyed the mirror archive landed in a slot nothing read and the OFFICIAL KB was
 * downloaded and installed instead. A monorepo dataset is seeded on purpose — it is what
 * `resolution: 'default'` serves, so this test fails LOUDLY (with the dataset's content)
 * rather than vacuously if `--url` is ever disconnected again.
 */
describe('US-395: `pair install --url <mirror>` installs what the mirror served', () => {
  const cwd = '/project'
  const datasetSrc = `${cwd}/packages/knowledge-hub/dataset`
  const url = 'https://mirror.internal/kb.zip'

  let fs: InMemoryFileSystemService
  let httpClient: MockHttpClientService

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
              description: 'Test registry',
            },
          },
        }),
        [`${datasetSrc}/test-registry/file1.md`]: '# Content from the official KB',
      },
      cwd,
      cwd,
    )
    httpClient = new MockHttpClientService()
    vi.restoreAllMocks()
  })

  test('downloads the url and installs its content, not the default KB', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(fs, 'extractZip').mockImplementation(async (_zipPath, targetPath) => {
      await fs.writeFile(`${targetPath}/manifest.json`, JSON.stringify({ name: 'acme-kb' }))
      await fs.writeFile(`${targetPath}/test-registry/file1.md`, '# Content from the mirror')
    })
    httpClient.setRequestResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' })),
    ])
    httpClient.setGetResponses([
      toIncomingMessage(buildTestResponse(200, { 'content-length': '1024' }, 'fake zip data')),
      toIncomingMessage(buildTestResponse(404)),
    ])

    // Exactly what cli.ts hands the parser for `pair install --url <mirror>`:
    // the program-level options merged under the command's own.
    await handleInstallCommand(parseInstallCommand({ url }), fs, { httpClient })

    expect(httpClient.getUrls()[0]).toBe(url)
    expect(await fs.readFile(`${cwd}/.pair/test-registry/file1.md`)).toBe(
      '# Content from the mirror',
    )

    consoleLogSpy.mockRestore()
  })
})

/**
 * US-396 half A — a registry the source does not ship is NOT a failure.
 *
 * The install summary used to count every absent registry as failed while the command
 * exited 0, so a legitimate external KB (knowledge + skills, never adoption) ended on a
 * red line that contradicted the status code.
 */
describe('US-396: absent registries are skipped, real failures are not', () => {
  const cwd = '/project'
  const datasetSrc = `${cwd}/packages/knowledge-hub/dataset`

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

  const defaultInstall: InstallCommandConfig = {
    command: 'install',
    resolution: 'default',
    kb: true,
    offline: false,
  }

  function projectFs(extra: Record<string, string>) {
    return new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify(twoRegistries),
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        ...extra,
      },
      cwd,
      cwd,
    )
  }

  /** In-memory double: everything real except one operation on one path. */
  function breakingOn(
    fs: InMemoryFileSystemService,
    method: keyof InMemoryFileSystemService,
    pathFragment: string,
  ): InMemoryFileSystemService {
    return new Proxy(fs, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver) as unknown
        if (typeof value !== 'function') return value
        const bound = (value as (...args: unknown[]) => unknown).bind(target)
        if (prop !== method) return bound
        return (...args: unknown[]) => {
          if (String(args[0]).includes(pathFragment)) throw new Error('disk on fire')
          return bound(...args)
        }
      },
    }) as InMemoryFileSystemService
  }

  test('an absent registry does not fail the run — exit code stays 0', async () => {
    const fs = projectFs({ [`${datasetSrc}/.pair/knowledge/test.md`]: '# Test' })

    const exitCode = await handleInstallCommand(defaultInstall, fs)

    expect(exitCode).toBe(0)
    expect(await fs.exists(`${cwd}/.pair/knowledge/test.md`)).toBe(true)
    expect(await fs.exists(`${cwd}/.github`)).toBe(false)
  })

  test('the summary names the skipped registry and its reason, and reads as success', async () => {
    const fs = projectFs({ [`${datasetSrc}/.pair/knowledge/test.md`]: '# Test' })
    const lines: string[] = []
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(m => {
      lines.push(String(m))
    })

    await handleInstallCommand(defaultInstall, fs)
    consoleSpy.mockRestore()

    const printed = lines.join('\n')
    expect(printed).toContain('Installation complete (1 ok, 1 skipped')
    expect(printed).toContain('not shipped by this source')
    expect(printed).toContain('github')
    expect(printed).not.toContain('finished with errors')
  })

  test('a registry present in the source that fails is still reported as failed (exit 1)', async () => {
    const fs = breakingOn(
      projectFs({
        [`${datasetSrc}/.pair/knowledge/test.md`]: '# Test',
        [`${datasetSrc}/.github/workflow.yml`]: 'on: push',
      }),
      'readdir',
      `${datasetSrc}/.github`,
    )

    const exitCode = await handleInstallCommand(defaultInstall, fs)

    expect(exitCode).toBe(1)
    // The healthy registry still installed — one broken registry does not abort the rest
    expect(await fs.exists(`${cwd}/.pair/knowledge/test.md`)).toBe(true)
  })
})

/**
 * US-396 half B — `install --source` honours the source KB's own declaration.
 *
 * The KB declares its registries (notably `skills.prefix`) in its own pair.config.json.
 * Install used to resolve the CONSUMING project's config only, so the declared
 * namespacing silently did not apply and the maintainer had to tell every consumer to
 * copy the file in.
 */
describe('US-396: the source KB declares, the consuming project overrides', () => {
  const cwd = '/consumer'
  const kb = '/acme-kb'

  const consumerBaseConfig = {
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

  const sourceInstall: InstallCommandConfig = {
    command: 'install',
    resolution: 'local',
    path: kb,
    offline: true,
    kb: true,
  }

  function consumerFs(extra: Record<string, string> = {}) {
    return new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify(consumerBaseConfig),
        [`${cwd}/package.json`]: JSON.stringify({ name: 'consumer', version: '0.1.0' }),
        [`${kb}/pair.config.json`]: JSON.stringify({
          asset_registries: { skills: { prefix: 'acme-kb' } },
        }),
        [`${kb}/.pair/knowledge/guide.md`]: '# Acme guide',
        [`${kb}/.skills/example-skill/SKILL.md`]: '---\nname: example-skill\n---\n',
        ...extra,
      },
      cwd,
      cwd,
    )
  }

  test('installs the skills under the prefix the source declares, with no config copied (AC3)', async () => {
    const fs = consumerFs()

    const exitCode = await handleInstallCommand(sourceInstall, fs)

    expect(exitCode).toBe(0)
    expect(await fs.exists(`${cwd}/.claude/skills/acme-kb-example-skill/SKILL.md`)).toBe(true)
    expect(await fs.exists(`${cwd}/.claude/skills/pair-example-skill/SKILL.md`)).toBe(false)
  })

  test("the consuming project's deliberate override beats the source declaration (AC4)", async () => {
    const fs = consumerFs({
      [`${cwd}/pair.config.json`]: JSON.stringify({
        asset_registries: { skills: { prefix: 'house-rules' } },
      }),
    })

    await handleInstallCommand(sourceInstall, fs)

    expect(await fs.exists(`${cwd}/.claude/skills/house-rules-example-skill/SKILL.md`)).toBe(true)
    expect(await fs.exists(`${cwd}/.claude/skills/acme-kb-example-skill/SKILL.md`)).toBe(false)
  })

  test('a malformed source config never aborts the install and is never half-applied', async () => {
    const fs = consumerFs({ [`${kb}/pair.config.json`]: '{ broken' })

    const exitCode = await handleInstallCommand(sourceInstall, fs)

    expect(exitCode).toBe(0)
    expect(await fs.exists(`${cwd}/.claude/skills/pair-example-skill/SKILL.md`)).toBe(true)
  })

  test('a registry the source declares but this CLI does not know is skipped, not dropped', async () => {
    const fs = consumerFs({
      [`${kb}/pair.config.json`]: JSON.stringify({
        asset_registries: {
          skills: { prefix: 'acme-kb' },
          telemetry: {
            source: '.telemetry',
            behavior: 'mirror',
            targets: [{ path: '.telemetry', mode: 'canonical' }],
          },
        },
      }),
      [`${kb}/.telemetry/traces.md`]: '# traces',
    })
    const lines: string[] = []
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(m => {
      lines.push(String(m))
    })

    const exitCode = await handleInstallCommand(sourceInstall, fs)
    consoleSpy.mockRestore()

    expect(exitCode).toBe(0)
    expect(await fs.exists(`${cwd}/.telemetry/traces.md`)).toBe(false)
    const printed = lines.join('\n')
    expect(printed).toContain('declared by source, unknown to this CLI')
    expect(printed).toContain('telemetry')
  })

  test('the announced registry count covers every registry the summary tallies', async () => {
    // 2 known + 1 declared-but-unknown: the header announced the 2 the CLI knows while the
    // summary accounted for 3 outcomes, so the third skip had nothing on screen explaining
    // where it came from (US-396 review round 4).
    const fs = consumerFs({
      [`${kb}/pair.config.json`]: JSON.stringify({
        asset_registries: { skills: { prefix: 'acme-kb' }, telemetry: { source: '.telemetry' } },
      }),
    })
    const lines: string[] = []
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(m => {
      lines.push(String(m))
    })

    await handleInstallCommand(sourceInstall, fs)
    consoleSpy.mockRestore()

    const printed = lines.join('\n')
    expect(printed).toContain('Installing 3 registries')
    expect(printed).toContain('2 ok, 1 skipped')
  })

  test('the default source path reads no declaration — behaviour is unchanged', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify(consumerBaseConfig),
        [`${cwd}/package.json`]: JSON.stringify({ name: 'consumer', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        // A stray declaration at the dataset root must not be read on the default path
        [`${cwd}/packages/knowledge-hub/dataset/pair.config.json`]: JSON.stringify({
          asset_registries: { skills: { prefix: 'acme-kb' } },
        }),
        [`${cwd}/packages/knowledge-hub/dataset/.skills/example-skill/SKILL.md`]:
          '---\nname: example-skill\n---\n',
      },
      cwd,
      cwd,
    )

    await handleInstallCommand(
      { command: 'install', resolution: 'default', kb: true, offline: false },
      fs,
    )

    expect(await fs.exists(`${cwd}/.claude/skills/pair-example-skill/SKILL.md`)).toBe(true)
  })
})

/**
 * US-396 — the three things the source declaration must NOT be able to do, exercised
 * through the real install rather than the loader alone: repoint where the install
 * writes, hide its own breakage, or leave a "complete" version marker behind a failure.
 */
describe('US-396: the source declares, but never decides where the install writes', () => {
  const cwd = '/consumer'
  const kb = '/acme-kb'

  const consumerBaseConfig = {
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

  const sourceInstall: InstallCommandConfig = {
    command: 'install',
    resolution: 'local',
    path: kb,
    offline: true,
    kb: true,
  }

  function consumerFs(extra: Record<string, string> = {}, moduleDir = cwd) {
    return new InMemoryFileSystemService(
      {
        [`${moduleDir}/config.json`]: JSON.stringify(consumerBaseConfig),
        [`${cwd}/package.json`]: JSON.stringify({ name: 'consumer', version: '0.1.0' }),
        [`${kb}/.pair/knowledge/guide.md`]: '# Acme guide',
        [`${kb}/.skills/example-skill/SKILL.md`]: '---\nname: example-skill\n---\n',
        ...extra,
      },
      moduleDir,
      cwd,
    )
  }

  test('a source-declared target outside the project is ignored, not written to', async () => {
    const fs = consumerFs({
      [`${kb}/pair.config.json`]: JSON.stringify({
        asset_registries: {
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '../../.zshenv', mode: 'canonical' }],
          },
        },
      }),
    })

    const exitCode = await handleInstallCommand(sourceInstall, fs)

    expect(exitCode).toBe(0)
    expect(await fs.exists('/.zshenv')).toBe(false)
    expect(await fs.exists(`${cwd}/.pair/knowledge/guide.md`)).toBe(true)
  })

  test('a source-declared source outside the KB is ignored — nothing outside it is read', async () => {
    // The read side of the same trust boundary as the `targets` case above: `source` is
    // resolved against the KB root, so `..`/absolute would copy the victim's own files
    // (SSH keys, anything) into a tree they commit.
    const fs = consumerFs({
      '/home/victim/.ssh/id_rsa': 'PRIVATE KEY',
      [`${kb}/pair.config.json`]: JSON.stringify({
        asset_registries: {
          knowledge: { source: '../home/victim/.ssh' },
          skills: { source: '/home/victim/.ssh' },
        },
      }),
    })

    await handleInstallCommand(sourceInstall, fs)

    expect(await fs.exists(`${cwd}/.pair/knowledge/id_rsa`)).toBe(false)
    expect(await fs.exists(`${cwd}/.claude/skills/pair-id_rsa`)).toBe(false)
    // ...and the KB's own content still installs: the field was dropped, not the run
    expect(await fs.exists(`${cwd}/.pair/knowledge/guide.md`)).toBe(true)
  })

  test('a source-declared prefix that traverses is ignored — the default prefix stands', async () => {
    const fs = consumerFs({
      [`${kb}/pair.config.json`]: JSON.stringify({
        asset_registries: { skills: { prefix: '../../../tmp/evil' } },
      }),
    })

    await handleInstallCommand(sourceInstall, fs)

    expect(await fs.exists(`${cwd}/.claude/skills/pair-example-skill/SKILL.md`)).toBe(true)
    expect(await fs.exists('/tmp/evil-example-skill/SKILL.md')).toBe(false)
  })

  test("the consumer's own pair.config.json wins even when the CLI module dir is elsewhere (AC4)", async () => {
    // The released layout: the package root (module dir) is NOT the project being
    // installed into. Reading the consumer's config at the module dir found nothing.
    const fs = consumerFs(
      {
        [`${kb}/pair.config.json`]: JSON.stringify({
          asset_registries: { skills: { prefix: 'acme-kb' } },
        }),
        [`${cwd}/pair.config.json`]: JSON.stringify({
          asset_registries: { skills: { prefix: 'house-rules' } },
        }),
      },
      '/opt/pair-cli',
    )

    await handleInstallCommand(sourceInstall, fs)

    expect(await fs.exists(`${cwd}/.claude/skills/house-rules-example-skill/SKILL.md`)).toBe(true)
    expect(await fs.exists(`${cwd}/.claude/skills/acme-kb-example-skill/SKILL.md`)).toBe(false)
  })

  test('an applied declaration names the resolution chain on the console', async () => {
    // `applied` has a consumer: the one layer the consumer did not write says so, and the
    // KB maintainer can see the declaration was honoured (US-396).
    const fs = consumerFs({
      [`${kb}/pair.config.json`]: JSON.stringify({
        asset_registries: { skills: { prefix: 'acme-kb' } },
      }),
    })
    const lines: string[] = []
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(m => {
      lines.push(String(m))
    })

    await handleInstallCommand(sourceInstall, fs)
    consoleSpy.mockRestore()

    expect(lines.join('\n')).toContain(`source KB declaration: ${kb}`)
  })

  test('an install with no source declaration says nothing about the chain', async () => {
    const fs = consumerFs()
    const lines: string[] = []
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(m => {
      lines.push(String(m))
    })

    await handleInstallCommand(sourceInstall, fs)
    consoleSpy.mockRestore()

    expect(lines.join('\n')).not.toContain('Configuration:')
  })

  test('a malformed source config is warned about where the user can see it', async () => {
    const fs = consumerFs({ [`${kb}/pair.config.json`]: '{ broken' })
    const warned: string[] = []
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(m => {
      warned.push(String(m))
    })

    await handleInstallCommand(sourceInstall, fs)
    warnSpy.mockRestore()

    expect(warned.join('\n')).toContain('pair.config.json')
  })

  test('a source-declared source that is a SYMLINK out of the KB is ignored too', async () => {
    // Lexical containment does not see this: `leak` escapes nothing by name. `fs.stat`
    // follows the link, reports a directory, and the copy walks the victim's files into
    // the tree they commit (US-396 review round 3).
    const fs = consumerFs({ '/home/victim/.ssh/id_rsa': 'PRIVATE KEY' })
    await fs.symlink('/home/victim/.ssh', `${kb}/leak`)
    await fs.writeFile(
      `${kb}/pair.config.json`,
      JSON.stringify({ asset_registries: { knowledge: { source: 'leak' } } }),
    )

    await handleInstallCommand(sourceInstall, fs)

    expect(await fs.exists(`${cwd}/.pair/knowledge/id_rsa`)).toBe(false)
    expect(await fs.exists(`${cwd}/.pair/knowledge/guide.md`)).toBe(true)
  })

  test('a source shipping only skills still writes .pair/ artifacts', async () => {
    // `.pair/` used to exist only because the SKIPPED `knowledge` registry's `ensureDir`
    // had created it as a side effect. Deciding "not shipped" before touching the project
    // removed that accident, and the skill-name manifest write then failed with
    // `ENOENT: … /.pair/.skill-name-map.json` — out of the whole install. Both writers now
    // own their directory. (Caught by the `registry-exclude` smoke scenario.)
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify(consumerBaseConfig),
        [`${cwd}/package.json`]: JSON.stringify({ name: 'consumer', version: '0.1.0' }),
        // Only `.skills` — nothing the `.pair/`-targeted registries ship
        [`${kb}/.pair/README.md`]: '# Acme KB',
        [`${kb}/.skills/example-skill/SKILL.md`]: '---\nname: example-skill\n---\n',
      },
      cwd,
      cwd,
    )

    const exitCode = await handleInstallCommand(sourceInstall, fs)

    expect(exitCode).toBe(0)
    expect(await fs.exists(`${cwd}/.pair/.skill-name-map.json`)).toBe(true)
    expect(await fs.exists(`${cwd}/.pair/llms.txt`)).toBe(true)
  })

  test("a source's typo never aborts the consumer's install", async () => {
    // `flatten: false` is a plausible declaration and a well-formed boolean. Over the
    // base `skills` (flatten: true, flattenDepth: 2) the MERGED entry is invalid
    // (`flattenDepth requires flatten: true`), and `setupInstallContext` validates with a
    // hard throw: the user saw `Error: Registry 'skills' flattenDepth requires flatten:
    // true` — naming their OWN registry — exit 1, nothing installed.
    const fs = consumerFs({
      [`${kb}/pair.config.json`]: JSON.stringify({
        asset_registries: { skills: { flatten: false } },
      }),
    })
    const warned: string[] = []
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(m => warned.push(String(m)))

    const exitCode = await handleInstallCommand(sourceInstall, fs)
    warnSpy.mockRestore()

    expect(exitCode).toBe(0)
    expect(await fs.exists(`${cwd}/.claude/skills/pair-example-skill/SKILL.md`)).toBe(true)
    expect(warned.join('\n')).toMatch(/pair\.config\.json/)
  })
})

/**
 * US-396 — a partial install is not an installed KB. Recording the version anyway silences
 * the drift hint while a registry is missing, and the re-run aborts on "already exists".
 */
describe('US-396: a failed registry leaves no "installed" version marker', () => {
  const cwd = '/project'
  const datasetSrc = `${cwd}/packages/knowledge-hub/dataset`
  const marker = `${cwd}/.pair/.kb-version.json`

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

  const defaultInstall: InstallCommandConfig = {
    command: 'install',
    resolution: 'default',
    kb: true,
    offline: false,
  }

  function projectFs(extra: Record<string, string>) {
    return new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify(twoRegistries),
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
          version: '1.4.0',
        }),
        ...extra,
      },
      cwd,
      cwd,
    )
  }

  function breakingOn(
    fs: InMemoryFileSystemService,
    method: keyof InMemoryFileSystemService,
    pathFragment: string,
  ): InMemoryFileSystemService {
    return new Proxy(fs, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver) as unknown
        if (typeof value !== 'function') return value
        const bound = (value as (...args: unknown[]) => unknown).bind(target)
        if (prop !== method) return bound
        return (...args: unknown[]) => {
          if (String(args[0]).includes(pathFragment)) throw new Error('disk on fire')
          return bound(...args)
        }
      },
    }) as InMemoryFileSystemService
  }

  test('a clean run does record it', async () => {
    const fs = projectFs({
      [`${datasetSrc}/.pair/knowledge/test.md`]: '# Test',
      [`${datasetSrc}/.github/workflow.yml`]: 'on: push',
    })

    const exitCode = await handleInstallCommand(defaultInstall, fs)

    expect(exitCode).toBe(0)
    expect(await fs.exists(marker)).toBe(true)
  })

  test('a run with one failed registry does not', async () => {
    const fs = breakingOn(
      projectFs({
        [`${datasetSrc}/.pair/knowledge/test.md`]: '# Test',
        [`${datasetSrc}/.github/workflow.yml`]: 'on: push',
      }),
      'readdir',
      `${datasetSrc}/.github`,
    )

    const exitCode = await handleInstallCommand(defaultInstall, fs)

    expect(exitCode).toBe(1)
    expect(await fs.exists(marker)).toBe(false)
  })
})

/**
 * US-396 — `--list-targets` and `install` must agree. Resolving from the CLI module dir
 * made the command whose only job is to say where content lands print the CLI defaults
 * while `install` wrote to the project's overridden targets.
 */
describe('US-396: --list-targets reflects the project it describes', () => {
  const cwd = '/consumer'
  const moduleDir = '/opt/pair-cli'

  const baseConfig = {
    asset_registries: {
      knowledge: {
        source: '.pair/knowledge',
        behavior: 'mirror',
        targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
        description: 'KB',
      },
    },
  }

  test("prints the project's own pair.config.json override, not the CLI default", async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${moduleDir}/config.json`]: JSON.stringify(baseConfig),
        [`${cwd}/package.json`]: JSON.stringify({ name: 'consumer', version: '0.1.0' }),
        [`${cwd}/pair.config.json`]: JSON.stringify({
          asset_registries: {
            knowledge: { targets: [{ path: 'docs/kb', mode: 'canonical' }] },
          },
        }),
      },
      moduleDir,
      cwd,
    )
    const lines: string[] = []
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(m => {
      lines.push(String(m))
    })

    const exitCode = await handleInstallCommand(
      { command: 'install', resolution: 'list-targets' },
      fs,
    )
    consoleSpy.mockRestore()

    expect(exitCode).toBe(0)
    expect(lines.join('\n')).toContain('docs/kb')
  })
})
