/**
 * Conformance guard for story #523 / ADR-027 — autonomous prepare without a silent
 * bypass of R3.11.
 *
 * `/pair-process-refine-story` and `/pair-process-plan-tasks` honour `$approval`
 * (ADR-021). Phase 0 of refine-story (the grill sync) is a judgement gate: it stays
 * `kind=gate; auto=halt` and lifts ONLY when a caller passes BOTH `$approval: auto`
 * AND `$prepare: never|when`. `$approval: auto` alone still halts.
 *
 * These skills are outside `APPROVAL_SIGNAL_FAMILIES` (assess-/map-), so the gate
 * does not see them; this file applies the same detector (`findApprovalRounds`,
 * `findGuidedDrift`) to them explicitly, on both the dataset and the installed mirror.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { findApprovalRounds, findGuidedDrift } from '../tools/skills-conformance-check'

const DATASET = join(__dirname, '../../dataset/.skills/process')
const INSTALLED = join(__dirname, '../../../../.claude/skills')

const read = (p: string): string => readFileSync(p, 'utf-8')

const COPIES = (name: string): Array<readonly [string, string]> => [
  ['dataset', join(DATASET, name, 'SKILL.md')],
  ['installed', join(INSTALLED, `pair-process-${name}`, 'SKILL.md')],
]

/** Body of a `##`/`###` section, from its heading to the next heading of same or higher level. */
function section(content: string, heading: RegExp): string {
  const lines = content.split('\n')
  const start = lines.findIndex(l => /^#{2,3}\s/.test(l) && heading.test(l))
  expect(start, `heading ${heading} not found`).toBeGreaterThanOrEqual(0)
  const level = (lines[start] as string).match(/^#+/)![0].length
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const m = (lines[i] as string).match(/^(#+)\s/)
    if (m && (m[1] as string).length <= level) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

/**
 * Rounds this guard governs. The Process Profile paragraph ("Executable form of the …")
 * is a byte-pinned convention snippet (process-profile.test.ts) whose direct-invocation
 * warning is governed by the profile gate, not by `$approval`.
 */
const governed = (content: string): ReturnType<typeof findApprovalRounds> =>
  findApprovalRounds(content).filter(r => !r.text.startsWith('Executable form of the'))

const argRow = (content: string, arg: string): string | undefined =>
  content.split('\n').find(l => l.trimStart().startsWith(`| \`${arg}\``))

describe('refine-story — $approval + $prepare (ADR-027)', () => {
  for (const [label, path] of COPIES('refine-story')) {
    const skill = read(path)

    it(`${label} — Arguments carry $approval (points at the convention) and $prepare`, () => {
      const approval = argRow(skill, '$approval')
      expect(approval, '$approval row').toBeDefined()
      expect(approval).toMatch(/interactive/)
      expect(approval).toMatch(/approval-rounds\.md/)
      const prepare = argRow(skill, '$prepare')
      expect(prepare, '$prepare row').toBeDefined()
      expect(prepare).toMatch(/always/)
      expect(prepare).toMatch(/never/)
      expect(prepare).toMatch(/when/)
    })

    it(`${label} — every approval round of the skill carries a complete marker`, () => {
      const rounds = governed(skill)
      expect(rounds.length).toBeGreaterThan(0)
      for (const r of rounds) {
        expect(r.qualified, `line ${r.line} unmarked: ${r.text.slice(0, 80)}`).toBe(true)
        expect(r.marker?.malformed).toBeUndefined()
      }
      expect(findGuidedDrift(skill)).toEqual([])
    })

    it(`${label} — Steps 2, 3, 4 human-judgment gates are confirm/accept`, () => {
      for (const step of [/Step 2:/, /Step 3: Technical/, /Step 4:/]) {
        const rounds = findApprovalRounds(section(skill, step))
        expect(rounds.length, `${step} has no detected round`).toBeGreaterThan(0)
        for (const r of rounds) {
          expect(r.marker?.kind).toBe('confirm')
          expect(r.marker?.auto).toBe('accept')
        }
      }
    })

    // SAFETY ROW 1 — phase 0 keeps blocking without `$prepare`.
    it(`${label} — phase 0 is gate/halt and still composes grill without $prepare`, () => {
      const p0 = section(skill, /Phase 0/)
      const gate = findApprovalRounds(p0).filter(r => r.marker?.kind === 'gate')
      expect(gate.length).toBeGreaterThan(0)
      for (const g of gate) {
        expect(g.marker?.auto).toBe('halt')
        expect(g.text).toMatch(/HALT/)
      }
      expect(p0).toMatch(/Compose `\/(?:pair-capability-)?grill` with `\$mode: sync`/)
      expect(p0).toMatch(
        /`\$prepare` (?:is )?(?:absent|omitted)[^\n]*`always`|`always`[^\n]*(?:absent|omitted)/i,
      )
      expect(p0).toMatch(/no shared understanding[\s\S]{0,200}HALT|HALT[\s\S]{0,300}unaligned/i)
    })

    // SAFETY ROW 2 — `$approval: auto` alone still halts.
    it(`${label} — $approval: auto alone still halts at phase 0 (ADR-021, ADR-027)`, () => {
      const p0 = section(skill, /Phase 0/)
      expect(p0).toMatch(/`\$approval: auto` (?:alone|by itself)[^\n]*(?:still )?HALT/i)
      expect(p0).toMatch(/`\$prepare: never\|when`|`\$prepare`[^\n]*`never`[^\n]*`when`/)
      const prepare = argRow(skill, '$prepare') as string
      expect(prepare).toMatch(/`\$approval: auto`[^|]*(?:alone|by itself)[^|]*HALT/i)
    })

    it(`${label} — the exception needs BOTH signals and does not compose grill`, () => {
      const p0 = section(skill, /Phase 0/)
      expect(p0).toMatch(/both[^\n]*`\$approval: auto`[^\n]*`\$prepare: never\|when`/i)
      expect(p0).toMatch(
        /(?:not|never) compos\w*[^\n]*`\/(?:pair-capability-)?grill`|`\/(?:pair-capability-)?grill`[^\n]*(?:is )?not composed/i,
      )
      expect(p0).toMatch(/## Assumptions/)
    })

    it(`${label} — ## Assumptions entry format, none-line and provenance Notes line`, () => {
      expect(skill).toMatch(/question, answer chosen, evidence, how to overturn/i)
      expect(skill).toMatch(/none: every question settled from repository evidence/)
      expect(skill).toMatch(/Prepared autonomously under prepare: <value> \(<source>\) — ADR-027/)
      expect(skill).toMatch(/open-question/)
    })

    it(`${label} — Step 5 holds back the Ready status write under $prepare never|when`, () => {
      const step5 = section(skill, /Step 5:/)
      expect(step5).toMatch(
        /\$prepare: never\|when[\s\S]{0,300}(?:omit|withh|hold)[\s\S]{0,120}`\$status/i,
      )
      // default path unchanged
      expect(step5).toMatch(/`\$status: Ready` — \*\*pass it only when a board state maps/)
    })
  }
})

describe('plan-tasks — $approval + markers (ADR-027)', () => {
  for (const [label, path] of COPIES('plan-tasks')) {
    const skill = read(path)

    it(`${label} — Arguments carry an $approval row pointing at the convention`, () => {
      const row = argRow(skill, '$approval')
      expect(row, '$approval row').toBeDefined()
      expect(row).toMatch(/interactive/)
      expect(row).toMatch(/approval-rounds\.md/)
    })

    it(`${label} — every round is marked and the guided half carries no auto-only text`, () => {
      const rounds = governed(skill)
      expect(rounds.length).toBeGreaterThan(0)
      for (const r of rounds) {
        expect(r.qualified, `line ${r.line} unmarked: ${r.text.slice(0, 80)}`).toBe(true)
      }
      expect(findGuidedDrift(skill)).toEqual([])
    })

    it(`${label} — Steps 2, 2.5 and 3 rounds are confirm/accept`, () => {
      for (const step of [/Step 2:/, /Step 2\.5/, /Step 3:/]) {
        const rounds = findApprovalRounds(section(skill, step))
        expect(rounds.length, `${step} has no detected round`).toBeGreaterThan(0)
        for (const r of rounds) {
          expect(r.marker?.kind).toBe('confirm')
          expect(r.marker?.auto).toBe('accept')
        }
      }
    })

    it(`${label} — Step 0 asks only when $story is absent; no board write is added`, () => {
      expect(section(skill, /Step 0:/)).toMatch(/only when `\$story` is absent/i)
      expect(skill).not.toMatch(/\$status/)
    })
  }
})
