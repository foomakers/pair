import { InMemoryFileSystemService } from '@pair/content-ops'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleTokensCommand } from './handler'
import type { TokensCommandConfig } from './parser'

const T = '.pair/knowledge/guidelines/collaboration/templates'
const files: Record<string, string> = {
  [`/r/${T}/b.md`]: 'one two three four', // 18 chars -> 5 tokens
  [`/r/${T}/a.md`]: 'x y',
  [`/r/${T}/ignored.txt`]: 'nope',
  '/r/.pair/knowledge/guidelines/testing/README.md': 'g1 g2',
  '/r/.pair/adoption/product/PRD.md': 'p1',
  '/r/.pair/adoption/tech/adr/adr-1.md': 'a',
  '/r/.pair/adoption/decision-log/d.md': 'd',
  '/r/.claude/skills/s/SKILL.md': 'sk',
  '/r/.claude/skills/s/other.md': 'no',
  '/r/AGENTS.md': 'ag',
}
const cfg = (extra: Partial<TokensCommandConfig> = {}): TokensCommandConfig => ({
  command: 'tokens',
  root: '/r',
  json: true,
  ...extra,
})

const run = async (c: TokensCommandConfig, seed: Record<string, string> = files) => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const code = await handleTokensCommand(c, new InMemoryFileSystemService(seed, '/', '/'))
  return { code, out: log.mock.calls.map(x => x[0]).join('\n') }
}

afterEach(() => vi.restoreAllMocks())

describe('handleTokensCommand', () => {
  it('counts words and ceil(chars/4) tokens, items sorted, areas disjoint', async () => {
    const { code, out } = await run(cfg())
    const j = JSON.parse(out)
    expect(code).toBe(0)
    expect(j.areas.map((a: { name: string }) => a.name)).toEqual([
      'templates',
      'adoption',
      'adr',
      'decision-log',
      'skills',
      'guidelines',
      'agent-context',
    ])
    expect(j.areas[0].items).toEqual([
      { path: `${T}/a.md`, words: 2, tokens: 1 },
      { path: `${T}/b.md`, words: 4, tokens: 5 },
    ])
    expect(j.areas[0]).toMatchObject({ files: 2, words: 6, tokens: 6 })
    expect(j.areas.map((a: { files: number }) => a.files)).toEqual([2, 1, 1, 1, 1, 1, 1])
    expect(j.total).toEqual({ files: 8, words: 13, tokens: 6 + 1 + 1 + 1 + 1 + 2 + 1 })
  })

  it('--area limits the report', async () => {
    const { out } = await run(cfg({ area: 'adr' }))
    expect(JSON.parse(out).areas.map((a: { name: string }) => a.name)).toEqual(['adr'])
  })

  it('empty root: zeros, exit 0', async () => {
    const { code, out } = await run(cfg(), { '/r/x.txt': '' })
    expect(code).toBe(0)
    expect(JSON.parse(out).total).toEqual({ files: 0, words: 0, tokens: 0 })
  })

  it('human output has a line per area and a total', async () => {
    const { out } = await run(cfg({ json: false }))
    expect(out).toContain('templates')
    expect(out).toContain('agent-context')
    expect(out.toLowerCase()).toContain('total')
  })
})

const platforms = ['darwin', 'linux', 'win32']

describe('handleTokensCommand platform paths', () => {
  const real = process.platform
  afterEach(() => Object.defineProperty(process, 'platform', { value: real }))

  it.each(platforms)('platform %s: items are root-relative and "/"-separated', async platform => {
    Object.defineProperty(process, 'platform', { value: platform })
    const { out } = await run(cfg({ area: 'templates' }))
    const paths = JSON.parse(out).areas[0].items.map((i: { path: string }) => i.path)
    expect(paths).toEqual([`${T}/a.md`, `${T}/b.md`])
  })
})

