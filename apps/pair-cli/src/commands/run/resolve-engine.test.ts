import { describe, it, expect } from 'vitest'
import { resolveEngine, describeEngineResolution, assertEngineAvailable } from './resolve-engine'
import { DEFAULT_ENGINE_ID, ENGINE_IDS, ENGINES } from './engines'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createExecutableProbe } from './path-probe'

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

/**
 * US-503 AC4 — `pair-cli run --engine pi` with no `pi` anywhere names the setup skill.
 *
 * Hermetic: the PATH holds no engine directory at all (an empty list of directories), the
 * filesystem is in memory, and the repository has no `node_modules/.bin` — so every level of
 * the lookup cascade answers "not here" for real, through the real probe.
 */
describe('assertEngineAvailable — engine missing everywhere (US-503 AC4)', () => {
  const repoRoot = '/project'
  const emptyFs = () => new InMemoryFileSystemService({}, repoRoot, repoRoot)
  const noEnginePath = (fs: InMemoryFileSystemService) =>
    createExecutableProbe(fs, { PATH: '' }, 'darwin')
  const SETUP = /\/pair-capability-setup-harness` with `\$harness: pi`/

  it('points the pi refusal at the setup skill, on the lookup path `run --card` uses', () => {
    const fs = emptyFs()
    expect(() =>
      assertEngineAvailable(resolveEngine({ flag: 'pi' }), noEnginePath(fs), { fs, repoRoot }),
    ).toThrow(SETUP)
  })

  it('points the pi refusal at the setup skill, on the PATH-only path `run --root` uses', () => {
    expect(() =>
      assertEngineAvailable(resolveEngine({ flag: 'pi' }), noEnginePath(emptyFs())),
    ).toThrow(SETUP)
  })

  const platforms = ['darwin', 'linux', 'win32']
  it.each(platforms)(
    'names the setup skill whatever the injected platform (%s), PATH with no engine directory',
    platform => {
      const fs = emptyFs()
      const probe = createExecutableProbe(fs, { PATH: '', PATHEXT: '.CMD' }, platform)
      expect(() =>
        assertEngineAvailable(resolveEngine({ flag: 'pi' }), probe, { fs, repoRoot }),
      ).toThrow(SETUP)
    },
  )

  it("keeps every other engine's refusal free of a pi setup hint", () => {
    for (const id of ENGINE_IDS.filter(e => e !== 'pi')) {
      const fs = emptyFs()
      let message = ''
      try {
        assertEngineAvailable(resolveEngine({ flag: id }), noEnginePath(fs), { fs, repoRoot })
      } catch (error) {
        message = (error as Error).message
      }
      expect(message).toContain(`\`${ENGINES[id].command}\``)
      expect(message).not.toMatch(/setup-harness/)
    }
  })
})
