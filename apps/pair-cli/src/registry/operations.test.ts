import { describe, it, expect } from 'vitest'
import { createTestFs } from '#test-utils/test-helpers'
import {
  doCopyAndUpdateLinks,
  calculatePaths,
  buildCopyOptions,
  distributeToSecondaryTargets,
} from './operations'
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
      options: { defaultBehavior: 'mirror' },
    })

    expect(await fs.exists('/dataset/dst/file1.md')).toBe(true)
    expect(await fs.exists('/dataset/dst/file2.md')).toBe(true)
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
      behavior: 'mirror',
      target_path: '.pair',
      description: 'KB',
    }
    const options = buildCopyOptions(config)
    expect(options.defaultBehavior).toBe('mirror')
    expect(options.flatten).toBe(false)
    expect(options.prefix).toBeUndefined()
    expect(options.targets).toEqual([])
  })

  it('includes flatten and prefix when set', () => {
    const config: RegistryConfig = {
      behavior: 'mirror',
      target_path: '.skills',
      description: 'Skills',
      flatten: true,
      prefix: 'pair',
    }
    const options = buildCopyOptions(config)
    expect(options.flatten).toBe(true)
    expect(options.prefix).toBe('pair')
  })

  it('includes targets when set', () => {
    const config: RegistryConfig = {
      behavior: 'mirror',
      target_path: '.skills',
      description: 'Skills',
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
      behavior: 'mirror',
      target_path: '.github',
      description: 'GH',
      include: ['/agents', '/workflows'],
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
      canonicalPath: '/project/.claude/skills',
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
      canonicalPath: '/project/.claude/skills',
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
      canonicalPath: '/project/.claude/skills',
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
      canonicalPath: '/project/.claude/skills',
      targets: [],
      baseTarget: '/project',
    })
    // No error, no-op
  })
})
