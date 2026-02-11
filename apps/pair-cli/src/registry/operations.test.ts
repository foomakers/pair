import { describe, it, expect } from 'vitest'
import { createTestFs } from '#test-utils/test-helpers'
import {
  doCopyAndUpdateLinks,
  calculatePaths,
  buildCopyOptions,
  distributeToSecondaryTargets,
  stripMarkersFromTarget,
} from './operations'
import { defaultSyncOptions, InMemoryFileSystemService } from '@pair/content-ops'
import type { RegistryConfig } from './resolver'

describe('registry operations', () => {
  const cwd = '/test'

  it('doCopyAndUpdateLinks copies files from source to target', async () => {
    const fs = createTestFs(
      {},
      {
        '/dataset/src/file1.md': '# File 1',
        '/dataset/src/file2.md': '# File 2',
      },
      cwd,
    )

    await doCopyAndUpdateLinks(fs, {
      source: 'src',
      target: 'dst',
      datasetRoot: '/dataset',
      options: { ...defaultSyncOptions(), defaultBehavior: 'mirror' },
    })

    expect(await fs.exists('/dataset/dst/file1.md')).toBe(true)
    expect(await fs.exists('/dataset/dst/file2.md')).toBe(true)
  })

  it('returns skillNameMap when flatten+prefix produces skill renames', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/dataset/.skills/capability/next/SKILL.md':
          '# /next — Navigator\n\nCompose /verify-quality for checks.',
        '/dataset/.skills/capability/verify-quality/SKILL.md':
          '# /verify-quality — Quality Gate Checker',
      },
      '/test',
      '/test',
    )

    const result = await doCopyAndUpdateLinks(fs, {
      source: '/dataset/.skills',
      target: '/test/.claude/skills',
      datasetRoot: '/dataset',
      options: { ...defaultSyncOptions(), flatten: true, prefix: 'pair', targets: [] },
    })

    // doCopyAndUpdateLinks must propagate the skillNameMap from copyDirectoryWithTransforms
    expect(result).toHaveProperty('skillNameMap')
    const map = result['skillNameMap'] as Map<string, string>
    expect(map).toBeInstanceOf(Map)
    expect(map.get('next')).toBe('pair-capability-next')
    expect(map.get('verify-quality')).toBe('pair-capability-verify-quality')
  })

  it('calculatePaths resolves absolute and relative paths', () => {
    const fs = createTestFs({}, {}, '/test-root')
    const result = calculatePaths(fs, '/dataset', 'target/pkg', 'src/reg')

    expect(result.fullSourcePath).toBe('/dataset/src/reg')
    expect(result.fullTargetPath).toBe('/test-root/target/pkg')
  })
})

describe('buildCopyOptions', () => {
  it('returns SyncOptions with defaults for legacy registry', () => {
    const config: RegistryConfig = {
      source: '.pair',
      behavior: 'mirror',
      description: 'KB',
      include: [],
      flatten: false,
      targets: [{ path: '.pair', mode: 'canonical' }],
    }
    const options = buildCopyOptions(config)
    expect(options.defaultBehavior).toBe('mirror')
    expect(options.flatten).toBe(false)
    expect(options.prefix).toBeUndefined()
    expect(options.targets).toEqual([{ path: '.pair', mode: 'canonical' }])
  })

  it('includes flatten and prefix when set', () => {
    const config: RegistryConfig = {
      source: '.skills',
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: true,
      prefix: 'pair',
      targets: [{ path: '.skills', mode: 'canonical' }],
    }
    const options = buildCopyOptions(config)
    expect(options.flatten).toBe(true)
    expect(options.prefix).toBe('pair')
  })

  it('includes targets when set', () => {
    const config: RegistryConfig = {
      source: '.skills',
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: false,
      targets: [
        { path: '.claude/skills/', mode: 'canonical' },
        { path: '.github/skills/', mode: 'symlink' },
      ],
    }
    const options = buildCopyOptions(config)
    expect(options.targets).toHaveLength(2)
    expect(options.targets[0]!.mode).toBe('canonical')
  })

  it('handles include + mirror with folderBehavior override', () => {
    const config: RegistryConfig = {
      source: '.github',
      behavior: 'mirror',
      description: 'GH',
      include: ['/agents', '/workflows'],
      flatten: false,
      targets: [{ path: '.github', mode: 'canonical' }],
    }
    const options = buildCopyOptions(config)
    expect(options.defaultBehavior).toBe('skip')
    expect(options.folderBehavior).toEqual({
      '/agents': 'mirror',
      '/workflows': 'mirror',
    })
  })
})

