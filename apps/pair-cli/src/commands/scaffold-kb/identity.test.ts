import { describe, it, expect } from 'vitest'
import { resolveKbIdentity, slugifyKbName } from './identity'

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

describe('resolveKbIdentity', () => {
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
