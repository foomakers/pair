import { describe, it, expect } from 'vitest'
import { buildSkillArgs, buildPromptText, SKILL_PARAMETERS } from './invocation'
import { ENGINES } from './engines'

describe('buildSkillArgs', () => {
  it('passes pair-loop only the parameters pair-loop declares', () => {
    const args = buildSkillArgs('pair-loop', {
      root: '212',
      filter: 'risk:green',
      predicate: 'tag:risk:red ⇒ Done',
      iteration: 3,
    })

    // No --filter: pair-loop reads eligibility from tech/automation.md itself (AC8).
    expect(args).toEqual([
      '--root',
      '212',
      '--predicate',
      'tag:risk:red ⇒ Done',
      '--iteration',
      '3',
    ])
  })

  it('passes pair-next only the parameters pair-next declares', () => {
    const args = buildSkillArgs('pair-next', {
      root: '212',
      filter: 'risk:green',
      predicate: 'ignored',
      iteration: 2,
    })

    expect(args).toEqual(['--root', '212', '--filter', 'risk:green'])
  })

  it('gives an unknown skill the frozen scoping parameters and nothing else', () => {
    const args = buildSkillArgs('my-skill', { root: '212', filter: 'risk:green', iteration: 4 })

    expect(args).toEqual(['--root', '212', '--filter', 'risk:green'])
  })

  it('declares no parameter the skills do not own (anti-drift, AC8)', () => {
    const declared = Object.values(SKILL_PARAMETERS).flatMap(map => Object.values(map))

    expect([...new Set(declared)].sort()).toEqual([
      '--filter',
      '--iteration',
      '--predicate',
      '--root',
    ])
  })
})

describe('buildPromptText', () => {
  it('renders a slash invocation for an engine that speaks slash commands', () => {
    expect(
      buildPromptText(
        ENGINES.claude,
        { kind: 'skill', name: 'pair-loop', source: 'cascade' },
        {
          root: '212',
        },
      ),
    ).toBe('/pair-loop --root 212')
  })

  it('renders a portable instruction for an engine without slash syntax', () => {
    expect(
      buildPromptText(
        ENGINES.pi,
        { kind: 'skill', name: 'pair-next', source: 'cascade-fallback' },
        {
          filter: 'risk:green',
        },
      ),
    ).toBe('Run the pair-next skill with these arguments: --filter risk:green')
  })

  it('passes a --prompt through verbatim, on every engine', () => {
    for (const engine of Object.values(ENGINES)) {
      expect(buildPromptText(engine, { kind: 'prompt', text: 'ship it' }, { root: '212' })).toBe(
        'ship it',
      )
    }
  })
})
