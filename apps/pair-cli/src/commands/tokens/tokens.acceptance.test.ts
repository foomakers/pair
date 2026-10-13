import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'

const CLI_CWD = resolve(__dirname, '../../..')
const AREAS = ['templates', 'adoption', 'adr', 'decision-log', 'skills', 'guidelines', 'agent-context']

const run = (root: string, ...args: string[]) => {
  const r = spawnSync(
    'node',
    ['-r', 'ts-node/register/transpile-only', 'src/cli.ts', 'tokens', '--root', root, ...args],
    { cwd: CLI_CWD, encoding: 'utf-8', env: { ...process.env, NO_COLOR: '1' } },
  )
  return { code: r.status, out: r.stdout, err: r.stderr }
}

describe('pair-cli tokens (acceptance)', () => {
  let root: string
  const put = (rel: string, body: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), body)
  }

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tokens-acc-'))
    put('.pair/knowledge/guidelines/collaboration/templates/pr-template.md', 'one two three four')
    put('.pair/knowledge/guidelines/collaboration/templates/sub/x.md', 'a b')
    put('.pair/knowledge/guidelines/testing/README.md', 'g1 g2 g3')
    put('.pair/adoption/product/PRD.md', 'p1 p2 p3 p4 p5')
    put('.pair/adoption/tech/adr/adr-001.md', 'adr one two')
    put('.pair/adoption/decision-log/2026-01-01-x.md', 'dl one')
    put('.claude/skills/pair-x/SKILL.md', 's1 s2 s3 s4 s5 s6')
    put('.claude/skills/pair-x/notes.md', 'ignored by skills area')
    put('AGENTS.md', 'agents file here')
    put('CLAUDE.md', 'claude file')
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  const json = (...extra: string[]): Report => {
    const r = run(root, '--json', ...extra)
    expect(r.code).toBe(0)
    return JSON.parse(r.out)
  }
  type Item = { path: string; words: number; tokens: number }
  type Area = { name: string; files: number; words: number; tokens: number; items: Item[] }
  type Report = { areas: Area[]; total: { files: number; words: number; tokens: number } }
  const area = (j: Report, n: string) => j.areas.find(a => a.name === n)!

  it('reports every area, in a fixed order, with files/words/tokens and a total', () => {
    const j = json()
    expect(j.areas.map((a: Area) => a.name)).toEqual(AREAS)
    expect(Object.keys(j.total).sort()).toEqual(['files', 'tokens', 'words'])
    expect(j.total.words).toBe(j.areas.reduce((s: number, a: any) => s + a.words, 0))
  })

  it('counts words by whitespace and tokens as ceil(chars/4), per area and per file', () => {
    const t = area(json(), 'templates')
    expect(t.files).toBe(2)
    expect(t.words).toBe(6)
    const pr = t.items.find((i: Item) => i.path.endsWith('pr-template.md'))
    expect(pr).toEqual({ path: '.pair/knowledge/guidelines/collaboration/templates/pr-template.md', words: 4, tokens: Math.ceil('one two three four'.length / 4) })
    expect(t.tokens).toBe(t.items.reduce((s: number, i: any) => s + i.tokens, 0))
  })

  it('keeps areas disjoint: adr and decision-log are not adoption; templates are not guidelines', () => {
    const j = json()
    expect(area(j, 'adoption').files).toBe(1)
    expect(area(j, 'adr').files).toBe(1)
    expect(area(j, 'decision-log').files).toBe(1)
    expect(area(j, 'guidelines').files).toBe(1)
    expect(area(j, 'skills').files).toBe(1)
    expect(area(j, 'agent-context').files).toBe(2)
  })

  it('--area limits the report to that area', () => {
    const j = json('--area', 'adr')
    expect(j.areas.map((a: Area) => a.name)).toEqual(['adr'])
    expect(j.total.files).toBe(1)
  })

  it('an unknown area exits 1 and names the valid areas', () => {
    const r = run(root, '--area', 'nope')
    expect(r.code).toBe(1)
    for (const a of AREAS) expect(r.out + r.err).toContain(a)
  })

  it('an area with no files is reported with zeros, never an error', () => {
    const empty = mkdtempSync(join(tmpdir(), 'tokens-empty-'))
    try {
      const r = run(empty, '--json')
      expect(r.code).toBe(0)
      const j = JSON.parse(r.out)
      expect(j.areas).toHaveLength(AREAS.length)
      expect(j.total).toEqual({ files: 0, words: 0, tokens: 0 })
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('is deterministic and sorts items by path', () => {
    const a = run(root, '--json').out
    expect(run(root, '--json').out).toBe(a)
    const paths = area(JSON.parse(a), 'templates').items.map((i: Item) => i.path)
    expect(paths).toEqual([...paths].sort())
  })

  it('skips an unreadable .md entry with a warning on stderr and exits 0', () => {
    mkdirSync(join(root, '.pair/knowledge/guidelines/collaboration/templates/bad.md'), { recursive: true })
    const r = run(root, '--json')
    expect(r.code).toBe(0)
    expect(r.err).toMatch(/bad\.md/)
    expect(area(JSON.parse(r.out), 'templates').files).toBe(2)
  })

  it('prints a human report naming every area and the total when --json is absent', () => {
    const r = run(root)
    expect(r.code).toBe(0)
    for (const a of AREAS) expect(r.out).toContain(a)
    expect(r.out.toLowerCase()).toContain('total')
  })
})
