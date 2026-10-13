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
