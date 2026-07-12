import { describe, it, expect } from 'vitest'
import { handleKbValidateCommand } from './handler'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'

const minimalConfig = JSON.stringify({ asset_registries: {} })

describe('handleKbValidateCommand', () => {
  it('should validate KB at current directory by default', async () => {
    const cwd = '/project'
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.pair/knowledge/index.md`]: '# KB',
        [`${cwd}/config.json`]: minimalConfig,
      },
      cwd,
      cwd,
    )

    await expect(handleKbValidateCommand({ command: 'kb-validate' }, fs)).resolves.toBeUndefined()
  })

  it('should validate KB at specified path', async () => {
    const cwd = '/project'
    const kbPath = '/custom/kb'
    const fs = new InMemoryFileSystemService(
      {
        [`${kbPath}/.pair/knowledge/index.md`]: '# KB',
        [`${cwd}/config.json`]: minimalConfig,
      },
      cwd,
      cwd,
    )

    await expect(
      handleKbValidateCommand({ command: 'kb-validate', path: kbPath }, fs),
    ).resolves.toBeUndefined()
  })

  it('should throw error when .pair directory missing', async () => {
    const cwd = '/project'
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/README.md`]: '# Project',
      },
      cwd,
      cwd,
    )

    await expect(handleKbValidateCommand({ command: 'kb-validate' }, fs)).rejects.toThrow(
      'missing .pair directory',
    )
  })

  it('should throw error when .pair directory missing at custom path', async () => {
    const cwd = '/project'
    const kbPath = '/invalid/kb'
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    await expect(
      handleKbValidateCommand({ command: 'kb-validate', path: kbPath }, fs),
    ).rejects.toThrow('missing .pair directory')
  })

  it('should propagate config errors instead of silently returning empty', async () => {
    const cwd = '/project'
    // .pair exists but no config.json → loadConfigWithOverrides throws
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.pair/knowledge/index.md`]: '# KB',
      },
      cwd,
      cwd,
    )

    await expect(handleKbValidateCommand({ command: 'kb-validate' }, fs)).rejects.toThrow(
      'Failed to load base config',
    )
  })

  it('should skip config loading when ignoreConfig is true', async () => {
    const cwd = '/project'
    // No config.json but ignoreConfig=true → should not throw
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.pair/knowledge/index.md`]: '# KB',
      },
      cwd,
      cwd,
    )

    await expect(
      handleKbValidateCommand({ command: 'kb-validate', ignoreConfig: true }, fs),
    ).resolves.toBeUndefined()
  })
})

/**
 * Realistic multi-registry configs exercising structure/link/metadata validators
 * together through the handler (moved from the former cli-kb-validate.e2e.test.ts —
 * #199 test reorg: e2e default is one file per entry point, these are genuine
 * handler-level coverage, not real e2e).
 */
