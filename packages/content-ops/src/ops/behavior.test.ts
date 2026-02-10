import { describe, it, expect } from 'vitest'
import {
  normalizeKey,
  resolveBehavior,
  validateMirrorConstraints,
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
