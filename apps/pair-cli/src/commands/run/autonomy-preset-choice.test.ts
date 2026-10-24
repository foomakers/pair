import { describe, it, expect } from 'vitest'
import { settlePresetChoice, withPresetLine, PRESET_PROMPT } from './autonomy-policy'
import type { AutonomyResolution } from './cycle-scripts'

/** US-576 AC5: an empty `## Autonomy` asks the preset once on a TTY, writes it; a non-TTY writes nothing. */

const resolution = (sources: Record<string, string>, translated = {}): AutonomyResolution =>
  ({
    ok: true,
    active: false,
    effective: Object.fromEntries(Object.entries(sources).map(([k, source]) => [k, { value: undefined, source }])),
    policy: {},
    lines: [],
    warnings: [],
    errors: [],
    translated,
  }) as unknown as AutonomyResolution

const UNDECLARED = resolution({ preset: 'default', until: 'default', merge: 'default' })

function harness(answer: string | undefined) {
  const writes: string[] = []
  const logs: string[] = []
  const asked: string[] = []
  let reresolved = 0
  const out = settlePresetChoice({
    resolution: UNDECLARED,
    args: {},
    ask: q => {
      asked.push(q)
      return answer
    },
    readPolicy: () => '# Automation\n\n## Autonomy\n\n## Stop Predicate\n\nmax-iterations: 3\n',
    writePolicy: text => writes.push(text),
    reresolve: () => {
      reresolved += 1
      return resolution({ preset: 'adoption' })
    },
    log: line => logs.push(line),
  })
  return { out, writes, logs, asked, reresolved: () => reresolved }
}

describe('settlePresetChoice', () => {
  it('TTY: asks full / escalate-red / supervised, Enter = supervised, writes `preset:` and re-resolves', () => {
    const h = harness('')
    expect(h.asked).toEqual([PRESET_PROMPT])
    expect(PRESET_PROMPT).toMatch(/full \/ escalate-red \/ supervised/)
    expect(PRESET_PROMPT).toMatch(/Enter = supervised/)
    expect(h.writes).toEqual([
      '# Automation\n\n## Autonomy\n\npreset: supervised\n\n## Stop Predicate\n\nmax-iterations: 3\n',
    ])
    expect(h.reresolved()).toBe(1)
    expect(h.out.effective?.['preset']?.source).toBe('adoption')
  })

  it('TTY: a named answer is written verbatim; an unknown one HALTs listing the choices', () => {
    expect(harness('escalate-red').writes[0]).toContain('preset: escalate-red')
    expect(() => harness('yolo')).toThrow(/full \| escalate-red \| supervised/)
  })

  it('non-TTY: writes nothing, keeps the safe default (supervised behaviour) and prints the command to set it', () => {
    const h = harness(undefined)
    expect(h.writes).toEqual([])
    expect(h.reresolved()).toBe(0)
    expect(h.out).toBe(UNDECLARED)
    expect(h.logs.join('\n')).toMatch(/supervised/)
    expect(h.logs.join('\n')).toMatch(/preset: escalate-red.*## Autonomy|--preset/)
  })

  it('asks nothing when anything is declared or passed (a key, a preset, a legacy section, an argument)', () => {
    for (const r of [
      resolution({ preset: 'default', merge: 'adoption' }),
      resolution({ preset: 'adoption' }),
      resolution({ preset: 'default' }, { filter: { from: '## Eligibility', equivalent: 'filter: x' } }),
    ]) {
      let asked = false
      const out = settlePresetChoice({
        resolution: r,
        args: {},
        ask: () => ((asked = true), ''),
        readPolicy: () => '',
        writePolicy: () => {},
        reresolve: () => r,
        log: () => {},
      })
      expect(asked).toBe(false)
      expect(out).toBe(r)
    }
    let asked = false
    settlePresetChoice({
      resolution: UNDECLARED,
      args: { until: 'pr' },
      ask: () => ((asked = true), ''),
      readPolicy: () => '',
      writePolicy: () => {},
      reresolve: () => UNDECLARED,
      log: () => {},
    })
    expect(asked).toBe(false)
  })
})

describe('withPresetLine', () => {
  it('fills an empty `## Autonomy`, appends the section when absent, creates the file when missing', () => {
    expect(withPresetLine('# A\n\n## Autonomy\n', 'full')).toBe('# A\n\n## Autonomy\n\npreset: full\n')
    expect(withPresetLine('# A\n\n## Max Parallelism\n\n1\n', 'full')).toBe(
      '# A\n\n## Max Parallelism\n\n1\n\n## Autonomy\n\npreset: full\n',
    )
    expect(withPresetLine(undefined, 'supervised')).toBe(
      '# Automation Policy\n\n## Autonomy\n\npreset: supervised\n',
    )
  })
})