describe('distributeToSecondaryTargets', () => {
  it('creates symlinks for symlink targets', async () => {
    const fs = createTestFs({}, {}, '/project')
    await fs.mkdir('/project/.claude/skills', { recursive: true })
    await fs.writeFile('/project/.claude/skills/SKILL.md', '# Skill')

    await distributeToSecondaryTargets({
      fileService: fs,
      sourcePath: '/dataset/.claude/skills',
      targets: [
        { path: '.claude/skills/', mode: 'canonical' },
        { path: '.github/skills/', mode: 'symlink' },
      ],
      baseTarget: '/project',
    })

    const symlinks = fs.getSymlinks()
    expect(symlinks.has('/project/.github/skills')).toBe(true)
  })

  it('copies for copy targets', async () => {
    const fs = createTestFs({}, {}, '/project')
    await fs.mkdir('/project/.claude/skills', { recursive: true })
    await fs.writeFile('/project/.claude/skills/SKILL.md', '# Skill')

    await distributeToSecondaryTargets({
      fileService: fs,
      sourcePath: '/dataset/.claude/skills',
      targets: [
        { path: '.claude/skills/', mode: 'canonical' },
        { path: '.cursor/skills/', mode: 'copy' },
      ],
      baseTarget: '/project',
    })

    expect(await fs.exists('/project/.cursor/skills/SKILL.md')).toBe(true)
  })

  it('skips canonical targets', async () => {
    const fs = createTestFs({}, {}, '/project')
    await fs.mkdir('/project/.claude/skills', { recursive: true })

    await distributeToSecondaryTargets({
      fileService: fs,
      sourcePath: '/dataset/.claude/skills',
      targets: [{ path: '.claude/skills/', mode: 'canonical' }],
      baseTarget: '/project',
    })

    const symlinks = fs.getSymlinks()
    expect(symlinks.size).toBe(0)
  })

  it('handles empty targets array', async () => {
    const fs = createTestFs({}, {}, '/project')
    await distributeToSecondaryTargets({
      fileService: fs,
      sourcePath: '/dataset/.claude/skills',
      targets: [],
      baseTarget: '/project',
    })
    // No error, no-op
  })

  it('skips distribution when canonical path does not exist', async () => {
    const fs = createTestFs({}, {}, '/project')

    await distributeToSecondaryTargets({
      fileService: fs,
      sourcePath: '/dataset/.claude/skills',
      targets: [
        { path: '.claude/skills/', mode: 'canonical' },
        { path: '.github/skills/', mode: 'symlink' },
        { path: '.cursor/skills/', mode: 'copy' },
      ],
      baseTarget: '/project',
    })

    const symlinks = fs.getSymlinks()
    expect(symlinks.size).toBe(0)
    expect(await fs.exists('/project/.github/skills')).toBe(false)
    expect(await fs.exists('/project/.cursor/skills')).toBe(false)
  })

  it('applies transform for copy targets with transform config', async () => {
    const sourceContent = [
      '# AGENTS.md',
      '',
      '<!-- @claude-skip-start -->',
      '## Session Context',
      'Stateless tracking',
      '<!-- @claude-skip-end -->',
      '',
      '## Quick Rules',
      'Important rules',
    ].join('\n')

    const fs = createTestFs({}, {}, '/project')
    await fs.mkdir('/dataset', { recursive: true })
    await fs.writeFile('/dataset/AGENTS.md', sourceContent)
    await fs.writeFile('/project/AGENTS.md', '# clean canonical')

    await distributeToSecondaryTargets({
      fileService: fs,
      sourcePath: '/dataset/AGENTS.md',
      targets: [
        { path: 'AGENTS.md', mode: 'canonical' },
        { path: 'CLAUDE.md', mode: 'copy', transform: { prefix: 'claude' } },
      ],
      baseTarget: '/project',
    })

    const claudeContent = await fs.readFile('/project/CLAUDE.md')
    expect(claudeContent).not.toContain('Session Context')
    expect(claudeContent).not.toContain('Stateless tracking')
    expect(claudeContent).toContain('## Quick Rules')
    expect(claudeContent).not.toContain('<!-- @')
  })
})

describe('stripMarkersFromTarget', () => {
  it('strips all markers from a file', async () => {
    const content = [
      '# Title',
      '<!-- @claude-skip-start -->',
      'Section',
      '<!-- @claude-skip-end -->',
      'End',
    ].join('\n')

    const fs = createTestFs({}, {}, '/project')
    await fs.mkdir('/project', { recursive: true })
    await fs.writeFile('/project/AGENTS.md', content)

    await stripMarkersFromTarget(fs, '/project/AGENTS.md')

    const result = await fs.readFile('/project/AGENTS.md')
    expect(result).toContain('Section')
    expect(result).toContain('End')
    expect(result).not.toContain('<!-- @')
  })

  it('applies transform commands before stripping when transform provided', async () => {
    const content = [
      '# AGENTS.md',
      '',
      '<!-- @claude-skip-start -->',
      '## Skipped',
      '<!-- @claude-skip-end -->',
      '',
      '## Kept',
    ].join('\n')

    const fs = createTestFs({}, {}, '/project')
    await fs.mkdir('/project', { recursive: true })
    await fs.writeFile('/project/AGENTS.md', content)

    await stripMarkersFromTarget(fs, '/project/AGENTS.md', { prefix: 'claude' })

    const result = await fs.readFile('/project/AGENTS.md')
    expect(result).not.toContain('Skipped')
    expect(result).toContain('## Kept')
    expect(result).not.toContain('<!-- @')
  })
})
