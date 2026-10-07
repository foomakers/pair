import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #253: `/pair-next` decides on CONTROL STATE — the macrostate resolved
// through the `## State Mapping` (primary) plus the canonical Definition-of-Ready criteria
// (fallback) — never on title heuristics or hardcoded board names (R2.5, D4). One resolution
// procedure lives in pair-next; every decision point and every orchestration mode REFERENCES it.
// The "grep audit" of the story's QA checklist is this test: the skill is prose, so what can
// regress is the prose. The executable fixture boards (mapped / minimal / unmapped / missing WoW /
// conflict) run against the shared implementation in
// `apps/pair-cli/src/commands/run/control-state-fixtures.test.ts`.
// Reads the dataset source of record and the installed root mirror.

const SKILLS = join(__dirname, '../../dataset/.skills')
const ROOT_SKILLS = join(__dirname, '../../../../.claude/skills')

const read = (path: string): string => readFileSync(path, 'utf-8')

const sources: Array<[string, string]> = [
  ['dataset', read(join(SKILLS, 'next/SKILL.md'))],
  ['mirror', read(join(ROOT_SKILLS, 'pair-next/SKILL.md'))],
]

const HEADING = '### Control-State Resolution'

function procedure(content: string): string {
  const start = content.indexOf(HEADING)
  expect(start, `${HEADING} is missing`).toBeGreaterThan(-1)
  const end = content.indexOf('\n### ', start + HEADING.length)
  expect(end).toBeGreaterThan(start)
  return content.slice(start, end)
}

/** The decision text: everything before the output/degradation prose — Steps 0–5. */
function decisionText(content: string): string {
  const start = content.indexOf('## Algorithm')
  const end = content.indexOf('## Output Format')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return content.slice(start, end)
}

