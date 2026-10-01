import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// US-521 remediation r1-g3, finding r0-4 (loop half) — `/pair-loop` refuses a declared `## Autonomy` in
// EVERY realization tier, exactly as the in-harness workflow (`pair-loop.js` validateArgs) already does:
// tier 1 (in-harness `Workflow`), tier 2 (external driver: `pair-cli run` spawns a fresh engine on this
// SKILL's one-card path) and tier 3 (degraded one card + continue-token). Tiers 2 and 3 execute THIS
// text, so the refusal has to live in it, in Step 0 — which every tier runs before Step 1 chooses a
// realization — and BEFORE the "automation is off … exit cleanly" check, the same order `pair-loop.js`
// applies (an `## Autonomy`-only project is refused, never reported as "automation off").
//
// POSITIVE canonical form — read over the WHOLE item (its first line and every continuation line up to
// the next numbered item or the end of Step 0). The item must be exactly:
//
//   N. **Check**: Does the file declare a `## Autonomy` section (outside a fenced code block)? If so,
//      **HALT** `autonomy-not-supported-until-#524` before any card is touched[ — <rationale>].
//
// with nothing between the question and "If so," (no qualifier: no tier, no realization, no condition),
// one sentence only, and an optional rationale tail that is the fixed text below (nothing that could
// restrict the clause). It names neither `## Auto-Advance` nor `## Eligibility` (legacy-only projects are
// NOT refused — #490). The extractor is proven on mutated copies of the shipped text (frozen, rows G3-X*).

const COPIES: Array<[string, string]> = [
  ['dataset', join(__dirname, '../../dataset/.skills/loop/SKILL.md')],
  ['mirror', join(__dirname, '../../../../.claude/skills/pair-loop/SKILL.md')],
]
const POINTER = 'autonomy-not-supported-until-#524'
const RATIONALE =
  ' — this loop does not honour the autonomy model yet, and a declared gate is never silently ignored'
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const CANON_ITEM = new RegExp(
  '^\\d+\\. \\*\\*Check\\*\\*: Does the file declare a `## Autonomy` section(?: \\(outside a fenced code block\\))?\\? ' +
    'If so, \\*\\*HALT\\*\\* `autonomy-not-supported-until-#524` before any card is touched' +
    `(?:${escape(RATIONALE)})?\\.$`,
)

function between(content: string, startMarker: string, endMarker: string): string {
  const start = content.indexOf(startMarker)
  if (start === -1) return ''
  const end = content.indexOf(endMarker, start + startMarker.length)
  return content.slice(start, end === -1 ? undefined : end)
}
/** Step 0's numbered items, each WITH its continuation lines (trailing blank lines dropped). */
function stepZeroItems(content: string): string[] {
  const items: string[][] = []
  for (const line of between(content, '## Step 0', '## Step 1').split('\n')) {
    if (/^\d+\.\s/.test(line)) items.push([line])
    else if (items.length > 0) items[items.length - 1]!.push(line)
  }
  return items.map(lines => lines.join('\n').trimEnd())
}

interface Refusal {
  /** Some Step 0 item names `## Autonomy` and the pointer. */
  readonly present: boolean
  /** That item IS the canonical unconditional clause — whole item, no qualifier, no restricting sentence. */
  readonly canonical: boolean
  /** It precedes the "automation is off … exit cleanly" item. */
  readonly beforeAutomationOff: boolean
}
function readRefusal(content: string): Refusal {
  const items = stepZeroItems(content)
  const halt = items.findIndex(i => i.includes('## Autonomy') && i.includes(POINTER))
  const off = items.findIndex(i => /exit cleanly/.test(i))
  return {
    present: halt !== -1,
    canonical: halt !== -1 && CANON_ITEM.test(items[halt] ?? ''),
    beforeAutomationOff: halt !== -1 && off !== -1 && halt < off,
  }
}
const conforming = (r: Refusal) => r.present && r.canonical && r.beforeAutomationOff

describe.each(COPIES)(
  'r0-4 — %s loop SKILL.md refuses `## Autonomy` in Step 0, for every tier',
  (_, path) => {
    const content = readFileSync(path, 'utf-8')

    it('G3-S1: Step 0 HALTs on a declared `## Autonomy` with the #524 pointer', () => {
      expect(readRefusal(content).present).toBe(true)
    })

    it('G3-S2: the HALT precedes the "automation is off … exit cleanly" check (same order as pair-loop.js)', () => {
      expect(readRefusal(content).beforeAutomationOff).toBe(true)
    })

    it('G3-S3: the HALT item is the canonical unconditional clause (whole item, no qualifier, no restricting sentence)', () => {
      expect(readRefusal(content).canonical).toBe(true)
    })

    it('G3-C1: Step 0 still precedes the realization choice (Step 1), so tiers 1–3 all pass through it', () => {
      expect(content.indexOf('## Step 0')).toBeGreaterThan(-1)
      expect(content.indexOf('## Step 0')).toBeLessThan(content.indexOf('## Step 1'))
    })
  },
)

