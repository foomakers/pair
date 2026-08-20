import { describe, it, expect, vi } from 'vitest'
import { handleKbValidateCommand } from './handler'
import { logger } from '@pair/content-ops'
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

/**
 * US-188 — optional link patterns end to end through the handler: config file,
 * CLI flag, their union, and the --strict override.
 */
describe('handleKbValidateCommand - optional link patterns (US-188)', () => {
  const cwd = '/kb-optional-links'

  function seedKb(configExtras: Record<string, unknown> = {}): InMemoryFileSystemService {
    const config = {
      asset_registries: {
        knowledge: {
          source: '.pair/knowledge',
          behavior: 'mirror',
          description: 'KB content',
          targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
        },
      },
      ...configExtras,
    }
    return new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify(config),
        // Link into the codebase that sits beside the KB — absent in a KB-only checkout
        [`${cwd}/.pair/knowledge/index.md`]: '# KB\n\nSee [code](../../apps/website/page.tsx).',
      },
      cwd,
      cwd,
    )
  }

  it('fails on the out-of-tree link when nothing declares it optional (AC-6)', async () => {
    await expect(handleKbValidateCommand({ command: 'kb-validate' }, seedKb())).rejects.toThrow(
      'Validation failed',
    )
  })

  it('passes when config declares the pattern (AC-1)', async () => {
    const fs = seedKb({ link_validation: { optional_link_patterns: ['apps/**'] } })

    await expect(handleKbValidateCommand({ command: 'kb-validate' }, fs)).resolves.toBeUndefined()
  })

  it('passes when only the CLI declares the pattern (AC-2)', async () => {
    await expect(
      handleKbValidateCommand(
        { command: 'kb-validate', optionalLinkPatterns: ['../../apps/**'] },
        seedKb(),
      ),
    ).resolves.toBeUndefined()
  })

  it('merges CLI patterns with config patterns rather than replacing them (AC-2)', async () => {
    // config pattern matches, CLI pattern does not → union must still cover the link
    const fs = seedKb({ link_validation: { optional_link_patterns: ['apps/**'] } })

    await expect(
      handleKbValidateCommand(
        { command: 'kb-validate', optionalLinkPatterns: ['packages/**'] },
        fs,
      ),
    ).resolves.toBeUndefined()
  })

  it('still fails on a missing link that matches no pattern (AC-3)', async () => {
    const fs = seedKb({ link_validation: { optional_link_patterns: ['packages/**'] } })

    await expect(handleKbValidateCommand({ command: 'kb-validate' }, fs)).rejects.toThrow(
      'Validation failed',
    )
  })

  it('--strict overrides the configured patterns (AC-4)', async () => {
    const fs = seedKb({ link_validation: { optional_link_patterns: ['apps/**'] } })

    await expect(
      handleKbValidateCommand({ command: 'kb-validate', strict: true }, fs),
    ).rejects.toThrow('Validation failed')
  })

  it('--ignore-config leaves the CLI patterns in force', async () => {
    await expect(
      handleKbValidateCommand(
        { command: 'kb-validate', ignoreConfig: true, optionalLinkPatterns: ['apps/**'] },
        seedKb(),
      ),
    ).resolves.toBeUndefined()
  })

  // A section of the wrong shape must not read as "no patterns declared": without a
  // diagnostic the run reports every out-of-tree link as broken and the config typo
  // is invisible.
  it.each([
    {
      case: 'a string instead of an array (the comma-separated-flag typo)',
      extras: { link_validation: { optional_link_patterns: 'apps/**' } },
      expected: /optional_link_patterns' must be an array of strings, got a string/,
    },
    {
      case: 'a camelCase key',
      extras: { link_validation: { optionalLinkPatterns: ['apps/**'] } },
      expected: /declares no 'optional_link_patterns' \(found: optionalLinkPatterns\)/,
    },
    {
      case: 'a section that is not an object',
      extras: { link_validation: 'apps/**' },
      expected: /'link_validation' must be an object, got a string/,
    },
    {
      case: 'non-string entries in the array',
      extras: { link_validation: { optional_link_patterns: ['apps/**', 42] } },
      expected: /has 1 entry that is not a non-empty string/,
    },
  ])('warns when the config declares $case', async ({ extras, expected }) => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)

    await handleKbValidateCommand({ command: 'kb-validate' }, seedKb(extras)).catch(() => undefined)

    expect(warn.mock.calls.flat().join('\n')).toMatch(expected)
    warn.mockRestore()
  })

  it('carries config and pattern diagnostics into the printed report, not only the log', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const fs = seedKb({ link_validation: { optionalLinkPatterns: ['apps/**'] } })

    await handleKbValidateCommand(
      { command: 'kb-validate', optionalLinkPatterns: ['[unterminated'] },
      fs,
    ).catch(() => undefined)

    const output = log.mock.calls.flat().join('\n')
    expect(output).toContain('Configuration:')
    expect(output).toMatch(/declares no 'optional_link_patterns'/)
    expect(output).toContain("Invalid optional link pattern '[unterminated', ignoring")
    expect(output).toContain('Warnings: 2')

    log.mockRestore()
    warn.mockRestore()
  })
})
