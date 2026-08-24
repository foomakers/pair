import { describe, it, expect } from 'vitest'
import { resolveEngine, describeEngineResolution, assertEngineAvailable } from './resolve-engine'
import { DEFAULT_ENGINE_ID } from './engines'

describe('resolveEngine', () => {
  it('falls back to the schema default when nothing names an engine (AC12)', () => {
    const resolved = resolveEngine({})

    expect(resolved.engine.id).toBe(DEFAULT_ENGINE_ID)
    expect(resolved.source).toBe('schema default')
  })

  it('prefers pair.config.json over the schema default', () => {
    const resolved = resolveEngine({ declared: 'opencode' })

    expect(resolved.engine.id).toBe('opencode')
    expect(resolved.source).toBe('pair.config.json')
  })

  it('prefers --engine over pair.config.json', () => {
    const resolved = resolveEngine({ flag: 'pi', declared: 'opencode' })

    expect(resolved.engine.id).toBe('pi')
    expect(resolved.source).toBe('--engine')
  })

  it('prefers --engine over the schema default', () => {
    const resolved = resolveEngine({ flag: 'opencode' })

    expect(resolved.source).toBe('--engine')
  })

  it('exposes the command line that will actually be spawned', () => {
    expect(resolveEngine({ flag: 'opencode' }).commandLine).toBe('opencode run --format json')
    expect(resolveEngine({ flag: 'pi' }).commandLine).toBe('pi --mode json')
  })
})

describe('describeEngineResolution', () => {
  it('names the winning level in the printed line (AC1)', () => {
    expect(describeEngineResolution(resolveEngine({ flag: 'pi' }))).toBe(
      'Engine: pi — `pi --mode json` (from --engine)',
    )
    expect(describeEngineResolution(resolveEngine({ declared: 'pi' }))).toBe(
      'Engine: pi — `pi --mode json` (from pair.config.json)',
    )
    expect(describeEngineResolution(resolveEngine({}))).toContain('(from schema default)')
  })
})

describe('assertEngineAvailable', () => {
  it('passes when the executable is on PATH', () => {
    expect(() => assertEngineAvailable(resolveEngine({ flag: 'pi' }), () => true)).not.toThrow()
  })

  it('names the resolved command and where it came from when it is missing', () => {
    expect(() => assertEngineAvailable(resolveEngine({ declared: 'pi' }), () => false)).toThrow(
      /`pi` could not be found \(resolved from pair\.config\.json\)/,
    )
  })

  it('probes the resolved command, not the engine id', () => {
    const probed: string[] = []
    assertEngineAvailable(resolveEngine({ flag: 'claude' }), command => {
      probed.push(command)
      return true
    })

    expect(probed).toEqual(['claude'])
  })
})
