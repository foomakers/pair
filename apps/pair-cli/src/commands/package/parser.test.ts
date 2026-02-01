import { describe, it, expect } from 'vitest'
import { parsePackageCommand } from './parser'

describe('parsePackageCommand', () => {
  it('creates PackageCommandConfig with defaults', () => {
    const config = parsePackageCommand({})

    expect(config).toEqual({
      command: 'package',
    })
  })

  it('creates config with output path', () => {
    const config = parsePackageCommand({
      output: 'dist/kb.zip',
    })

    expect(config.output).toBe('dist/kb.zip')
  })

  it('creates config with source directory', () => {
    const config = parsePackageCommand({
      sourceDir: './kb-content',
    })

    expect(config.sourceDir).toBe('./kb-content')
  })

  it('creates config with metadata', () => {
    const config = parsePackageCommand({
      name: 'My KB',
      version: '1.0.0',
      description: 'Test KB',
      author: 'Test Author',
    })

    expect(config.name).toBe('My KB')
    expect(config.version).toBe('1.0.0')
    expect(config.description).toBe('Test KB')
    expect(config.author).toBe('Test Author')
  })

  it('throws when positional args provided', () => {
    expect(() => parsePackageCommand({}, ['pos'])).toThrow(
      "Command 'package' does not accept positional arguments: pos",
    )
  })
})
