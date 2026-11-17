import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// US-667 review r0-1 (AC-2, AC-3) — a card carried skills-only never gets a card record with its
// true outcome unless the step that OBSERVES the final state documents `pair-cli telemetry card`.
// Producers: review-phase (converged / conclude) and the in-session cycle (done / parked / merged),
// each as dataset source + installed mirror. implement-phase and green-fix never observe a final
// state: they keep recording steps only (`telemetry step`).

const REPO_ROOT = join(__dirname, '../../../..')
const DATASET = join(__dirname, '../../dataset')

const paths = (name: string, installed: string) => ({
  dataset: join(DATASET, `.skills/workflow/${name}/SKILL.md`),
  installed: join(REPO_ROOT, `.claude/skills/${installed}/SKILL.md`),
})

const review = paths('review-phase', 'pair-workflow-review-phase')
const cycle = paths('cycle', 'pair-workflow-cycle')
const stages = [
  paths('implement-phase', 'pair-workflow-implement-phase'),
  paths('green-fix', 'pair-workflow-green-fix'),
]

/** Blank-line delimited paragraphs / list items whose text calls `pair-cli telemetry card`. */
const cardCalls = (doc: string): string[] =>
  doc.split(/\n\s*\n|\n(?=[-*\d])/).filter(p => /telemetry card\b/.test(p))

describe.each([
  ['review-phase', review, ['review-approved']],
  ['cycle', cycle, ['review-approved', 'merged', 'parked']],
] as const)('r0-1: %s documents the card final-state record', (_n, files, outcomes) => {
  describe.each(Object.entries(files))('%s', (_k, path) => {
    const calls = cardCalls(readFileSync(path, 'utf-8'))

    it('w1: the final-state step runs `telemetry card` with --card, --pr, --outcome and --end', () => {
      const call = calls.find(c =>
        ['--card', '--pr', '--outcome', '--end'].every(f => c.includes(f)),
      )
      expect(call).toBeDefined()
    })

    it('w2: the call names the true final outcomes of this step', () => {
      const text = calls.join('\n')
      for (const o of outcomes) expect(text).toContain(o)
    })

    it('w3: the call is gated on telemetry being enabled and a write problem is a warning', () => {
      const call = calls.find(c => c.includes('--outcome')) ?? ''
      expect(call).toMatch(/telemetry is enabled|## Telemetry/)
      expect(call).toMatch(/warning/i)
    })

    // r1-5 (AC-2, AC-3): under `pair run` the driver writes the card record; a skill-written
    // manual card would duplicate it with false provenance, so it is gated on in-session carriage.
    it('w4: the call is gated on in-session carriage (no `pair run` driver records it)', () => {
      const call = calls.find(c => c.includes('--outcome')) ?? ''
      expect(call).toMatch(/in-session/)
    })
  })
})

describe.each([...stages.flatMap(s => Object.entries(s))])(
  'c1: %s stage keeps step records only',
  (_k, path) => {
    it('control: records `telemetry step` and never claims the card final state', () => {
      const doc = readFileSync(path, 'utf-8')
      expect(doc).toMatch(/telemetry step\b/)
      expect(cardCalls(doc)).toEqual([])
    })
  },
)
