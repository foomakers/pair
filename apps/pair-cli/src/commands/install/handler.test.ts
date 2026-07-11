import { describe, expect, beforeEach, test, vi } from 'vitest'
import { handleInstallCommand } from './handler'
import type { InstallCommandConfig } from './parser'
import { createTestFs } from '#test-utils'
import { InMemoryFileSystemService } from '@pair/content-ops'

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
describe('BUG 2: dataset root validation', () => {
  test('T2.1 — rejects when resolved dataset root has no content', async () => {
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

    // Should reject because dataset root has no usable content for registries
    await expect(handleInstallCommand(config, fs)).rejects.toThrow(/dataset/i)
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
 * BUG #03: install must report skipped registries (source missing)
 *
 * When a registry source does not exist, the install should complete but
 * mark the registry as failed (ok: false) so the summary clearly shows
 * which registries were skipped. Previously this was silently swallowed.
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
    await handleInstallCommand(config, fs)

    // Knowledge was installed, github was skipped
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

    await expect(handleInstallCommand(installConfig, fs)).rejects.toThrow(/collision/i)
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
})
