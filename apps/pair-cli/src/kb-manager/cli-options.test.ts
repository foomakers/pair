import { describe, it, expect } from 'vitest'
import { Command } from 'commander'
import { validateCliOptions } from './cli-options'

describe('CLI Options - --no-kb flag', () => {
  it('should parse --no-kb flag correctly', () => {
    const program = new Command()
    program.option('--no-kb', 'Skip KB download')
    program.parse(['node', 'cli.js', '--no-kb'])

    const opts = program.opts<{ kb: boolean }>()
    expect(opts.kb).toBe(false)
  })

  it('should default kb to true when --no-kb not provided', () => {
    const program = new Command()
    program.option('--no-kb', 'Skip KB download')
    program.parse(['node', 'cli.js'])

    const opts = program.opts<{ kb: boolean }>()
    expect(opts.kb).toBe(true)
  })

  it('should reject conflicting --url and --no-kb flags', () => {
    const program = new Command()
    program.option('--url <url>', 'Custom KB URL')
    program.option('--no-kb', 'Skip KB download')

    // Parse args
    program.parse(['node', 'cli.js', '--url', 'https://example.com/kb.zip', '--no-kb'])

    const opts = program.opts<{ url?: string; kb: boolean }>()
    
    // Validation logic should detect conflict
    const hasConflict = opts.url && opts.kb === false
    expect(hasConflict).toBe(true)
  })

  it('should allow --url without --no-kb', () => {
    const program = new Command()
    program.option('--url <url>', 'Custom KB URL')
    program.option('--no-kb', 'Skip KB download')

    program.parse(['node', 'cli.js', '--url', 'https://example.com/kb.zip'])

    const opts = program.opts<{ url?: string; kb: boolean }>()
    expect(opts.url).toBe('https://example.com/kb.zip')
    expect(opts.kb).toBe(true)
  })

  it('should allow --no-kb without --url', () => {
    const program = new Command()
    program.option('--url <url>', 'Custom KB URL')
    program.option('--no-kb', 'Skip KB download')

    program.parse(['node', 'cli.js', '--no-kb'])

    const opts = program.opts<{ url?: string; kb: boolean }>()
    expect(opts.url).toBeUndefined()
    expect(opts.kb).toBe(false)
  })
})

describe('CLI Options - Validation', () => {
  it('validateCliOptions throws on --url and --no-kb conflict', () => {
    expect(() => {
      validateCliOptions({ url: 'https://example.com/kb.zip', kb: false })
    }).toThrow('Cannot use --url and --no-kb together')
  })

  it('validateCliOptions accepts --url without --no-kb', () => {
    expect(() => {
      validateCliOptions({ url: 'https://example.com/kb.zip', kb: true })
    }).not.toThrow()
  })

  it('validateCliOptions accepts --no-kb without --url', () => {
    expect(() => {
      validateCliOptions({ kb: false })
    }).not.toThrow()
  })

  it('validateCliOptions accepts neither flag', () => {
    expect(() => {
      validateCliOptions({ kb: true })
    }).not.toThrow()
  })
})
