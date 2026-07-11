import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WORKING_PATH,
  resolveWorkingPathOverride,
  validateWorkingPath,
  isWithinPath,
  pathsOverlap,
} from './working-area'

describe('resolveWorkingPathOverride', () => {
  it('returns the default when no override is configured', () => {
    expect(resolveWorkingPathOverride({})).toBe(DEFAULT_WORKING_PATH)
    expect(resolveWorkingPathOverride(undefined)).toBe(DEFAULT_WORKING_PATH)
  })

  it('returns the override when working_path is a non-empty string', () => {
    expect(resolveWorkingPathOverride({ working_path: '.pair/scratch' })).toBe('.pair/scratch')
  })

  it('falls back to the default for invalid override values', () => {
    expect(resolveWorkingPathOverride({ working_path: '' })).toBe(DEFAULT_WORKING_PATH)
    expect(resolveWorkingPathOverride({ working_path: '   ' })).toBe(DEFAULT_WORKING_PATH)
    expect(resolveWorkingPathOverride({ working_path: 123 })).toBe(DEFAULT_WORKING_PATH)
  })
})

describe('validateWorkingPath', () => {
  it('accepts a project-relative working path', () => {
    expect(validateWorkingPath('.pair/working')).toHaveLength(0)
    expect(validateWorkingPath('.pair/scratch')).toHaveLength(0)
  })

  it('rejects an absolute working path', () => {
    const errors = validateWorkingPath('/var/tmp/working')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('must be project-relative')
  })

  it('rejects a working path that escapes the project root', () => {
    expect(validateWorkingPath('..')).toHaveLength(1)
    expect(validateWorkingPath('../outside')).toHaveLength(1)
  })
})

describe('isWithinPath', () => {
  it('matches an exact path', () => {
    expect(isWithinPath('.pair/working', '.pair/working')).toBe(true)
  })

  it('matches a nested path', () => {
    expect(isWithinPath('.pair/working/checkpoints', '.pair/working')).toBe(true)
  })

  it('does not match a sibling sharing the same string prefix', () => {
    expect(isWithinPath('.pair/working-notes', '.pair/working')).toBe(false)
  })

  it('does not match an unrelated path', () => {
    expect(isWithinPath('.pair/knowledge', '.pair/working')).toBe(false)
  })
})

describe('pathsOverlap', () => {
  it('is true when a contains b', () => {
    expect(pathsOverlap('.pair', '.pair/working')).toBe(true)
  })

  it('is true when b contains a', () => {
    expect(pathsOverlap('.pair/working', '.pair')).toBe(true)
  })

  it('is false for unrelated paths', () => {
    expect(pathsOverlap('.pair/adoption', '.pair/working')).toBe(false)
  })
})

describe('isWithinPath - case sensitivity by platform (D14)', () => {
  it('is case-insensitive on darwin', () => {
    expect(isWithinPath('.pair/Working', '.pair/working', 'darwin')).toBe(true)
  })

  it('is case-insensitive on win32', () => {
    expect(isWithinPath('.pair/Working', '.pair/working', 'win32')).toBe(true)
  })

  it('is case-sensitive on linux', () => {
    expect(isWithinPath('.pair/Working', '.pair/working', 'linux')).toBe(false)
  })
})

describe('pathsOverlap - case sensitivity by platform (D14)', () => {
  it('flags a working_path override differing only in case on darwin', () => {
    expect(pathsOverlap('.pair/Working', '.pair/working', 'darwin')).toBe(true)
  })

  it('flags a working_path override differing only in case on win32', () => {
    expect(pathsOverlap('.pair/Working', '.pair/working', 'win32')).toBe(true)
  })

  it('does not fold case on linux', () => {
    expect(pathsOverlap('.pair/Working', '.pair/working', 'linux')).toBe(false)
  })
})
