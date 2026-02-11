import { describe, it, expect } from 'vitest'
import {
  normalizeKey,
  resolveBehavior,
  validateMirrorConstraints,
  validateTargets,
  Behavior,
  TargetMode,
  TargetConfig,
} from './behavior'

describe('helpers', () => {
  it('normalizeKey trims slashes and backslashes', () => {
    expect(normalizeKey('///foo\\bar/')).toBe('foo/bar')
  })

  it('resolveBehavior finds exact and ancestor matches', () => {
    const fb: Record<string, Behavior> = { a: 'add', 'a/b': 'overwrite', c: 'mirror' }
    expect(resolveBehavior('a/b/c', fb, 'overwrite')).toBe('overwrite')
    expect(resolveBehavior('a/x', fb, 'overwrite')).toBe('add')
    expect(resolveBehavior('z', fb, 'overwrite')).toBe('overwrite')
  })

  it('validateMirrorConstraints throws when parent is mirror and child not mirror', () => {
    const fb: Record<string, Behavior> = { a: 'mirror', 'a/b': 'add' }
    expect(() => validateMirrorConstraints(fb)).toThrow()
  })
})

describe('TargetMode', () => {
  it('accepts canonical, symlink, and copy values', () => {
    const modes: TargetMode[] = ['canonical', 'symlink', 'copy']
    expect(modes).toHaveLength(3)
    expect(modes).toContain('canonical')
    expect(modes).toContain('symlink')
    expect(modes).toContain('copy')
  })
})

describe('TargetConfig', () => {
  it('creates a target config with path and mode', () => {
    const target: TargetConfig = { path: '.claude/skills/', mode: 'canonical' }
    expect(target.path).toBe('.claude/skills/')
    expect(target.mode).toBe('canonical')
  })

  it('creates a target config with copy mode', () => {
    const target: TargetConfig = { path: '.cursor/skills/', mode: 'copy' }
    expect(target.path).toBe('.cursor/skills/')
    expect(target.mode).toBe('copy')
  })

  it('creates a target config with symlink mode', () => {
    const target: TargetConfig = { path: '.github/skills/', mode: 'symlink' }
    expect(target.path).toBe('.github/skills/')
    expect(target.mode).toBe('symlink')
  })
})

describe('validateTargets', () => {
  // Scenario 1: Single target (any mode) — always valid
  it('accepts a single target with canonical mode', () => {
    const targets: TargetConfig[] = [{ path: '.claude/skills/', mode: 'canonical' }]
    expect(() => validateTargets(targets)).not.toThrow()
  })

  it('accepts a single target with symlink mode', () => {
    const targets: TargetConfig[] = [{ path: '.github/skills/', mode: 'symlink' }]
    expect(() => validateTargets(targets)).not.toThrow()
  })

  it('accepts a single target with copy mode', () => {
    const targets: TargetConfig[] = [{ path: '.cursor/skills/', mode: 'copy' }]
    expect(() => validateTargets(targets)).not.toThrow()
  })

  // Scenario 2: Multiple targets with exactly 1 canonical — valid
  it('accepts multiple targets with exactly one canonical', () => {
    const targets: TargetConfig[] = [
      { path: '.claude/skills/', mode: 'canonical' },
      { path: '.github/skills/', mode: 'symlink' },
      { path: '.cursor/skills/', mode: 'copy' },
    ]
    expect(() => validateTargets(targets)).not.toThrow()
  })

  // Scenario 3: Multiple targets with 0 canonical — error
  it('rejects multiple targets with no canonical', () => {
    const targets: TargetConfig[] = [
      { path: '.github/skills/', mode: 'symlink' },
      { path: '.cursor/skills/', mode: 'copy' },
    ]
    expect(() => validateTargets(targets)).toThrow(/exactly one.*canonical/i)
  })

  // Scenario 4: Multiple targets with 2+ canonical — error
  it('rejects multiple targets with more than one canonical', () => {
    const targets: TargetConfig[] = [
      { path: '.claude/skills/', mode: 'canonical' },
      { path: '.cursor/skills/', mode: 'canonical' },
    ]
    expect(() => validateTargets(targets)).toThrow(/exactly one.*canonical/i)
  })

  // Scenario 5: Windows + symlink — error
  it('rejects symlink targets on Windows', () => {
    const targets: TargetConfig[] = [
      { path: '.claude/skills/', mode: 'canonical' },
      { path: '.github/skills/', mode: 'symlink' },
    ]
    expect(() => validateTargets(targets, 'win32')).toThrow(/windows.*symlink/i)
  })

  it('accepts symlink targets on macOS', () => {
    const targets: TargetConfig[] = [
      { path: '.claude/skills/', mode: 'canonical' },
      { path: '.github/skills/', mode: 'symlink' },
    ]
    expect(() => validateTargets(targets, 'darwin')).not.toThrow()
  })

  it('accepts symlink targets on Linux', () => {
    const targets: TargetConfig[] = [
      { path: '.claude/skills/', mode: 'canonical' },
      { path: '.github/skills/', mode: 'symlink' },
    ]
    expect(() => validateTargets(targets, 'linux')).not.toThrow()
  })

  // Scenario 6: Empty targets — no-op (no error)
  it('accepts empty targets array', () => {
    expect(() => validateTargets([])).not.toThrow()
  })

  // Scenario 7: Circular symlink — error (symlink path equals canonical path)
  it('rejects circular symlink where symlink target equals canonical path', () => {
    const targets: TargetConfig[] = [
      { path: '.claude/skills/', mode: 'canonical' },
      { path: '.claude/skills/', mode: 'symlink' },
    ]
    expect(() => validateTargets(targets)).toThrow(/circular|duplicate/i)
  })

  // Additional: duplicate paths with different modes
  it('rejects duplicate target paths', () => {
    const targets: TargetConfig[] = [
      { path: '.claude/skills/', mode: 'canonical' },
      { path: '.claude/skills/', mode: 'copy' },
    ]
    expect(() => validateTargets(targets)).toThrow(/duplicate/i)
  })

  // Transform + symlink — error
  it('rejects transform combined with symlink mode', () => {
    const targets: TargetConfig[] = [
      { path: 'AGENTS.md', mode: 'canonical' },
      { path: 'CLAUDE.md', mode: 'symlink', transform: { prefix: 'claude' } },
    ]
    expect(() => validateTargets(targets)).toThrow(/transform.*incompatible.*symlink/i)
  })

  // Transform + canonical — valid
  it('accepts transform combined with canonical mode', () => {
    const targets: TargetConfig[] = [
      { path: 'AGENTS.md', mode: 'canonical', transform: { prefix: 'claude' } },
    ]
    expect(() => validateTargets(targets)).not.toThrow()
  })

  // Transform + copy — valid
  it('accepts transform combined with copy mode', () => {
    const targets: TargetConfig[] = [
      { path: 'AGENTS.md', mode: 'canonical' },
      { path: 'CLAUDE.md', mode: 'copy', transform: { prefix: 'claude' } },
    ]
    expect(() => validateTargets(targets)).not.toThrow()
  })
})
