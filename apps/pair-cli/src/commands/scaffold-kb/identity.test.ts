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
  // Accepting punctuation is only safe because every generation site quotes it —
  // proven by parsing the generated YAML in templates/yaml-safety.test.ts, not by
  // string-matching (which is what let the seed-skill frontmatter sink slip through).
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

  // Quoting does not fix these: YAML 1.1 parsers (still shipped by some agent runtimes)
  // treat U+0085/U+2028/U+2029 as line breaks, so a quoted scalar containing one is split
  // into a broken document even though the JSON escape looks safe to a YAML 1.2 parser.
  it.each([
    ['U+0085 NEL', 'Acme\u0085foo: bar'],
    ['U+2028 LINE SEPARATOR', 'Acme\u2028foo: bar'],
    ['U+2029 PARAGRAPH SEPARATOR', 'Acme\u2029foo: bar'],
  ])('rejects %s (a line break under YAML 1.1)', (_label, name) => {
    expect(() => validateKbName(name)).toThrow(/newlines or control characters/)
  })

  // Quoting does not fix this either: `${{ ... }}` is evaluated by GitHub Actions BEFORE
  // YAML quoting matters, so the generated workflow fails to parse with an invalid-context
  // error (or, worse, interpolates a context value into the release job).
  it('rejects a GitHub Actions expression (it is evaluated before quoting applies)', () => {
    expect(() => validateKbName('Acme ${{ secrets.GITHUB_TOKEN }} KB')).toThrow(
      /\$\{\{.*GitHub Actions expression/s,
    )
  })

  it('accepts a lone ${ or {{ — only the Actions expression opener is unsafe', () => {
    expect(validateKbName('Acme ${HOME} KB')).toBe('Acme ${HOME} KB')
    expect(validateKbName('Acme {{ mustache }} KB')).toBe('Acme {{ mustache }} KB')
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
