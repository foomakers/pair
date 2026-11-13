import { afterEach, describe, expect, it, vi } from 'vitest'
import { ENGINES } from './engines'
import { buildSelectionPrompt } from './root-select'

/** US-597: the selection prompt (prerequisites resolved by prereq-state) is the same on every platform (darwin, linux). */
describe('buildSelectionPrompt platform independence (US-597)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(['darwin', 'linux'])('is identical on platform %s', platform => {
    const base = buildSelectionPrompt(ENGINES.claude, { root: '66' })
    vi.stubGlobal('process', { ...process, platform })
    expect(buildSelectionPrompt(ENGINES.claude, { root: '66' })).toBe(base)
  })
})
