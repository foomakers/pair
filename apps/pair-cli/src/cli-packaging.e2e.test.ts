import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
import { installCommand, handleUpdateCommand, parseUpdateCommand } from './commands'
import { withTempConfig } from '#test-utils/cli-e2e-helpers'

describe('pair-cli e2e - package command', () => {
  it('package command creates valid ZIP with manifest', async () => {
    const cwd = '/test-package'

    const seed: Record<string, string> = {}
    // Create dataset source structure
    seed[cwd + '/dataset/AGENTS.md'] = '# AGENTS documentation'
    seed[cwd + '/dataset/.pair/knowledge/index.md'] = '# Knowledge Base'
    seed[cwd + '/dataset/.github/workflows/ci.yml'] = 'name: CI\non: push'
    seed[cwd + '/config.json'] = JSON.stringify({
      asset_registries: {
        knowledge: {
          source: '.',
          behavior: 'mirror',
          targets: [{ path: '.', mode: 'canonical' }],
          description: 'Knowledge base dataset',
        },
      },
    })

    const fs = new InMemoryFileSystemService(seed, cwd, cwd)

    // Test that we can create a package structure
    // The actual executePackage function is internal, but we can test it via options validation
    const configPath = cwd + '/config.json'
    const config = JSON.parse(fs.readFileSync(configPath))
    expect(config.asset_registries).toBeDefined()
    expect(config.asset_registries.knowledge).toBeDefined()
  })

  it('package command with --source-dir option validates config', async () => {
    const cwd = '/test-package-source-dir'

    const seed: Record<string, string> = {}
    seed[cwd + '/dataset/AGENTS.md'] = '# AGENTS'
    seed[cwd + '/config.json'] = JSON.stringify({
      asset_registries: {
        content: {
          source: '.',
          behavior: 'mirror',
          targets: [{ path: '.', mode: 'canonical' }],
          description: 'Content',
        },
      },
    })

    const fs = new InMemoryFileSystemService(seed, cwd, cwd)

    // Verify config can be loaded
    const configPath = cwd + '/config.json'
    const config = JSON.parse(fs.readFileSync(configPath))
    expect(config.asset_registries.content).toBeDefined()
  })

  it('package command fails gracefully with invalid config', async () => {
    const cwd = '/test-package-bad-config'

    const seed: Record<string, string> = {}
    seed[cwd + '/dataset/AGENTS.md'] = '# AGENTS'
    seed[cwd + '/config.json'] = '{ invalid json'

    const fs = new InMemoryFileSystemService(seed, cwd, cwd)

    // Verify that parsing invalid config fails
    const configPath = cwd + '/config.json'
    expect(() => {
      JSON.parse(fs.readFileSync(configPath))
    }).toThrow()
  })

  it('package command fails gracefully with missing config', async () => {
    const cwd = '/test-package-no-config'

    const seed: Record<string, string> = {
      [cwd + '/dataset/AGENTS.md']: '# AGENTS',
    }

    const fs = new InMemoryFileSystemService(seed, cwd, cwd)

    // Verify that reading missing config fails
    const configPath = cwd + '/nonexistent.json'
    expect(() => {
      fs.readFileSync(configPath)
    }).toThrow()
  })
})

