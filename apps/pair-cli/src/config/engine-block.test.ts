import { describe, it, expect } from 'vitest'
import { readEngineDeclaration } from './engine-block'

const KNOWN = ['pi', 'opencode', 'claude'] as const

describe('readEngineDeclaration', () => {
  it('reports nothing when the block is absent (delta-only, never a warning)', () => {
    expect(readEngineDeclaration({ asset_registries: {} }, KNOWN)).toEqual({ errors: [] })
  })

  it('reports nothing for a config that is not even an object', () => {
    expect(readEngineDeclaration(undefined, KNOWN)).toEqual({ errors: [] })
    expect(readEngineDeclaration('nope', KNOWN)).toEqual({ errors: [] })
  })

  it('reads a valid declaration', () => {
    expect(readEngineDeclaration({ engine: { id: 'pi' } }, KNOWN)).toEqual({
      engine: 'pi',
      errors: [],
    })
  })

  it('rejects a non-object block', () => {
    expect(readEngineDeclaration({ engine: 'pi' }, KNOWN).errors).toEqual([
      'engine: must be an object, e.g. {"engine": {"id": "pi"}}',
    ])
    expect(readEngineDeclaration({ engine: ['pi'] }, KNOWN).errors).toHaveLength(1)
  })

  it('rejects an unknown engine id rather than dropping to the default', () => {
    const outcome = readEngineDeclaration({ engine: { id: 'opencde' } }, KNOWN)

    expect(outcome.engine).toBeUndefined()
    expect(outcome.errors).toEqual([
      "engine.id: unknown engine 'opencde' (supported: pi, opencode, claude)",
    ])
  })

  it('rejects a missing or empty id', () => {
    expect(readEngineDeclaration({ engine: {} }, KNOWN).errors).toEqual([
      'engine.id: must be a non-empty string',
    ])
    expect(readEngineDeclaration({ engine: { id: '  ' } }, KNOWN).errors).toHaveLength(1)
  })

  it('rejects unknown fields — nothing unrecognised reaches a spawn', () => {
    const outcome = readEngineDeclaration(
      { engine: { id: 'pi', args: ['--dangerously-skip-permissions'] } },
      KNOWN,
    )

    expect(outcome.engine).toBeUndefined()
    expect(outcome.errors).toEqual(['engine: unknown field(s) args'])
  })
})
