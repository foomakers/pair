import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #626: the report-only `analyze-test-speed` and `analyze-test-prune`
// capabilities. Each invariant was injection-tested by deleting the claim and confirming the red.

const DATASET = join(__dirname, '../../dataset/.skills/capability')
const MIRROR = join(__dirname, '../../../../.claude/skills')
const DEV_TOOLS_PKG = JSON.parse(
  readFileSync(join(__dirname, '../../../dev-tools/package.json'), 'utf-8'),
) as { scripts: Record<string, string> }

const norm = (s: string) => s.replace(/[*`_]/g, '').replace(/\s+/g, ' ').toLowerCase()
const section = (c: string, start: string, end: string) => {
  const from = c.indexOf(start)
  if (from === -1) return ''
  const to = c.indexOf(end, from + start.length)
  return c.slice(from, to === -1 ? c.length : to)
}

const SKILLS = [
  {
    name: 'analyze-test-speed',
    commands: ['test-audit:baseline', 'test-audit:prepush'],
    askStep: ['### Step 6', '## Safety'],
    report: '.pair/working/reports/test-speed/',
  },
  {
    name: 'analyze-test-prune',
    commands: ['test-audit:baseline', 'test-audit:redundancy'],
    askStep: ['### Step 7', '## Safety'],
    report: '.pair/working/reports/test-prune/',
  },
]

for (const s of SKILLS) {
  const files = [
    { label: 'dataset', content: readFileSync(join(DATASET, s.name, 'SKILL.md'), 'utf-8') },
    {
      label: 'mirror',
      content: readFileSync(join(MIRROR, `pair-capability-${s.name}`, 'SKILL.md'), 'utf-8'),
    },
  ]
  describe(`${s.name} — skill contract (#626)`, () => {
    for (const { label, content } of files) {
      const lower = norm(content)

      it(`${label} is report-only: production and tests unchanged, only the report is written`, () => {
        expect(lower).toContain('report-only')
        expect(lower).toMatch(/production code and tests (stay )?unchanged/)
        expect(content).toContain(s.report)
      })

      it(`${label} references only test-audit commands that exist as package scripts`, () => {
        for (const c of s.commands) {
          expect(content).toContain(`pnpm ${c}`)
          expect(DEV_TOOLS_PKG.scripts).toHaveProperty(c)
        }
        const used = [...content.matchAll(/pnpm (test-audit:[a-z]+)/g)].map(m => m[1])
        for (const c of used) expect(DEV_TOOLS_PKG.scripts).toHaveProperty(c)
      })

      it(`${label} ends by asking about a card, listing its steps`, () => {
        const ask = norm(section(content, s.askStep[0], s.askStep[1]))
        expect(ask).toContain('open a card')
        expect(ask).toMatch(/listing the (steps|waves)/)
      })

      it(`${label} opens no card without an explicit yes, never unattended`, () => {
        expect(lower).toMatch(/nothing opens without an explicit yes/)
        expect(lower).toMatch(/never unattended/)
        expect(lower).toContain('/pair-capability-write-issue')
      })

      it(`${label} never estimates a missing signal`, () => {
        expect(lower).toContain('not measured')
        expect(lower).toMatch(/noisy run: discard|discarded/)
      })

      it(`${label} never deletes tests`, () => {
        expect(lower).toMatch(
          /no (deletion of any )?test|never delete|candidates (are )?never deleted/,
        )
      })
    }
  })
}

describe('analyze-test-prune — worktree safety and candidate rules (#626)', () => {
  const content = norm(readFileSync(join(DATASET, 'analyze-test-prune/SKILL.md'), 'utf-8'))
  it('runs mutation only in a clean disposable worktree and asserts a clean diff after', () => {
    expect(content).toMatch(/only in a clean, disposable worktree/)
    expect(content).toMatch(/assert git status is clean/)
  })
  it('slices a long run for the maintainer', () => {
    expect(content).toContain('--mutate')
    expect(content).toContain('--incremental')
  })
  it('never makes a candidate from similarity or a missing unique kill alone', () => {
    expect(content).toMatch(/similarity, or a missing unique kill alone, never makes a candidate/)
  })
  it('protects regression, contract, security and accessibility tests', () => {
    for (const p of ['regression', 'contract', 'security', 'accessibility'])
      expect(content).toContain(p)
  })
})
