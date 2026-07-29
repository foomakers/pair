import { describe, it, expect } from 'vitest'
import { resolveKbIdentity, slugifyKbName, validateKbName } from './identity'

describe('slugifyKbName', () => {
  it('lowercases and hyphenates separators', () => {
    expect(slugifyKbName('Acme Standards KB')).toBe('acme-standards-kb')
  })

  it('collapses repeated and trims edge separators', () => {
    expect(slugifyKbName('  __Acme // KB__  ')).toBe('acme-kb')
  })

  it('returns empty string when nothing slug-worthy remains', () => {
    expect(slugifyKbName('///')).toBe('')
  })
})

describe('validateKbName', () => {
  it('accepts punctuation that generated artifacts must quote rather than reject', () => {
    expect(validateKbName('Acme: Core KB')).toBe('Acme: Core KB')
    expect(validateKbName('x"; touch /tmp/pwned; #')).toBe('x"; touch /tmp/pwned; #')
  })

  it('rejects a newline (it would inject top-level YAML keys into the workflow)', () => {
    expect(() => validateKbName('Acme\nfoo: bar')).toThrow(/newlines or control characters/)
  })

  it('rejects other control characters', () => {
    expect(() => validateKbName('Acme\u0007KB')).toThrow(/newlines or control characters/)
  })

  it('rejects an empty or blank name', () => {
    expect(() => validateKbName('')).toThrow(/cannot be empty/)
    expect(() => validateKbName('   ')).toThrow(/cannot be empty/)
  })

  it('rejects an absurdly long name', () => {
    expect(() => validateKbName('a'.repeat(101))).toThrow(/100 characters/)
  })
})

describe('resolveKbIdentity', () => {
  it('rejects an unsafe explicit name before anything is generated', () => {
    expect(() => resolveKbIdentity({ name: 'Acme\nKB', targetPath: '/work/acme' })).toThrow(
      /newlines or control characters/,
    )
  })

  it('derives name and slug from the target directory basename', () => {
    expect(resolveKbIdentity({ targetPath: '/work/Acme KB' })).toEqual({
      name: 'acme-kb',
      slug: 'acme-kb',
      skillPrefix: 'acme-kb',
    })
  })

  it('keeps an explicit name and slugifies it for derived fields', () => {
    expect(resolveKbIdentity({ name: 'Acme Standards', targetPath: '/work/whatever' })).toEqual({
      name: 'Acme Standards',
      slug: 'acme-standards',
      skillPrefix: 'acme-standards',
    })
  })

  it('falls back to external-kb when an explicit name yields no slug', () => {
    expect(resolveKbIdentity({ name: '///', targetPath: '/work/acme-kb' })).toEqual({
      name: '///',
      slug: 'external-kb',
      skillPrefix: 'external-kb',
    })
  })

  it('falls back to external-kb when the path yields no slug', () => {
    expect(resolveKbIdentity({ targetPath: '/' })).toEqual({
      name: 'external-kb',
      slug: 'external-kb',
      skillPrefix: 'external-kb',
    })
  })
})