describe.each(sources)('pair-next control state — %s SKILL.md', (_, content) => {
  it('AC1: one procedure resolves board state → macrostate through the `## State Mapping`', () => {
    const p = procedure(content)
    expect(p).toContain('## State Mapping')
    expect(p).toMatch(/case-insensitive/i)
    expect(p).toMatch(/macrostate/i)
    // the n-m map lives in way-of-working.md; the rule's owner is canonical-states.md
    expect(p).toContain('canonical-states.md')
  })

  it('AC1: the procedure sits before the cascade steps that use it (Step 0.5 < procedure < Step 1)', () => {
    const at = content.indexOf(HEADING)
    expect(at).toBeGreaterThan(content.indexOf('### Step 0.5'))
    expect(at).toBeLessThan(content.indexOf('### Step 1:'))
  })

  it('AC1: the item-selection rows and the state-resolution paragraph REFERENCE the procedure', () => {
    const step3 = content.slice(content.indexOf('### Step 3:'), content.indexOf('### Step 4:'))
    expect(step3).toContain('Control-State Resolution')
    expect(step3).toMatch(/State resolution\*\*:[^\n]*Control-State Resolution/)
    // referenced, not re-derived: Step 3 no longer carries its own copy of the readiness rule
    expect(step3).not.toMatch(/apply the Readiness Fallback: evaluate/)
  })

  it('AC2: no state expressing readiness ⇒ DoR criteria on the body — canonical set, no local variant', () => {
    const p = procedure(content)
    expect(p).toMatch(/no board state[^.\n]*(maps?|resolves?) to `?Ready/i)
    expect(p).toContain('definition-of-ready-and-done.md')
    expect(p).toMatch(/inline task[- ]breakdown/i)
    expect(p).toMatch(/single source|never a local variant|no local variant/i)
    // the criteria themselves are NOT re-listed here (single source = the KB doc)
    for (const criterion of ['Clear title', 'Problem/goal', 'Design flag']) {
      expect(content).not.toContain(criterion)
    }
  })

  it('AC2: mapped state is the primary signal — DoR is only the fallback', () => {
    expect(procedure(content)).toMatch(/primary/i)
    expect(procedure(content)).toMatch(/fallback/i)
  })

  it('AC2: a failed DoR lists every failing criterion by name — never a blanket "not ready"', () => {
    expect(procedure(content)).toMatch(
      /failing criteri(a|on)[^.\n]*(list|name)|list[^.\n]*failing criteri/i,
    )
  })

  it('AC3: titles are never a control signal; the only title read is the DoR presence check', () => {
    const p = procedure(content)
    expect(p).toMatch(/never[^.\n]*title|title[^.\n]*never/i)
    // grep audit: every line of the decision text that mentions a title says it is NOT used
    const offenders = decisionText(content)
      .split('\n')
      .filter(line => /\btitles?\b/i.test(line))
      .filter(line => !/never|not |no |without|presence|placeholder/i.test(line))
    expect(offenders).toEqual([])
  })

  it('AC1/AC3: grep audit — no hardcoded board-state names in the decision text', () => {
    const board = /\b(Todo|To Do|Refined|Icebox|Up Next|Doing|Committed|Approved|Shipped|Blocked)\b/
    const offenders = decisionText(content)
      .split('\n')
      .filter(line => board.test(line))
    expect(offenders).toEqual([])
  })

  it('AC4: an unmapped board state is reported as out-of-process — not an error, never a HALT', () => {
    const p = procedure(content)
    expect(p).toMatch(/unmapped/i)
    expect(p).toMatch(/out-of-process/i)
    expect(p).toMatch(/not an error|never an error|no error/i)
    expect(p).toMatch(/unmapped states allowed|Reading rule 4|ignored for pair semantics/i)
  })

  it('edge: missing WoW ⇒ canonical names assumed (D21) with the DoR fallback active', () => {
    const p = procedure(content)
    expect(p).toMatch(/no `## State Mapping`|section is absent|missing/i)
    expect(p).toContain('D21')
    expect(p).toMatch(/canonical names? (are )?assumed/i)
  })

  it('edge: conflicting signals (state Ready, DoR fails) ⇒ flagged with the failing criteria; state wins', () => {
    const p = procedure(content)
    expect(p).toMatch(/conflict/i)
    expect(p).toMatch(/state says `?Ready/i)
    expect(p).toMatch(/flag/i)
    expect(p).toMatch(/state wins|mapped state wins|warning/i)
  })

  it('the reporting formats (out-of-process, conflict) are declared in the Output Format', () => {
    const output = content.slice(
      content.indexOf('## Output Format'),
      content.indexOf('## Graceful Degradation'),
    )
    expect(output).toMatch(/out-of-process/i)
    expect(output).toMatch(/conflict/i)
  })
})

describe.each([
  ['dataset', join(SKILLS, 'loop/SKILL.md'), join(SKILLS, 'workflow/cycle/SKILL.md')],
  [
    'mirror',
    join(ROOT_SKILLS, 'pair-loop/SKILL.md'),
    join(ROOT_SKILLS, 'pair-workflow-cycle/SKILL.md'),
  ],
])('orchestration modes reference — never duplicate — the procedure (%s)', (_, loop, cycle) => {
  it('the loop and the cycle coordinator point at /pair-next Control-State Resolution', () => {
    for (const path of [loop, cycle]) {
      expect(read(path), path).toMatch(/Control-State Resolution/)
    }
  })

  it('the cycle coordinator names no board state — it reads macrostates', () => {
    expect(read(cycle)).not.toMatch(/`Refined`/)
  })
})

describe('docs site — control-state resolution is documented', () => {
  const page = read(
    join(__dirname, '../../../../apps/website/content/docs/reference/pair-next.mdx'),
  )

  it('documents macrostate-first resolution, the DoR fallback, out-of-process, conflict and no title signals', () => {
    expect(page).toContain('Control-State Resolution')
    expect(page).toMatch(/Definition of Ready/)
    expect(page).toMatch(/out-of-process/i)
    expect(page).toMatch(/Conflicting signals/)
    expect(page).toMatch(/Titles are never a control signal/)
  })

  it('the canonical-states guide points its /pair-next row at the one procedure', () => {
    const states = read(
      join(
        __dirname,
        '../../dataset/.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md',
      ),
    )
    expect(states).toContain('Control-State Resolution')
  })
})
