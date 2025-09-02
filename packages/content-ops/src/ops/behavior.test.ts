import { describe, it, expect } from 'vitest'
import { normalizeKey, resolveBehavior, validateMirrorConstraints, Behavior } from './behavior'

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
