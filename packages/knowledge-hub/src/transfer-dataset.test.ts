import { describe, it, expect, vi } from 'vitest'

vi.mock('@pair/content-ops', () => ({
  fileSystemService: {
    readFileSync: vi.fn((path: string) => {
      if (path === '/valid.json') return '{"defaultBehavior":"mirror"}'
      if (path === '/invalid.json') return 'not json'
      throw new Error(`ENOENT: no such file or directory '${path}'`)
    }),
  },
  movePathOps: vi.fn(),
  copyPathOps: vi.fn(),
}))

import { parseJson, parseOptions } from './transfer-dataset'

describe('parseJson', () => {
  it('parses a valid JSON string', () => {
    const result = parseJson('{"key":"value"}')
    expect(result).toEqual({ key: 'value' })
  })

  it('reads and parses a valid JSON file', () => {
    const result = parseJson('/valid.json')
    expect(result).toEqual({ defaultBehavior: 'mirror' })
  })

  it('throws on non-existent file with non-JSON string', () => {
    expect(() => parseJson('/missing.json')).toThrow('ENOENT')
  })

  it('throws on file with invalid JSON content', () => {
    expect(() => parseJson('/invalid.json')).toThrow()
  })
})

describe('parseOptions', () => {
  it('returns undefined for undefined arg', () => {
    expect(parseOptions(undefined)).toBeUndefined()
  })

  it('returns undefined for empty string arg', () => {
    expect(parseOptions('')).toBeUndefined()
  })

  it('parses JSON string with flatten and targets', () => {
    const result = parseOptions(
      '{"defaultBehavior":"mirror","flatten":true,"targets":[{"path":".claude/skills/","mode":"canonical"}]}',
    )
    expect(result).toBeDefined()
    expect(result!.flatten).toBe(true)
    expect(result!.targets).toHaveLength(1)
  })

  it('defaults flatten to false when not provided', () => {
    const result = parseOptions('{"defaultBehavior":"overwrite"}')
    expect(result).toBeDefined()
    expect(result!.flatten).toBe(false)
  })

  it('defaults targets to empty array when not provided', () => {
    const result = parseOptions('{"defaultBehavior":"overwrite"}')
    expect(result).toBeDefined()
    expect(result!.targets).toEqual([])
  })

  it('preserves prefix when provided as string', () => {
    const result = parseOptions('{"prefix":"pair"}')
    expect(result).toBeDefined()
    expect(result!.prefix).toBe('pair')
  })

  it('omits prefix when not a string', () => {
    const result = parseOptions('{"prefix":123}')
    expect(result).toBeDefined()
    expect(result!.prefix).toBeUndefined()
  })

  it('throws on invalid input that is not JSON and not a valid file', () => {
    expect(() => parseOptions('/nonexistent/path.json')).toThrow('Failed to parse options from arg')
  })
})
