import { describe, it, expect } from 'vitest'
import { parseTargetAndSource, validateCommandOptions } from './cli'

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
})
