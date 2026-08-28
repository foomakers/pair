import { describe, it, expect } from 'vitest'
import {
  resolveInvocation,
  describeSkillResolution,
  PREFERRED_SKILL,
  FALLBACK_SKILL,
} from './resolve-skill'

const installed =
  (...names: string[]) =>
  (name: string) =>
    names.includes(name)

describe('resolveInvocation', () => {
  it('invokes pair-loop when it is installed', () => {
    const resolved = resolveInvocation(
      { kind: 'skill' },
      installed(PREFERRED_SKILL, FALLBACK_SKILL),
    )

    expect(resolved).toEqual({ kind: 'skill', name: 'pair-loop', source: 'cascade' })
  })

  it('falls back to pair-next when pair-loop is absent, and says so', () => {
    const resolved = resolveInvocation({ kind: 'skill' }, installed(FALLBACK_SKILL))

    expect(resolved).toEqual({ kind: 'skill', name: 'pair-next', source: 'cascade-fallback' })
    expect(describeSkillResolution(resolved)).toContain('pair-loop not installed, falling back')
  })

  it('honours an explicit --skill with no fallback', () => {
    const resolved = resolveInvocation(
      { kind: 'skill', name: 'pair-next' },
      installed(PREFERRED_SKILL, FALLBACK_SKILL),
    )

    expect(resolved).toEqual({ kind: 'skill', name: 'pair-next', source: '--skill' })
  })

  it('fails on an explicit --skill that is not installed, never falling back', () => {
    expect(() =>
      resolveInvocation({ kind: 'skill', name: 'pair-loop' }, installed(FALLBACK_SKILL)),
    ).toThrow(/Skill 'pair-loop' is not installed \(--skill never falls back\)/)
  })

  it('fails when neither cascade skill is installed', () => {
    expect(() => resolveInvocation({ kind: 'skill' }, installed())).toThrow(
      /Neither pair-loop nor pair-next is installed/,
    )
  })

  it('passes a --prompt through without probing any skill', () => {
    const probed: string[] = []
    const resolved = resolveInvocation({ kind: 'prompt', text: 'do the thing' }, name => {
      probed.push(name)
      return true
    })

    expect(resolved).toEqual({ kind: 'prompt', text: 'do the thing' })
    expect(probed).toEqual([])
    expect(describeSkillResolution(resolved)).toContain('verbatim, no skill resolution')
  })
})
