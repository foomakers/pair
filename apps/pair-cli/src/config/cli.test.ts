import { describe, it, expect } from 'vitest'
import { namedSource, parseTargetAndSource, validateCommandOptions } from './cli'

describe('cli config - parsing', () => {
  it('parseTargetAndSource returns nulls for missing args', () => {
    expect(parseTargetAndSource(undefined)).toEqual({ target: null, source: null })
    expect(parseTargetAndSource([])).toEqual({ target: null, source: null })
  })

  it('parseTargetAndSource parses target and source', () => {
    const args = ['--foo', '--target', 'out/path', '--source', 'in/path']
    expect(parseTargetAndSource(args)).toEqual({ target: 'out/path', source: 'in/path' })
  })
})

describe('cli config - validation', () => {
  it('validateCommandOptions allows offline with local source', () => {
    expect(() => {
      validateCommandOptions('install', {
        source: '/local/kb',
        offline: true,
      })
    }).not.toThrow()
  })

  it('validateCommandOptions throws when offline without source', () => {
    expect(() => {
      validateCommandOptions('install', { offline: true })
    }).toThrow('Offline mode requires explicit --source with local path')
  })

  it('validateCommandOptions throws when source is empty', () => {
    expect(() => {
      validateCommandOptions('install', { source: '' })
    }).toThrow('Source path/URL cannot be empty')
  })

  it('validateCommandOptions throws when offline with remote URL', () => {
    expect(() => {
      validateCommandOptions('install', { source: 'https://example.com/kb.zip', offline: true })
    }).toThrow('Cannot use --offline with remote URL source')
  })

  it('validateCommandOptions throws when offline with git URL', () => {
    expect(() => {
      validateCommandOptions('install', { source: 'git@github.com:org/repo.git', offline: true })
    }).toThrow('Cannot use --offline with git repository source')
  })

  it('validateCommandOptions throws when offline with HTTPS .git URL', () => {
    expect(() => {
      validateCommandOptions('install', {
        source: 'https://github.com/org/repo.git',
        offline: true,
      })
    }).toThrow('Cannot use --offline with git repository source')
  })
})

/**
 * US-395 review round 12: the program-level `--url` names a source, so it must reach the
 * SAME resolution the command's own `--source` reaches. It used to work by side effect
 * (bootstrap wrote the custom archive into the official KB's slot, which default resolution
 * then served); source-identity keying ended that, and without this rule `--url` resolves
 * nothing at all.
 */
describe('cli config - namedSource (the source a command must resolve)', () => {
  it('returns the command --source when given', () => {
    expect(namedSource({ source: '/local/kb' })).toBe('/local/kb')
  })

  it('falls back to the program-level --url when the command names no source', () => {
    expect(namedSource({ url: 'https://mirror.internal/kb.zip' })).toBe(
      'https://mirror.internal/kb.zip',
    )
  })

  it('lets an explicit --source outrank --url (the more specific flag wins)', () => {
    expect(namedSource({ source: '/local/kb', url: 'https://mirror.internal/kb.zip' })).toBe(
      '/local/kb',
    )
  })

  it('keeps an empty --source empty so its validation error still fires', () => {
    expect(namedSource({ source: '', url: 'https://mirror.internal/kb.zip' })).toBe('')
  })

  it('ignores an empty --url', () => {
    expect(namedSource({ url: '' })).toBeUndefined()
  })

  it('returns undefined when neither is given', () => {
    expect(namedSource({})).toBeUndefined()
  })
})
