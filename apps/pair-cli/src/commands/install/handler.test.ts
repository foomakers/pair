import { describe, expect, beforeEach, test } from 'vitest'
import { handleInstallCommand } from './handler'
import type { InstallCommandConfig } from './parser'
import { createTestFs } from '#test-utils'
import { InMemoryFileSystemService } from '@pair/content-ops'

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
