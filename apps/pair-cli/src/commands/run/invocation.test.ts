import { describe, it, expect } from 'vitest'
import { buildSkillArgs, buildPromptText, skillAcceptsFilter, SKILL_PARAMETERS } from './invocation'
import { ENGINES } from './engines'

describe('buildSkillArgs', () => {
  it('passes pair-loop only the parameters pair-loop declares', () => {
    const args = buildSkillArgs('pair-loop', {
      root: '212',
      filter: 'risk:green',
      predicate: 'Done',
      iteration: 3,
    })

    // No --filter: pair-loop reads eligibility from tech/automation.md itself (AC8).
    expect(args).toEqual(['--root', '212', '--predicate', 'Done', '--iteration', '3'])
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

  it('quotes a multi-word borrowed value, as the skill documents it (round 1, finding 2)', () => {
    // `pair-loop`'s SKILL.md renders the argument as `--predicate "<text>"`, and the workflow
    // behind it validates the predicate BY CONTENT before any agent starts — so an unquoted
    // multi-word value is either rejected or read as a DIFFERENT predicate on an unattended run.
    expect(
      buildSkillArgs('pair-loop', { root: '212', predicate: 'tag:risk:red ⇒ Done', iteration: 1 }),
    ).toEqual(['--root', '212', '--predicate', '"tag:risk:red ⇒ Done"', '--iteration', '1'])
  })

  it('quotes a label whose name contains spaces', () => {
    expect(buildSkillArgs('pair-next', { filter: 'good first issue' })).toEqual([
      '--filter',
      '"good first issue"',
    ])
  })

  it('escapes an embedded quote rather than closing the value early', () => {
    expect(buildSkillArgs('pair-next', { filter: 'say "hi" now' })).toEqual([
      '--filter',
      '"say \\"hi\\" now"',
    ])
  })

  it('leaves a single-token value unquoted', () => {
    expect(buildSkillArgs('pair-next', { root: '212', filter: 'risk:green' })).toEqual([
      '--root',
      '212',
      '--filter',
      'risk:green',
    ])
  })
})

describe('skillAcceptsFilter', () => {
  it('is true only for an invocation that can carry --filter (round 1, finding 1)', () => {
    expect(skillAcceptsFilter({ kind: 'skill', name: 'pair-next', source: 'cascade' })).toBe(true)
    expect(skillAcceptsFilter({ kind: 'skill', name: 'pair-loop', source: 'cascade' })).toBe(false)
    // An unknown skill gets the frozen pair-next scoping parameters, so it does accept one.
    expect(skillAcceptsFilter({ kind: 'skill', name: 'my-skill', source: '--skill' })).toBe(true)
    // A verbatim prompt carries no parameters at all.
    expect(skillAcceptsFilter({ kind: 'prompt', text: 'go' })).toBe(false)
  })
})

describe('buildPromptText', () => {
  it('renders a slash invocation for an engine that speaks slash commands', () => {
    expect(
      buildPromptText(
        ENGINES.claude,
        { kind: 'skill', name: 'pair-loop', source: 'cascade' },
        { root: '212' },
      ),
    ).toBe('/pair-loop --root 212')
  })

  it('keeps a quoted multi-word argument intact in the rendered prompt', () => {
    expect(
      buildPromptText(
        ENGINES.claude,
        { kind: 'skill', name: 'pair-loop', source: 'cascade' },
        { root: '212', predicate: 'tag:risk:red ⇒ Done', iteration: 1 },
      ),
    ).toBe('/pair-loop --root 212 --predicate "tag:risk:red ⇒ Done" --iteration 1')
  })

  it('renders a portable instruction for an engine without slash syntax', () => {
    expect(
      buildPromptText(
        ENGINES.pi,
        { kind: 'skill', name: 'pair-next', source: 'cascade-fallback' },
        { filter: 'risk:green' },
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
