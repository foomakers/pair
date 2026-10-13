import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import headings from './__fixtures__/template-headings.json'

// Shrink discipline (#433 T-4): the five working templates declare a word limit per `##` section
// (`<!-- word-limits: Section=N; ... -->`), keep every section they had before the cut, and one
// sample per template — filled within those limits — is accepted by the format its readers rely on
// (pr: anchored Refs read-back; commit: subject rules; story: Given/When/Then blocks the cycle parses
// (cycle-state.mjs GWT_AC_RE); task: story-body Task Breakdown checklist; review: verdict-first).

const TPL = '.pair/knowledge/guidelines/collaboration/templates'
const ROOTS = [
  ['dataset', join(__dirname, '../../dataset', TPL)],
  ['mirror', join(__dirname, '../../../..', TPL)],
] as const
const SAMPLES = join(__dirname, '__fixtures__/template-samples')

const NAMES = ['pr', 'commit', 'user-story', 'task', 'code-review'] as const
type Name = (typeof NAMES)[number]
const tpl = (root: string, n: Name) => readFileSync(join(root, `${n}-template.md`), 'utf-8')
const sample = (n: Name) => readFileSync(join(SAMPLES, `${n === 'task' ? 'task' : n}.md`), 'utf-8')

const words = (s: string) => s.split(/\s+/).filter(Boolean).length
const limitsOf = (t: string) => {
  const m = /<!-- word-limits: (.*?) -->/s.exec(t)
  expect(m, 'no word-limits declaration').not.toBeNull()
  const out = new Map<string, number>()
  for (const part of m![1]!.split(';')) {
    const kv = /^\s*(.+?)=(\d+)\s*$/.exec(part)
    if (kv) out.set(kv[1]!, Number(kv[2]))
  }
  return out
}
const sectionsOf = (t: string) => {
  const out = new Map<string, string>()
  const parts = t.split(/^## (.+)$/m)
  for (let i = 1; i < parts.length; i += 2) out.set(parts[i]!.trim(), parts[i + 1]!)
  return out
}
/** Sections a sample may omit: the template marks them "Conditional". */
const OPTIONAL: Partial<Record<Name, string[]>> = {
  pr: ['Services to Release', 'Screenshots'],
}

describe.each(ROOTS)('template word limits — %s', (_label, root) => {
  for (const n of NAMES.filter(n => n !== 'commit' || true)) {
    describe(`${n}-template`, () => {
      const t = tpl(root, n)
      const limits = limitsOf(t)
      const heads = [...t.matchAll(/^## (.+)$/gm)].map(m => m[1]!.trim())

      it('keeps every ## section it had before the cut', () => {
        for (const h of (headings as Record<string, string[]>)[n]!) expect(heads).toContain(h)
      })

      it('declares a numeric word limit for every ## section', () => {
        for (const h of heads) {
          if (h.includes('Table of Contents')) continue
          expect(limits.get(h), `${n}: no word limit for "${h}"`).toBeGreaterThan(0)
        }
      })

      it('declares no limit for a section that does not exist', () => {
        for (const k of limits.keys()) expect(heads, `${n}: stray limit "${k}"`).toContain(k)
      })
    })
  }
})

describe('template samples — within limits and accepted by their reader format', () => {
  const t = (n: Name) => tpl(ROOTS[0][1], n)

  for (const n of ['pr', 'user-story', 'task', 'code-review'] as const) {
    it(`${n}: every section within its limit, none unknown, none missing`, () => {
      const limits = limitsOf(t(n))
      const got = sectionsOf(sample(n))
      let tplHeads = [...t(n).matchAll(/^## (.+)$/gm)].map(m => m[1]!.trim())
      if (n === 'user-story') {
        // the refined template is the one a card is refined into
        const refined = t(n).split('## Refined User Story Template')[1]!
        tplHeads = [...refined.matchAll(/^## (.+)$/gm)].map(m => m[1]!.trim())
      }
      if (n === 'task') tplHeads = ['Task Breakdown']
      for (const [h, body] of got) {
        expect(tplHeads, `${n}: unknown section "${h}"`).toContain(h)
        expect(words(body), `${n}: "${h}" over its limit`).toBeLessThanOrEqual(limits.get(h)!)
      }
      for (const h of tplHeads)
        if (!OPTIONAL[n]?.includes(h)) expect([...got.keys()], `${n}: missing "${h}"`).toContain(h)
    })
  }

  it('pr: Refs read-back captures the item id; title and Refs follow the template', () => {
    const s = sample('pr')
    expect(/^Refs:[ \t]*(.+?)[ \t]*$/m.exec(s)?.[1]).toBe('ENG-412')
    expect(s).not.toMatch(/\*\*Refs:?\*\*/)
    expect(s).toMatch(/^\*\*PR Title:\*\* \[US-\d+\] \w+: /m)
  })

  it('commit: subject follows the format, within 50 chars and 80 body words', () => {
    const [subject, ...rest] = sample('commit').trimEnd().split('\n')
    expect(subject).toMatch(
      /^\[(US|BUG)-\d+\] (feat|fix|refactor|test|docs|chore|style|perf|build|ci): [a-z].*[^.]$/,
    )
    expect(subject!.replace(/^\[[^\]]+\] /, '').length).toBeLessThanOrEqual(50)
    expect(words(rest.join(' '))).toBeLessThanOrEqual(80)
    expect(rest.join('\n')).toMatch(/^Refs: #T-\d+/m)
  })

  it('commit: template section limits are declared', () => {
    expect(limitsOf(t('commit')).size).toBeGreaterThan(5)
  })

  it('user-story: Given/When/Then blocks parse like the cycle parser, Design line kept', () => {
    const s = sample('user-story')
    const gwt = /^(\d+)\.[ \t]+\*\*Given\*\*[ \t]+(.*)\n[ \t]+\*\*When\*\*[ \t]+(.*)\n[ \t]+\*\*Then\*\*[ \t]+(.*)$/gm
    expect([...s.matchAll(gwt)].length).toBe(2)
    expect(s).toMatch(/\*\*Design\*\*: (not required|required — reference: .+)/)
  })

  it('task: story-body checklist rows the task locator reads, plus AC coverage', () => {
    const s = sample('task')
    expect([...s.matchAll(/^- \[ \] \*\*T-\d+\*\*: .+$/gm)].length).toBeGreaterThan(1)
    expect(s).toMatch(/### AC Coverage/)
  })

  it('code-review: verdict-first, no TECH-DEBT verdict, every assessment 1-line verdict + <details>', () => {
    const s = sample('code-review')
    expect(s.slice(s.search(/^##\s+/m))).toMatch(/^## Verdict/)
    const line = s.split('\n').find(l => l.includes('risk:') && l.includes('cost:'))!
    expect(line).toMatch(/APPROVED|CHANGES-REQUESTED/)
    expect(line).not.toMatch(/TECH-DEBT/)
    const assess = s.split(/^### /m).filter(b => /^(Security|Cost|Architecture|Bug fix)/.test(b))
    expect(assess.length).toBeGreaterThan(0)
    for (const b of assess) {
      expect(b).toMatch(/\*\*Verdict:\*\*/)
      expect(b).toContain('<details>')
    }
  })
})