// ── the extractor, proven on mutated copies of the shipped text ─────────────────────────────
const BASE = readFileSync(join(__dirname, '__fixtures__/loop-skill-r0-4-base.md'), 'utf-8')
const ITEM_ONE = /^1\. \*\*Act\*\*: Read `\.pair\/adoption\/tech\/automation\.md`.*$/m
const CANON = `**Check**: Does the file declare a \`## Autonomy\` section (outside a fenced code block)? If so, **HALT** \`autonomy-not-supported-until-#524\` before any card is touched${RATIONALE}.`

function insertAfterItemOne(text: string, item: string): string {
  const m = ITEM_ONE.exec(text)
  expect(m, 'mutation anchor: Step 0 item 1').not.toBeNull()
  return text.replace(ITEM_ONE, `${m![0]}\n2. ${item}`)
}
function insertAfterExit(text: string, item: string): string {
  const exit = /^3\. \*\*Act\*\*: If so, report "automation is off.*$/m
  const m = exit.exec(text)
  expect(m, 'mutation anchor: Step 0 exit item').not.toBeNull()
  return text.replace(exit, `${m![0]}\n3. ${item}`)
}
function insertInClaudeCodeBranch(text: string, item: string): string {
  const anchor = '2. **Act — Claude Code**:'
  expect(text.includes(anchor), 'mutation anchor: Step 1 Claude Code branch').toBe(true)
  return text.replace(anchor, `${anchor} ${item}`)
}

describe('r0-4 — the extractor on mutated copies of the shipped loop SKILL text', () => {
  it('G3-X0: the canonical Step 0 item right after the policy read conforms (with and without the rationale tail)', () => {
    expect(readRefusal(insertAfterItemOne(BASE, CANON))).toEqual({
      present: true,
      canonical: true,
      beforeAutomationOff: true,
    })
    expect(conforming(readRefusal(insertAfterItemOne(BASE, CANON.replace(RATIONALE, ''))))).toBe(
      true,
    )
  })

  it('G3-X1: the HALT only in Step 1’s Claude Code branch (tier 1 only) does NOT conform', () => {
    expect(conforming(readRefusal(insertInClaudeCodeBranch(BASE, CANON)))).toBe(false)
  })

  it('G3-X2: the HALT after the "automation is off … exit cleanly" item does NOT conform', () => {
    const r = readRefusal(insertAfterExit(BASE, CANON))
    expect(r.present).toBe(true)
    expect(r.beforeAutomationOff).toBe(false)
  })

  it.each([
    ['G3-X3', CANON.replace('If so, **HALT**', 'If so, warn and continue; a later **HALT**')],
    ['G3-X4', CANON.replace('If so,', 'In the degraded path only, if so,')],
    ['G3-X5', CANON.replace('If so,', 'Unless running in-harness, if so,')],
    ['G3-X6', CANON.replace('If so,', 'If so, you may')],
    ['G3-X10', CANON.replace('If so, **HALT**', 'If so, you should consider a **HALT**')],
    ['G3-X11', CANON.replace('If so,', 'For the Workflow realization, if so,')],
    ['G3-X12', CANON.replace('If so,', 'When running inside the harness, if so,')],
  ])('%s: a qualified, scoped or softened HALT item does NOT conform', (_, item) => {
    const r = readRefusal(insertAfterItemOne(BASE, item))
    expect(r.present).toBe(true)
    expect(r.canonical).toBe(false)
    expect(conforming(r)).toBe(false)
  })

  it('G3-X7: a HALT that also fires on `## Auto-Advance` (would refuse a legacy-only project) does NOT conform', () => {
    const r = readRefusal(
      insertAfterItemOne(
        BASE,
        CANON.replace('a `## Autonomy` section', 'a `## Autonomy` or `## Auto-Advance` section'),
      ),
    )
    expect(r.present).toBe(true)
    expect(r.canonical).toBe(false)
  })

  it('G3-X9: the canonical clause followed by a restricting continuation line does NOT conform (the whole item is read)', () => {
    const r = readRefusal(
      insertAfterItemOne(
        BASE,
        `${CANON}\n   This check applies to the Workflow realization only; the one-card path proceeds.`,
      ),
    )
    expect(r.present).toBe(true)
    expect(r.canonical).toBe(false)
  })

  it('G3-X13: the canonical clause followed by a restricting sentence on the same line does NOT conform', () => {
    const r = readRefusal(
      insertAfterItemOne(BASE, `${CANON} It applies to the Workflow realization only.`),
    )
    expect(r.canonical).toBe(false)
  })

  it('G3-X8: the shipped text (r0-4 as shipped) does NOT conform — the defect', () => {
    expect(conforming(readRefusal(BASE))).toBe(false)
  })
})
