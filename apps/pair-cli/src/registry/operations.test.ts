import { describe, it, expect } from 'vitest'
import { createTestFs } from '#test-utils/test-helpers'
import {
  doCopyAndUpdateLinks,
  calculatePaths,
  buildCopyOptions,
  distributeToSecondaryTargets,
  stripMarkersFromTarget,
  postCopyOps,
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

  // ── Mirror cleanup runs on THIS path, not only in the library (#426) ────────
  // The recursion landed in content-ops but `pair update` never called it: the registry
  // copy falls through to `copyDirHelper`, a pure source->dest copy that deletes nothing.
  // Four unit tests passed by calling `handleMirrorCleanup` directly, which is how the
  // defect came to be believed fixed. These go through `doCopyAndUpdateLinks` — the
  // function the CLI actually invokes.
  it('doCopyAndUpdateLinks removes a target file the source no longer ships', async () => {
    const fs = createTestFs(
      {},
      {
        '/dataset/src/keep.md': '# Keep',
        '/dataset/dst/keep.md': '# Keep',
        '/dataset/dst/ORPHAN.md': '# Removed from the dataset months ago',
        '/dataset/dst/how-to/99-stale.md': '# Nested orphan under a shared directory',
        '/dataset/src/how-to/01-live.md': '# Still shipped',
        '/dataset/dst/how-to/01-live.md': '# Still shipped',
      },
      cwd,
    )

    await doCopyAndUpdateLinks(fs, {
      source: 'src',
      target: 'dst',
      datasetRoot: '/dataset',
      options: { ...defaultSyncOptions(), defaultBehavior: 'mirror' },
    })

    expect(await fs.exists('/dataset/dst/ORPHAN.md')).toBe(false)
    expect(await fs.exists('/dataset/dst/how-to/99-stale.md')).toBe(false)
    expect(await fs.exists('/dataset/dst/how-to/01-live.md')).toBe(true)
    expect(await fs.exists('/dataset/dst/keep.md')).toBe(true)
  })

  it('doCopyAndUpdateLinks leaves an EXCLUDED subtree alone', async () => {
    // `exclude` means "as if it were never in the source" — so cleanup must not read the
    // absence of a source entry as permission to delete the target one.
    const fs = createTestFs(
      {},
      {
        '/dataset/src/keep.md': '# Keep',
        '/dataset/dst/keep.md': '# Keep',
        '/dataset/dst/private/theirs.md': '# The registry does not own this',
      },
      cwd,
    )

    await doCopyAndUpdateLinks(fs, {
      source: 'src',
      target: 'dst',
      datasetRoot: '/dataset',
      options: { ...defaultSyncOptions(), defaultBehavior: 'mirror', exclude: ['private'] },
    })

    expect(await fs.exists('/dataset/dst/private/theirs.md')).toBe(true)
  })

  it('doCopyAndUpdateLinks deletes nothing when the registry behavior is not mirror', async () => {
    const fs = createTestFs(
      {},
      { '/dataset/src/keep.md': '# Keep', '/dataset/dst/theirs.md': '# Target-only' },
      cwd,
    )

    await doCopyAndUpdateLinks(fs, {
      source: 'src',
      target: 'dst',
      datasetRoot: '/dataset',
      options: { ...defaultSyncOptions(), defaultBehavior: 'add' },
    })

    expect(await fs.exists('/dataset/dst/theirs.md')).toBe(true)
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
    expect(options.flattenDepth).toBeUndefined()
  })

  // #407: dropped here, the copy pipeline always ran an unbounded flatten and a
  // skill's nested `references/` installed as a sibling pseudo-skill.
  it('forwards flattenDepth to the copy pipeline when the registry declares it', () => {
    const config: RegistryConfig = {
      source: '.skills',
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: true,
      flattenDepth: 2,
      prefix: 'pair',
      targets: [{ path: '.skills', mode: 'canonical' }],
    }
    expect(buildCopyOptions(config).flattenDepth).toBe(2)
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
      '.github/agents': 'mirror',
      '.github/workflows': 'mirror',
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

describe('postCopyOps', () => {
  it('strips markers when target is a file', async () => {
    const fs = createTestFs({}, {}, '/project')
    await fs.mkdir('/project', { recursive: true })
    await fs.writeFile(
      '/project/AGENTS.md',
      '# Title\n<!-- @claude-skip-start -->\nHidden\n<!-- @claude-skip-end -->\nVisible',
    )

    const registryConfig: RegistryConfig = {
      source: 'AGENTS.md',
      behavior: 'mirror',
      description: 'Agents',
      include: [],
      flatten: false,
      targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
    }

    await postCopyOps({
      fs,
      registryConfig,
      effectiveTarget: '/project/AGENTS.md',
      datasetPath: '/dataset/AGENTS.md',
      baseTarget: '/project',
    })

    const result = await fs.readFile('/project/AGENTS.md')
    expect(result).not.toContain('<!-- @')
    expect(result).toContain('Visible')
  })

  it('distributes to secondary targets when multiple targets exist', async () => {
    const fs = createTestFs({}, {}, '/project')
    await fs.mkdir('/project/.claude/skills', { recursive: true })
    await fs.writeFile('/project/.claude/skills/SKILL.md', '# Skill')

    const registryConfig: RegistryConfig = {
      source: '.skills',
      behavior: 'mirror',
      description: 'Skills',
      include: [],
      flatten: false,
      targets: [
        { path: '.claude/skills/', mode: 'canonical' },
        { path: '.cursor/skills/', mode: 'copy' },
      ],
    }

    await postCopyOps({
      fs,
      registryConfig,
      effectiveTarget: '/project/.claude/skills',
      datasetPath: '/dataset/.skills',
      baseTarget: '/project',
    })

    expect(await fs.exists('/project/.cursor/skills/SKILL.md')).toBe(true)
  })

  it('skips strip when target is a directory', async () => {
    const fs = createTestFs({}, {}, '/project')
    await fs.mkdir('/project/.pair/knowledge', { recursive: true })
    await fs.writeFile(
      '/project/.pair/knowledge/README.md',
      '# Title\n<!-- @claude-skip-start -->\nHidden\n<!-- @claude-skip-end -->',
    )

    const registryConfig: RegistryConfig = {
      source: '.pair/knowledge',
      behavior: 'mirror',
      description: 'KB',
      include: [],
      flatten: false,
      targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
    }

    await postCopyOps({
      fs,
      registryConfig,
      effectiveTarget: '/project/.pair/knowledge',
      datasetPath: '/dataset/.pair/knowledge',
      baseTarget: '/project',
    })

    // Markers should remain — stripMarkers only runs on files, not directories
    const result = await fs.readFile('/project/.pair/knowledge/README.md')
    expect(result).toContain('<!-- @claude-skip-start -->')
  })

  it('no-op when single canonical target', async () => {
    const fs = createTestFs({}, {}, '/project')
    await fs.mkdir('/project/.pair', { recursive: true })
    await fs.writeFile('/project/.pair/README.md', '# Content')

    const registryConfig: RegistryConfig = {
      source: '.pair',
      behavior: 'mirror',
      description: 'KB',
      include: [],
      flatten: false,
      targets: [{ path: '.pair', mode: 'canonical' }],
    }

    await postCopyOps({
      fs,
      registryConfig,
      effectiveTarget: '/project/.pair',
      datasetPath: '/dataset/.pair',
      baseTarget: '/project',
    })

    // No secondary distribution, directory stays as-is
    const result = await fs.readFile('/project/.pair/README.md')
    expect(result).toBe('# Content')
  })
})

/**
 * BUG #03: doCopyAndUpdateLinks silently skips missing source
 *
 * When a registry source path does not exist, doCopyAndUpdateLinks used to log a
 * warning and return {} — the caller had no way to know the registry was skipped.
 * Now it returns { skipped: true, reason: string } so the caller can decide.
 */
describe('BUG #03: doCopyAndUpdateLinks must signal missing source', () => {
  it('returns skipped=true when source path does not exist', async () => {
    const fs = createTestFs({}, {}, '/test')

    const result = await doCopyAndUpdateLinks(fs, {
      source: 'nonexistent-registry',
      target: 'dst',
      datasetRoot: '/dataset',
    })

    expect(result).toHaveProperty('skipped', true)
    expect(result).toHaveProperty('reason')
    expect(String(result['reason'])).toContain('nonexistent-registry')
  })

  it('returns skipped result with the missing absolute path', async () => {
    const fs = createTestFs({}, {}, '/test')

    const result = await doCopyAndUpdateLinks(fs, {
      source: '/absolute/missing/path',
      target: '/test/dst',
      datasetRoot: '/dataset',
    })

    expect(result).toHaveProperty('skipped', true)
    expect(String(result['reason'])).toContain('/absolute/missing/path')
  })
})

describe('exclude flows from the registry config into the copy options (#277)', () => {
  it('passes exclude through when the registry declares it', () => {
    const options = buildCopyOptions({
      source: '.skills',
      behavior: 'overwrite',
      description: 'skills',
      include: [],
      exclude: ['process/setup'],
      flatten: true,
      prefix: 'pair',
      targets: [],
    })
    expect(options.exclude).toEqual(['process/setup'])
  })

  it('omits it entirely when the registry declares none, so nothing changes for other registries', () => {
    const options = buildCopyOptions({
      source: '.knowledge',
      behavior: 'mirror',
      description: 'kb',
      include: [],
      flatten: false,
      targets: [],
    })
    expect(options.exclude).toBeUndefined()
  })
})
