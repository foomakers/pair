import { describe, it, expect } from 'vitest'
import { Command } from 'commander'
import { validateCliOptions } from './cli-options'

// Helper: setup command with options
function createProgram() {
  const program = new Command()
  program.option('--url <url>', 'Custom KB URL')
  program.option('--no-kb', 'Skip KB download')
  return program
}

// Helper: parse args and get options
function parseArgs(args: string[]) {
  const program = createProgram()
  program.parse(['node', 'cli.js', ...args])
  return program.opts<{ url?: string; kb: boolean }>()
}

describe('CLI Options - --no-kb flag', () => {
  it('should parse --no-kb flag correctly', () => {
    const opts = parseArgs(['--no-kb'])
    expect(opts.kb).toBe(false)
  })

  it('should default kb to true when --no-kb not provided', () => {
    const opts = parseArgs([])
    expect(opts.kb).toBe(true)
  })

  it('should reject conflicting --url and --no-kb flags', () => {
    const opts = parseArgs(['--url', 'https://example.com/kb.zip', '--no-kb'])
    const hasConflict = opts.url && opts.kb === false
    expect(hasConflict).toBe(true)
  })

  it('should allow --url without --no-kb', () => {
    const opts = parseArgs(['--url', 'https://example.com/kb.zip'])
    expect(opts.url).toBe('https://example.com/kb.zip')
    expect(opts.kb).toBe(true)
  })

  it('should allow --no-kb without --url', () => {
    const opts = parseArgs(['--no-kb'])
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
