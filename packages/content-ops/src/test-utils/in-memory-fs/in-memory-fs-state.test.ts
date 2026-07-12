import { describe, it, expect } from 'vitest'
import { InMemoryFsState } from './in-memory-fs-state'

describe('InMemoryFsState - resolvePath', () => {
  it('should return absolute paths unchanged', () => {
    const state = new InMemoryFsState('/app', '/app')
    expect(state.resolvePath('/absolute/path')).toBe('/absolute/path')
  })

  it('should resolve relative paths against working directory', () => {
    const state = new InMemoryFsState('/app', '/app')
    expect(state.resolvePath('relative/path')).toBe('/app/relative/path')
    expect(state.resolvePath('./relative/path')).toBe('/app/relative/path')
    expect(state.resolvePath('../parent/path')).toBe('/parent/path')
  })

  it('should resolve relative paths against a custom working directory', () => {
    const state = new InMemoryFsState('/custom/module', '/custom/work')
    expect(state.resolvePath('file.txt')).toBe('/custom/work/file.txt')
    expect(state.resolvePath('../file.txt')).toBe('/custom/file.txt')
    expect(state.resolvePath('dir/../file.txt')).toBe('/custom/work/file.txt')
    expect(state.resolvePath('/absolute/file.txt')).toBe('/absolute/file.txt')
  })
})
