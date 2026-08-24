import { describe, it, expect } from 'vitest'
import { ENGINES, ENGINE_IDS, DEFAULT_ENGINE_ID, isEngineId } from './engines'

describe('the engine map', () => {
  it('defines exactly the declared engine ids', () => {
    expect(Object.keys(ENGINES)).toEqual([...ENGINE_IDS])
  })

  it('is frozen — the map is data, not mutable state', () => {
    expect(Object.isFrozen(ENGINES)).toBe(true)
  })

  it.each([...ENGINE_IDS])('%s declares a complete entry', id => {
    const engine = ENGINES[id]

    expect(engine.id).toBe(id)
    expect(engine.command.length).toBeGreaterThan(0)
    // Headless + machine-readable output is what makes an engine drivable at all.
    expect(engine.headlessArgs.length).toBeGreaterThan(0)
    expect(['slash', 'instruction']).toContain(engine.skillInvocationStyle)
    expect(['flag', 'always-on']).toContain(engine.autonomy.kind)
    expect(['headless-implicit', 'none', 'provisioned']).toContain(engine.projectTrust.kind)
    // An entry with no rule would make every iteration fail-closed; the map must state one.
    expect(engine.terminalEvents.length).toBeGreaterThan(0)
    expect(engine.verifiedAgainst.length).toBeGreaterThan(0)
  })

  it('defaults to an engine that exists in the map', () => {
    expect(ENGINES[DEFAULT_ENGINE_ID]).toBeDefined()
  })

  it('recognises only known engine ids', () => {
    expect(isEngineId('pi')).toBe(true)
    expect(isEngineId('cursor')).toBe(false)
    expect(isEngineId(undefined)).toBe(false)
  })
})
