import { describe, it, expect, vi } from 'vitest'

vi.mock('@pair/content-ops', () => ({
  fileSystemService: {
    readFileSync: vi.fn((path: string) => {
      if (path === '/valid.json') return '{"datasetRoot":"/custom"}'
      if (path === '/invalid.json') return 'not json'
      throw new Error(`ENOENT: no such file or directory '${path}'`)
    }),
  },
  validatePathOps: vi.fn(),
}))

import { parseOptions } from './check-broken-links'

describe('parseOptions', () => {
  it('returns undefined for undefined arg', () => {
    expect(parseOptions(undefined)).toBeUndefined()
  })

  it('returns undefined for empty string arg', () => {
    expect(parseOptions('')).toBeUndefined()
  })

  it('parses a valid JSON string', () => {
    const result = parseOptions('{"datasetRoot":"/custom"}')
    expect(result).toEqual({ datasetRoot: '/custom' })
  })

  it('reads and parses a valid JSON file', () => {
    const result = parseOptions('/valid.json')
    expect(result).toEqual({ datasetRoot: '/custom' })
  })

  it('throws on non-existent file with non-JSON string', () => {
    expect(() => parseOptions('/missing.json')).toThrow('Failed to parse options from arg')
  })

  it('throws on file with invalid JSON content', () => {
    expect(() => parseOptions('/invalid.json')).toThrow('Failed to parse options from arg')
  })
})