describe('handleTokensCommand --baseline', () => {
  const report = (words: number, tokens: number) =>
    JSON.stringify({
      areas: [{ name: 'templates', words, tokens }],
      total: { words, tokens },
    })

  it('r1-g1-w5 partial baseline, no --area: per-area delta where present, no total delta', async () => {
    const { code, out } = await run(cfg({ baseline: 'b.json' }), {
      ...files,
      '/r/b.json': report(10, 4),
    })
    const j = JSON.parse(out)
    expect(code).toBe(0)
    expect(j.areas[0].delta).toEqual({ words: -4, tokens: 2 })
    expect(j.areas[1].delta).toBeUndefined()
    expect(j.total.delta).toBeUndefined()
  })

  it('human output shows signed deltas', async () => {
    const { out } = await run(cfg({ json: false, baseline: 'b.json' }), {
      ...files,
      '/r/b.json': report(10, 4),
    })
    expect(out).toContain('Δ -4 words  +2 tokens')
  })

  it('no baseline: no delta key', async () => {
    const { out } = await run(cfg())
    expect(JSON.parse(out).total).not.toHaveProperty('delta')
  })

  // the unchanged seed corpus as a full `--json` report (r0-1)
  const full = (templates = { words: 6, tokens: 6 }) => {
    const areas = [
      { name: 'templates', ...templates },
      { name: 'adoption', words: 1, tokens: 1 },
      { name: 'adr', words: 1, tokens: 1 },
      { name: 'decision-log', words: 1, tokens: 1 },
      { name: 'skills', words: 1, tokens: 1 },
      { name: 'guidelines', words: 2, tokens: 2 },
      { name: 'agent-context', words: 1, tokens: 1 },
    ]
    return JSON.stringify({ areas, total: sumOf(areas) })
  }
  const sumOf = (rows: { words: number; tokens: number }[]) => ({
    words: rows.reduce((n, r) => n + r.words, 0),
    tokens: rows.reduce((n, r) => n + r.tokens, 0),
  })

  it('r1-g1-c1 no --area, unchanged corpus: total delta 0', async () => {
    const { out } = await run(cfg({ baseline: 'b.json' }), { ...files, '/r/b.json': full() })
    expect(JSON.parse(out).total.delta).toEqual({ words: 0, tokens: 0 })
  })

  it('r1-g1-w1 --area + baseline of the unchanged corpus: total delta 0', async () => {
    const { code, out } = await run(cfg({ area: 'adr', baseline: 'b.json' }), {
      ...files,
      '/r/b.json': full(),
    })
    expect(code).toBe(0)
    expect(JSON.parse(out).total.delta).toEqual({ words: 0, tokens: 0 })
  })

  it('r1-g1-w2 --area: total delta is the selected area delta', async () => {
    const { out } = await run(cfg({ area: 'templates', baseline: 'b.json' }), {
      ...files,
      '/r/b.json': full({ words: 10, tokens: 4 }),
    })
    const j = JSON.parse(out)
    expect(j.areas[0].delta).toEqual({ words: -4, tokens: 2 })
    expect(j.total.delta).toEqual({ words: -4, tokens: 2 })
  })

  it('r1-g1-w3 --area human output: total line shows a zero delta', async () => {
    const { out } = await run(cfg({ json: false, area: 'adr', baseline: 'b.json' }), {
      ...files,
      '/r/b.json': full(),
    })
    const total = out.split('\n').find(l => l.startsWith('total'))
    expect(total).toContain('Δ 0 words  0 tokens')
  })

  it('r1-g1-b1 --area absent from the baseline: no total delta', async () => {
    const { out } = await run(cfg({ area: 'adr', baseline: 'b.json' }), {
      ...files,
      '/r/b.json': report(10, 4),
    })
    const j = JSON.parse(out)
    expect(j.areas[0].delta).toBeUndefined()
    expect(j.total.delta).toBeUndefined()
  })

  it('missing or malformed baseline: exit 1', async () => {
    expect((await run(cfg({ baseline: 'nope.json' }))).code).toBe(1)
    expect(
      (await run(cfg({ baseline: 'b.json' }), { ...files, '/r/b.json': '{"x":1}' })).code,
    ).toBe(1)
  })
})
