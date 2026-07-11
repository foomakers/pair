import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
import { handleKbValidateCommand } from './commands'

describe('pair-cli e2e - kb-validate', () => {
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

  describe('source layout validation', () => {
    it('validates valid source layout — exit 0', async () => {
      const cwd = '/e2e-validate-source'
      const fs = createSourceLayoutFs(cwd)

      await expect(
        handleKbValidateCommand({ command: 'kb-validate', layout: 'source' }, fs),
      ).resolves.toBeUndefined()
    })

    it('detects missing registry in source layout', async () => {
      const cwd = '/e2e-validate-source-missing'
      // Create FS without adoption source dir — structure validator reports error
      const seed: Record<string, string> = {}
      seed[`${cwd}/config.json`] = JSON.stringify(createFullConfig())
      seed[`${cwd}/.pair/knowledge/index.md`] = '# Knowledge'
      seed[`${cwd}/.github/agents/config.yml`] = 'agent: true'
      seed[`${cwd}/AGENTS.md`] = '# AGENTS'
      seed[`${cwd}/.skills/next/SKILL.md`] = '---\nname: next\ndescription: Nav\n---\n# /next'
      // .pair/adoption is missing entirely
      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await expect(
        handleKbValidateCommand({ command: 'kb-validate', layout: 'source' }, fs),
      ).rejects.toThrow('Validation failed')
    })
  })

  describe('target layout validation', () => {
    it('validates valid target layout — exit 0', async () => {
      const cwd = '/e2e-validate-target'
      const fs = createTargetLayoutFs(cwd)

      await expect(handleKbValidateCommand({ command: 'kb-validate' }, fs)).resolves.toBeUndefined()
    })

    it('symlink targets ignored — no error for missing .github/skills', async () => {
      const cwd = '/e2e-validate-target-symlink'
      const fs = createTargetLayoutFs(cwd)
      // .github/skills and .cursor/skills are symlink targets — should NOT be checked
      expect(fs.existsSync(`${cwd}/.github/skills`)).toBe(false)

      await expect(handleKbValidateCommand({ command: 'kb-validate' }, fs)).resolves.toBeUndefined()
    })

    it('detects missing registry in target layout', async () => {
      const cwd = '/e2e-validate-target-missing'
      // Create FS without knowledge target dir — structure validator reports error
      const seed: Record<string, string> = {}
      seed[`${cwd}/config.json`] = JSON.stringify(createFullConfig())
      seed[`${cwd}/.pair/adoption/tech-stack.md`] = '# Tech Stack'
      seed[`${cwd}/.github/agents/config.yml`] = 'agent: true'
      seed[`${cwd}/AGENTS.md`] = '# AGENTS'
      seed[`${cwd}/CLAUDE.md`] = '# CLAUDE'
      seed[`${cwd}/.claude/skills/pair-next/SKILL.md`] =
        '---\nname: pair-next\ndescription: Nav\n---\n# /next'
      // .pair/knowledge is missing entirely
      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await expect(handleKbValidateCommand({ command: 'kb-validate' }, fs)).rejects.toThrow(
        'Validation failed',
      )
    })
  })

  describe('registry filtering', () => {
    it('--skip-registries excludes specified registries', async () => {
      const cwd = '/e2e-validate-skip'
      // Create FS without adoption source dir — would fail without skip
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

    it('--ignore-config skips structure validation', async () => {
      const cwd = '/e2e-validate-ignore'
      const fs = new InMemoryFileSystemService(
        {
          [`${cwd}/.pair/knowledge/index.md`]: '# KB',
        },
        cwd,
        cwd,
      )
      // No config.json — would fail without --ignore-config

      await expect(
        handleKbValidateCommand({ command: 'kb-validate', ignoreConfig: true }, fs),
      ).resolves.toBeUndefined()
    })
  })

  describe('link integrity', () => {
    it('detects broken internal links', async () => {
      const cwd = '/e2e-validate-links'
      const fs = createSourceLayoutFs(cwd)
      // Replace valid link with broken one
      await fs.writeFile(
        `${cwd}/.pair/knowledge/index.md`,
        '# Knowledge\n\nSee [missing](./nonexistent.md).',
      )

      await expect(
        handleKbValidateCommand({ command: 'kb-validate', layout: 'source' }, fs),
      ).rejects.toThrow('Validation failed')
    })

    it('valid internal links pass', async () => {
      const cwd = '/e2e-validate-links-valid'
      const fs = createSourceLayoutFs(cwd)
      // index.md links to guide.md which exists

      await expect(
        handleKbValidateCommand({ command: 'kb-validate', layout: 'source' }, fs),
      ).resolves.toBeUndefined()
    })
  })

  describe('metadata and skills validation', () => {
    it('detects missing SKILL.md frontmatter', async () => {
      const cwd = '/e2e-validate-meta-missing'
      const fs = createSourceLayoutFs(cwd)
      // SKILL.md without frontmatter
      await fs.writeFile(`${cwd}/.skills/next/SKILL.md`, '# /next\n\nNo frontmatter here.')

      await expect(
        handleKbValidateCommand({ command: 'kb-validate', layout: 'source' }, fs),
      ).rejects.toThrow('Validation failed')
    })

    it('detects missing required name field in frontmatter', async () => {
      const cwd = '/e2e-validate-meta-field'
      const fs = createSourceLayoutFs(cwd)
      // SKILL.md with frontmatter but missing name
      await fs.writeFile(
        `${cwd}/.skills/next/SKILL.md`,
        '---\ndescription: Navigator\n---\n# /next',
      )

      await expect(
        handleKbValidateCommand({ command: 'kb-validate', layout: 'source' }, fs),
      ).rejects.toThrow('Validation failed')
    })

    it('warns about adoption placeholders without failing', async () => {
      const cwd = '/e2e-validate-placeholder'
      const fs = createSourceLayoutFs(cwd)
      // Adoption file with placeholder — should warn but not error
      await fs.writeFile(`${cwd}/.pair/adoption/tech-stack.md`, '# Tech Stack\n\n[placeholder]')

      // Warnings don't cause failure
      await expect(
        handleKbValidateCommand({ command: 'kb-validate', layout: 'source' }, fs),
      ).resolves.toBeUndefined()
    })
  })

  describe('exit codes and error handling', () => {
    it('throws when .pair directory missing', async () => {
      const cwd = '/e2e-validate-nopair'
      const fs = new InMemoryFileSystemService({ [`${cwd}/README.md`]: '# Project' }, cwd, cwd)

      await expect(handleKbValidateCommand({ command: 'kb-validate' }, fs)).rejects.toThrow(
        'missing .pair directory',
      )
    })

    it('mixed errors and warnings — exit 1', async () => {
      const cwd = '/e2e-validate-mixed'
      const fs = createSourceLayoutFs(cwd)
      // Broken link (error) + placeholder (warning)
      await fs.writeFile(
        `${cwd}/.pair/knowledge/index.md`,
        '# KB\n\nSee [broken](./nonexistent.md).',
      )
      await fs.writeFile(`${cwd}/.pair/adoption/tech-stack.md`, '# Tech\n\n[placeholder]')

      await expect(
        handleKbValidateCommand({ command: 'kb-validate', layout: 'source' }, fs),
      ).rejects.toThrow('Validation failed')
    })
  })
})
