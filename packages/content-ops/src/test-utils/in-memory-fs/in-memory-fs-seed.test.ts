import { describe, it, expect } from 'vitest'
import { InMemoryFsState } from './in-memory-fs-state'
import { seedState } from './in-memory-fs-seed'
import { DEFAULT_DIR } from './test-fixtures'

describe('seedState', () => {
  it('should load initial files', () => {
    const state = new InMemoryFsState(DEFAULT_DIR, DEFAULT_DIR)
    seedState(state, { '/test.txt': 'content' }, DEFAULT_DIR, DEFAULT_DIR)

    expect(state.files.get('/test.txt')).toBe('content')
    expect(state.dirs.has('/test.txt')).toBe(false)
  })

  it('should create parent directories for initial files', () => {
    const state = new InMemoryFsState(DEFAULT_DIR, DEFAULT_DIR)
    seedState(state, { '/deep/nested/file.txt': 'content' }, DEFAULT_DIR, DEFAULT_DIR)

    expect(state.dirs.has('/deep')).toBe(true)
    expect(state.dirs.has('/deep/nested')).toBe(true)
    expect(state.files.get('/deep/nested/file.txt')).toBe('content')
  })

  it('should register the root, moduleDirectory and workingDirectory', () => {
    const state = new InMemoryFsState(DEFAULT_DIR, DEFAULT_DIR)
    seedState(state, {}, DEFAULT_DIR, DEFAULT_DIR)

    expect(state.dirs.has('/')).toBe(true)
    expect(state.dirs.has(DEFAULT_DIR)).toBe(true)
  })

  it('should handle a non-existent moduleDirectory without throwing', () => {
    const state = new InMemoryFsState('/nonexistent', DEFAULT_DIR)
    expect(() => seedState(state, {}, '/nonexistent', DEFAULT_DIR)).not.toThrow()
    expect(state.dirs.has('/nonexistent')).toBe(true)
  })

  it('should handle a non-existent workingDirectory without throwing', () => {
    const state = new InMemoryFsState(DEFAULT_DIR, '/nonexistent')
    expect(() => seedState(state, {}, DEFAULT_DIR, '/nonexistent')).not.toThrow()
    expect(state.dirs.has('/nonexistent')).toBe(true)
  })
})