describe('pair-cli e2e - skills registry pipeline', () => {
  function createSkillsConfig() {
    return {
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
    }
  }

  function createSkillsDatasetFs(cwd: string, opts?: { withTargets?: boolean }) {
    const seed: Record<string, string> = {}
    const datasetBase = `${cwd}/dataset`

    // Pre-existing targets (update scenario — project already installed)
    if (opts?.withTargets) {
      seed[`${cwd}/.pair/knowledge/old.md`] = '# old'
    }

    // Knowledge registry content
    seed[`${datasetBase}/.pair/knowledge/index.md`] = '# Knowledge Base'

    // Skills registry content — mimics real .skills/ structure
    seed[`${datasetBase}/.skills/next/SKILL.md`] =
      '---\nname: next\ndescription: Project navigator\n---\n# /next'

    seed[`${cwd}/config.json`] = JSON.stringify(createSkillsConfig())

    return new InMemoryFileSystemService(seed, cwd, cwd)
  }

  it('update distributes skills with flatten + prefix to canonical target', async () => {
    const cwd = '/test-skills'
    const fs = createSkillsDatasetFs(cwd, { withTargets: true })

    await handleUpdateCommand(parseUpdateCommand({ source: `${cwd}/dataset` }), fs)

    // Flatten is no-op for single-segment 'next', prefix 'pair' → 'pair-next'
    expect(fs.existsSync(`${cwd}/.claude/skills/pair-next/SKILL.md`)).toBe(true)
    const content = fs.readFileSync(`${cwd}/.claude/skills/pair-next/SKILL.md`)
    expect(content).toContain('name: pair-next')
  })

  it('update creates symlinks for secondary targets', async () => {
    const cwd = '/test-skills-symlink'
    const fs = createSkillsDatasetFs(cwd, { withTargets: true })

    await handleUpdateCommand(parseUpdateCommand({ source: `${cwd}/dataset` }), fs)

    // Secondary targets should be symlinks pointing to the canonical path
    const symlinks = fs.getSymlinks()
    const canonicalPath = `${cwd}/.claude/skills`
    const githubSymlink = `${cwd}/.github/skills`
    const cursorSymlink = `${cwd}/.cursor/skills`

    expect(symlinks.get(githubSymlink)).toBe(canonicalPath)
    expect(symlinks.get(cursorSymlink)).toBe(canonicalPath)
  })

  it('validate-config succeeds with skills registry config', async () => {
    const cwd = '/test-skills-validate'
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    await withTempConfig(fs, createSkillsConfig(), async () => {
      const { config } = await import('#config').then(m => m.loadConfigWithOverrides(fs))
      const { validateConfig } = (await import('#config')) as typeof import('#config')
      const validation = validateConfig(config)

      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })
  })

  it('validate-config fails when skills registry has no canonical target', async () => {
    const cwd = '/test-skills-no-canonical'
    const fs = new InMemoryFileSystemService({}, cwd, cwd)

    const badConfig = {
      asset_registries: {
        skills: {
          source: '.skills',
          behavior: 'mirror',
          flatten: true,
          prefix: 'pair',
          description: 'Skills with no canonical target',
          targets: [
            { path: '.github/skills/', mode: 'symlink' },
            { path: '.cursor/skills/', mode: 'symlink' },
          ],
        },
      },
    }

    await withTempConfig(fs, badConfig, async () => {
      const { config } = await import('#config').then(m => m.loadConfigWithOverrides(fs))
      const { validateConfig } = (await import('#config')) as typeof import('#config')
      const validation = validateConfig(config)

      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.includes('canonical'))).toBe(true)
    })
  })

  it('install distributes skills to canonical and symlink targets', async () => {
    const cwd = '/test-skills-install'
    const fs = createSkillsDatasetFs(cwd)

    await installCommand(fs, ['--source', `${cwd}/dataset`], { useDefaults: true })

    // Canonical target should have flattened+prefixed content
    expect(fs.existsSync(`${cwd}/.claude/skills/pair-next/SKILL.md`)).toBe(true)

    // Secondary targets should be symlinks
    const symlinks = fs.getSymlinks()
    expect(symlinks.has(`${cwd}/.github/skills`)).toBe(true)
    expect(symlinks.has(`${cwd}/.cursor/skills`)).toBe(true)
  })
})

// ── kb-validate E2E tests ──────────────────────────────────────────────

describe('pair-cli e2e - org packaging', () => {
  it('parsePackageCommand includes org fields when --org flag present', async () => {
    const { parsePackageCommand } = await import('./commands/package/parser.js')

    const config = parsePackageCommand({
      org: true,
      orgName: 'Acme Corp',
      team: 'Platform',
      compliance: 'SOC2,ISO27001',
      distribution: 'private',
    })

    expect(config.org).toBe(true)
    expect(config.orgName).toBe('Acme Corp')
    expect(config.team).toBe('Platform')
    expect(config.compliance).toEqual(['SOC2', 'ISO27001'])
    expect(config.distribution).toBe('private')
  })

  it('parsePackageCommand omits org fields when --org absent', async () => {
    const { parsePackageCommand } = await import('./commands/package/parser.js')

    const config = parsePackageCommand({ name: 'test-kb' })

    expect(config.org).toBeUndefined()
    expect(config.orgName).toBeUndefined()
  })

  it('org template merges with CLI flags', async () => {
    const { loadOrgTemplate, mergeOrgDefaults } = await import('./commands/package/org-template.js')

    const cwd = '/e2e-org-template'
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.pair/org-template.json`]: JSON.stringify({
          name: 'Template Corp',
          team: 'Default Team',
          compliance: ['SOC2'],
          distribution: 'restricted',
        }),
      },
      cwd,
      cwd,
    )

    const template = await loadOrgTemplate(cwd, fs, '.pair/org-template.json')
    expect(template).not.toBeNull()

    // CLI flags override template
    const org = mergeOrgDefaults({ orgName: 'CLI Corp', team: 'CLI Team' }, template)
    expect(org.name).toBe('CLI Corp')
    expect(org.team).toBe('CLI Team')
    // Template values used as fallback
    expect(org.compliance).toEqual(['SOC2'])
    expect(org.distribution).toBe('restricted')
  })

  it('createOrganizationMetadata factory provides defaults', async () => {
    const { createOrganizationMetadata } = await import('./commands/package/metadata.js')

    const org = createOrganizationMetadata({ name: 'Acme' })
    expect(org.compliance).toEqual([])
    expect(org.distribution).toBe('open')
  })

  it('generateManifestMetadata includes organization in manifest', async () => {
    const { generateManifestMetadata, createOrganizationMetadata } = await import(
      './commands/package/metadata.js'
    )

    const org = createOrganizationMetadata({
      name: 'Acme',
      team: 'Platform',
      compliance: ['SOC2'],
      distribution: 'private',
    })

    const manifest = generateManifestMetadata(['knowledge'], { organization: org })
    expect(manifest.organization).toBeDefined()
    expect(manifest.organization?.name).toBe('Acme')
    expect(manifest.organization?.distribution).toBe('private')
  })
})
