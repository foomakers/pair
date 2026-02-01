import { describe, it, expect } from 'vitest'
import { parseUpdateLinkCommand } from './parser'

describe('parseUpdateLinkCommand', () => {
  it('creates UpdateLinkCommandConfig with default options', () => {
    const config = parseUpdateLinkCommand({})

    expect(config).toEqual({
      command: 'update-link',
      dryRun: false,
    })
  })

  it('creates config with dry-run mode', () => {
    const config = parseUpdateLinkCommand({ dryRun: true })

    expect(config.dryRun).toBe(true)
  })

  it('creates config with log level option', () => {
    const config = parseUpdateLinkCommand({ logLevel: 'debug' })

    expect(config.logLevel).toBe('debug')
  })

  it('creates config with url option', () => {
    const config = parseUpdateLinkCommand({
      url: 'https://example.com/kb.zip',
    })

    expect(config).toEqual({
      command: 'update-link',
      url: 'https://example.com/kb.zip',
      dryRun: false,
    })
  })
})