describe('handleKbValidateCommand - realistic multi-registry layouts', () => {
  function createFullConfig() {
    return {
      asset_registries: {
        github: {
          source: '.github',
          behavior: 'mirror',
          include: ['/agents'],
          description: 'GitHub config',
          targets: [{ path: '.github', mode: 'canonical' }],
        },
        knowledge: {
          source: '.pair/knowledge',
          behavior: 'mirror',
          description: 'KB content',
          targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
        },
        adoption: {
          source: '.pair/adoption',
          behavior: 'add',
          description: 'Adoption guides',
          targets: [{ path: '.pair/adoption', mode: 'canonical' }],
        },
        agents: {
          source: 'AGENTS.md',
          behavior: 'mirror',
          description: 'Agent guidance',
          targets: [
            { path: 'AGENTS.md', mode: 'canonical' },
            { path: 'CLAUDE.md', mode: 'copy' },
          ],
        },
        skills: {
          source: '.skills',
          behavior: 'mirror',
          flatten: true,
          prefix: 'pair',
          description: 'Agent skills',
          targets: [
            { path: '.claude/skills/', mode: 'canonical' },
            { path: '.github/skills/', mode: 'symlink' },
            { path: '.cursor/skills/', mode: 'symlink' },
          ],
        },
      },
    }
  }

  function createSourceLayoutFs(cwd: string): InMemoryFileSystemService {
    const seed: Record<string, string> = {}
    seed[`${cwd}/config.json`] = JSON.stringify(createFullConfig())
    seed[`${cwd}/.pair/knowledge/index.md`] = '# Knowledge\n\nSee [guide](./guide.md).'
    seed[`${cwd}/.pair/knowledge/guide.md`] = '# Guide'
    seed[`${cwd}/.pair/adoption/tech-stack.md`] = '# Tech Stack\n- Node.js 20'
    seed[`${cwd}/.github/agents/config.yml`] = 'agent: true'
    seed[`${cwd}/AGENTS.md`] = '# AGENTS'
    seed[`${cwd}/.skills/next/SKILL.md`] =
      '---\nname: next\ndescription: Project navigator\n---\n# /next'
    seed[`${cwd}/.skills/capability/assess-stack/SKILL.md`] =
      '---\nname: assess-stack\ndescription: Stack assessment\n---\n# /assess-stack'
    return new InMemoryFileSystemService(seed, cwd, cwd)
  }

  function createTargetLayoutFs(cwd: string): InMemoryFileSystemService {
    const seed: Record<string, string> = {}
    seed[`${cwd}/config.json`] = JSON.stringify(createFullConfig())
    seed[`${cwd}/.pair/knowledge/index.md`] = '# Knowledge\n\nSee [guide](./guide.md).'
    seed[`${cwd}/.pair/knowledge/guide.md`] = '# Guide'
    seed[`${cwd}/.pair/adoption/tech-stack.md`] = '# Tech Stack\n- Node.js 20'
    seed[`${cwd}/.github/agents/config.yml`] = 'agent: true'
    seed[`${cwd}/AGENTS.md`] = '# AGENTS'
    seed[`${cwd}/CLAUDE.md`] = '# CLAUDE'
    // Target layout: skills at canonical target with prefix applied
    seed[`${cwd}/.claude/skills/pair-next/SKILL.md`] =
      '---\nname: pair-next\ndescription: Project navigator\n---\n# /next'
    seed[`${cwd}/.claude/skills/pair-capability-assess-stack/SKILL.md`] =
      '---\nname: pair-capability-assess-stack\ndescription: Stack assessment\n---\n# /assess-stack'
    // Symlink targets NOT present (they'd be symlinks in real FS)
    return new InMemoryFileSystemService(seed, cwd, cwd)
  }

  it('validates a realistic source layout across all registries — exit 0', async () => {
    const cwd = '/handler-validate-source'
    const fs = createSourceLayoutFs(cwd)

    await expect(
      handleKbValidateCommand({ command: 'kb-validate', layout: 'source' }, fs),
    ).resolves.toBeUndefined()
  })

  it('validates a realistic target layout across all registries — exit 0', async () => {
    const cwd = '/handler-validate-target'
    const fs = createTargetLayoutFs(cwd)

    await expect(handleKbValidateCommand({ command: 'kb-validate' }, fs)).resolves.toBeUndefined()
  })

  it('--skip-registries excludes specified registries from validation', async () => {
    const cwd = '/handler-validate-skip'
    // FS without adoption source dir — would fail without skip
    const seed: Record<string, string> = {}
    seed[`${cwd}/config.json`] = JSON.stringify(createFullConfig())
    seed[`${cwd}/.pair/knowledge/index.md`] = '# Knowledge'
    seed[`${cwd}/.github/agents/config.yml`] = 'agent: true'
    seed[`${cwd}/AGENTS.md`] = '# AGENTS'
    seed[`${cwd}/.skills/next/SKILL.md`] = '---\nname: next\ndescription: Nav\n---\n# /next'
    const fs = new InMemoryFileSystemService(seed, cwd, cwd)

    // Skipping adoption should pass despite missing .pair/adoption
    await expect(
      handleKbValidateCommand(
        { command: 'kb-validate', layout: 'source', skipRegistries: ['adoption'] },
        fs,
      ),
    ).resolves.toBeUndefined()
  })
})
