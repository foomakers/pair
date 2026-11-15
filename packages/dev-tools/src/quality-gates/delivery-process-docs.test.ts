import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

import { REPO_ROOT } from './repo-root'

// #646 AC-D: the delivery-process docs resolve and no longer state the replaced behavior.
const GUIDE =
  'packages/knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/automation/delivery-cycle.md'
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8')
const slug = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s/g, '-')

describe('delivery process docs (#646 AC-D)', () => {
  it('every way-of-working link into the delivery-cycle guide names an existing heading', () => {
    const anchors = new Set([...read(GUIDE).matchAll(/^#{2,4} (.+)$/gm)].map(m => slug(m[1] ?? '')))
    const links = [
      ...read('.pair/adoption/tech/way-of-working.md').matchAll(/delivery-cycle\.md#([\w-]+)/g),
    ].map(m => m[1])
    expect(links).toContain('process-recovery')
    for (const a of links) expect(anchors, a).toContain(a)
  })

  it.each([
    [GUIDE, 'treats the refusal as stale'],
    [GUIDE, 'Spent ⇒ `needs-human: <reason>`'],
    [GUIDE, 'the stage ends `failed-<step>`'],
    ['packages/knowledge-hub/dataset/.skills/workflow/red-spec/SKILL.md', 'once a human clears it'],
  ])('%s no longer states %s', (file, phrase) => {
    expect(read(file)).not.toContain(phrase)
  })

  // #646 r1-5 — the class: every shipped instruction (stage and coordinator skills, guidelines, site docs, CLI docs)
  // that speaks of a dead, stalled or process-faulted dispatch says it recovers or parks — never a failed-<step> end.
  const walk = (dir: string, ext: RegExp): string[] =>
    readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap(e =>
      e.isDirectory()
        ? walk(`${dir}/${e.name}`, ext)
        : ext.test(e.name)
          ? [`${dir}/${e.name}`]
          : [],
    )
  const shipped = [
    ...walk('packages/knowledge-hub/dataset/.skills', /\.md$/),
    ...walk('packages/knowledge-hub/dataset/.pair/knowledge/guidelines', /\.md$/),
    ...walk('apps/website/content/docs', /\.mdx$/),
    'README.md',
  ]
  const PROCESS = /dead.dispatch|stall|unadvanced|idle.timeout|process fault/i
  it('no shipped doc ends a dead, stalled or process-faulted dispatch with failed-<step>', () => {
    const offenders = shipped.flatMap(file =>
      read(file)
        .split(/(?<=\.)\s+|\|/)
        .filter(s => PROCESS.test(s))
        .filter(s =>
          [...s.matchAll(/`failed-<(?:step|stage)>`/g)].some(
            m => !/never\s*$/.test(s.slice(0, m.index)),
          ),
        )
        .map(s => `${file}: ${s.trim().slice(0, 160)}`),
    )
    expect(offenders).toEqual([])
  })
})
