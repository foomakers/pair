import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'

// Conformance guard for story #237 (AC3/AC4/AC5): every touched skill carries
// the scoped-context step. Prose-only behaviour → guarded structurally here.

const SKILLS = join(__dirname, '../../dataset/.skills')
const ASSESS = [
  'ai',
  'architecture',
  'cost',
  'coupling',
  'infrastructure',
  'methodology',
  'observability',
  'pm',
  'security',
  'stack',
  'testing',
].map(n => `capability/assess-${n}`)
const PROCESS = ['process/review', 'process/refine-story']
const TOUCHED = [...ASSESS, ...PROCESS]

const HEADING = /^### (?:Step [\w.]+: )?Scoped Context \(package-local override\)\s*$/m

function section(content: string): string | undefined {
  const m = HEADING.exec(content)
  if (!m) return undefined
  const rest = content.slice(m.index + m[0].length)
  const next = rest.search(/^#{1,3} /m)
  return next === -1 ? rest : rest.slice(0, next)
}

const SIGNALS_LINK = /\]\(([^)#]*package-local-adoption\.md)#activation-proposal\)/

function signalsDocViolations(doc: string): string[] {
  const h = /^## Activation Proposal\s*$/m.exec(doc)
  if (!h) return ['missing-activation-proposal-heading']
  const rest = doc.slice(h.index + h[0].length)
  const next = rest.search(/^## /m)
  const body = next === -1 ? rest : rest.slice(0, next)
  const out: string[] = []
  if (!/Packages touched/.test(body)) out.push('missing-packages-signal')
  if (!/Central adoption file size/.test(body)) out.push('missing-size-signal')
  if (!/≥ 3/.test(body) || !/> 400 lines/.test(body)) out.push('missing-signal-thresholds')
  return out
}

function violations(content: string, skillDir: string): string[] {
  const body = section(content)
  if (body === undefined) return ['missing-scoped-context-section']
  const out: string[] = []
  if (!body.includes('## Package-Local Adoption')) out.push('missing-router-reference')
  const link = /\]\(([^)]*scoped-context-resolution\.md)\)/.exec(body)
  if (!link) out.push('missing-resolution-link')
  else if (!existsSync(resolve(skillDir, link[1]!))) out.push('dangling-resolution-link')
  const sig = SIGNALS_LINK.exec(body)
  if (!sig) out.push('missing-signals-link')
  else {
    const target = resolve(skillDir, sig[1]!)
    if (!existsSync(target)) out.push('dangling-signals-link')
    else out.push(...signalsDocViolations(readFileSync(target, 'utf8')))
  }
  if (!/PROPOSE/.test(body) || !/never activate/.test(body))
    out.push('missing-propose-never-activate')
  if (!/No router ⇒ unchanged behaviour/.test(body)) out.push('missing-no-router-fallback')
  return out
}

function read(skill: string): { content: string; dir: string } {
  const file = join(SKILLS, skill, 'SKILL.md')
  return { content: readFileSync(file, 'utf8'), dir: dirname(file) }
}

describe('scoped-context step in touched skills (#237)', () => {
  it('lists exactly 13 touched skills', () => {
    expect(TOUCHED).toHaveLength(13)
  })

  it.each(TOUCHED)('%s carries the scoped-context step', skill => {
    const { content, dir } = read(skill)
    expect(violations(content, dir)).toEqual([])
  })

  it('no unlisted skill carries the step', () => {
    const carriers: string[] = []
    for (const group of ['capability', 'process']) {
      for (const name of readdirSync(join(SKILLS, group))) {
        const file = join(SKILLS, group, name, 'SKILL.md')
        if (existsSync(file) && HEADING.test(readFileSync(file, 'utf8')))
          carriers.push(`${group}/${name}`)
      }
    }
    expect(carriers.sort()).toEqual([...TOUCHED].sort())
  })

  it.each(TOUCHED)('%s: removing the section is detected', skill => {
    const { content, dir } = read(skill)
    const body = section(content)!
    const m = HEADING.exec(content)!
    const mutated = content.slice(0, m.index) + content.slice(m.index + m[0].length + body.length)
    expect(violations(mutated, dir)).toContain('missing-scoped-context-section')
  })

  it.each(TOUCHED)('%s: dropping the signals/propose clause is detected', skill => {
    const { content, dir } = read(skill)
    const mutated = content.replace(/never activate/, 'activate')
    expect(violations(mutated, dir)).toContain('missing-propose-never-activate')
  })

  it.each(TOUCHED)('%s: signals anchor resolves to the activation-proposal signals', skill => {
    const { content, dir } = read(skill)
    const sig = SIGNALS_LINK.exec(section(content)!)!
    const doc = readFileSync(resolve(dir, sig[1]!), 'utf8')
    expect(signalsDocViolations(doc)).toEqual([])
  })

  it('renaming the activation-proposal heading in the target doc is detected', () => {
    const { content, dir } = read(TOUCHED[0]!)
    const sig = SIGNALS_LINK.exec(section(content)!)!
    const doc = readFileSync(resolve(dir, sig[1]!), 'utf8')
    const mutated = doc.replace(/^## Activation Proposal/m, '## Activation Proposals')
    expect(signalsDocViolations(mutated)).toContain('missing-activation-proposal-heading')
  })

  it('dropping a signal or its threshold in the target doc is detected', () => {
    const { content, dir } = read(TOUCHED[0]!)
    const sig = SIGNALS_LINK.exec(section(content)!)!
    const doc = readFileSync(resolve(dir, sig[1]!), 'utf8')
    expect(signalsDocViolations(doc.replace('Central adoption file size', 'x'))).toContain(
      'missing-size-signal',
    )
    expect(signalsDocViolations(doc.replace('> 400 lines', 'x'))).toContain(
      'missing-signal-thresholds',
    )
  })

  it.each(TOUCHED)('%s: renaming the signals anchor in the skill is detected', skill => {
    const { content, dir } = read(skill)
    const mutated = content.replace('#activation-proposal)', '#activation-proposals)')
    expect(violations(mutated, dir)).toContain('missing-signals-link')
  })
})
