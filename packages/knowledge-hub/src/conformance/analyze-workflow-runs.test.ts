import { describe, it, expect } from 'vitest'
import { fileSystemService } from '@pair/content-ops'
import { join } from 'path'

// Conformance guard for story #697 (AC-6, AC-7): the read-only `analyze-workflow-runs` capability.
// The numbers come from its script; the skill comments them and never computes, prices or compares by hand.

const DATASET = join(__dirname, '../../dataset/.skills/capability/analyze-workflow-runs')
const MIRROR = join(__dirname, '../../../../.claude/skills/pair-capability-analyze-workflow-runs')
const SCRIPT = 'scripts/analyze.mjs'

const read = (path: string) => fileSystemService.readFileSync(path)
const norm = (s: string) => s.replace(/[*`_]/g, '').replace(/\s+/g, ' ').toLowerCase()
const script = read(join(DATASET, SCRIPT))
const questions = (/const QUESTIONS = \[([^\]]+)\]/.exec(script)?.[1] ?? '')
  .split(',')
  .map(name => name.trim().replace(/'/g, ''))

describe('analyze-workflow-runs — skill contract (#697)', () => {
  it('ships its script byte-identical in the installed skill', () => {
    expect(read(join(MIRROR, SCRIPT))).toBe(script)
  })

  for (const [label, dir] of [
    ['dataset', DATASET],
    ['mirror', MIRROR],
  ] as const) {
    const content = read(join(dir, 'SKILL.md'))
    const lower = norm(content)

    it(`${label} documents the status migration and optional report`, () => {
      expect(lower).toContain('read-only after migration')
      expect(content).toContain('telemetry.jsonl')
      expect(lower).toContain('rewrites legacy step statuses from needs-human to needs-decision')
      expect(content).toContain('.pair/working/reports/workflow-runs/')
    })

    it(`${label} takes every number from the script and asks exactly the questions it answers`, () => {
      expect(content).toContain(SCRIPT)
      expect(lower).toContain('never computes')
      expect(questions).toEqual(['cost', 'time', 'passes', 'compare', 'trend'])
      const asked = [...content.matchAll(/^\| `([a-z]+)` +\|/gm)].map(match => match[1])
      expect(asked).toEqual(questions)
    })

    it(`${label} shows each number with its origin and never compares measured with estimated`, () => {
      for (const source of ['measured', 'estimated', 'unknown']) expect(lower).toContain(source)
      expect(lower).toContain('refused')
      expect(lower).toContain('lower bound')
    })

    it(`${label} reports tokens and "not calculated" without a price, never an invented cost`, () => {
      expect(content).toContain('"not calculated"')
      expect(lower).toMatch(/never invented(,)? (or )?downloaded/)
    })

    it(`${label} names no \`pair telemetry\` command: the new path has none`, () => {
      expect(content).not.toMatch(/pair(-cli)? telemetry/)
    })
  }
})
