import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

import { syncAgents, syncAgentsFromConfig, toCodexRole } from './codex-agents'

const REPO = join(__dirname, '..', '..', '..', '..', '..')
const md = (tools: string, desc = 'Does x') =>
  `---\nname: pair-x\ndescription: ${desc}\nmodel: sonnet\ntools: ${tools}\n---\n\nBody line\n'''quoted'''\n`
const project = (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), 'ca-'))
  mkdirSync(join(root, '.agents/agents'), { recursive: true })
  for (const [f, t] of Object.entries(files)) writeFileSync(join(root, '.agents/agents', f), t)
  return root
}

describe('US-623 AC9 neutral agents -> per-engine dirs', () => {
  it('maps name, description, body; read-only without Edit/Write', () => {
    const t = toCodexRole(md('Read, Grep'))
    expect(t).toContain('name = "pair-x"')
    expect(t).toContain('sandbox_mode = "read-only"')
    expect(t).toContain('developer_instructions = "Body line\\n')
    expect(toCodexRole(md('Read, Edit'))).toContain('workspace-write')
  })
  it('r4-3: CRLF and folded description parse; missing name is a clear error', () => {
    expect(toCodexRole(md('Read').replace(/\n/g, '\r\n'))).toContain('name = "pair-x"')
    const folded = `---\nname: pair-x\ndescription: >\n  one\n  two\n---\nB\n`
    expect(toCodexRole(folded)).toContain('description = "one two"')
    expect(() => toCodexRole('no frontmatter')).toThrow(/needs frontmatter with a name/)
  })
  it('generates only the listed targets', () => {
    const root = project({ 'pair-x.md': md('Read') })
    expect(syncAgents(root, []).written).toEqual([])
    expect(syncAgents(root, ['claude']).written).toEqual(['.claude/agents/pair-x.md'])
    expect(existsSync(join(root, '.codex'))).toBe(false)
    syncAgents(root, ['claude', 'codex'])
    expect(readFileSync(join(root, '.claude/agents/pair-x.md'), 'utf8')).toBe(md('Read'))
    expect(readdirSync(join(root, '.codex/agents'))).toEqual(['pair-x.toml'])
  })
  it('r4-2: a bad file is skipped, the rest is written; no source dir is a no-op', () => {
    const root = project({ 'bad.md': 'x', 'pair-x.md': md('Read') })
    const r = syncAgents(root, ['codex'])
    expect(r.written).toEqual(['.codex/agents/pair-x.toml'])
    expect(r.skipped[0]).toMatch(/^bad\.md:/)
    expect(syncAgents(mkdtempSync(join(tmpdir(), 'ca-')), ['codex'])).toEqual({
      written: [],
      skipped: [],
    })
  })
  it('config: absent agents.targets generates nothing', () => {
    const root = project({ 'pair-x.md': md('Read') })
    expect(syncAgentsFromConfig({}, root).written).toEqual([])
    expect(syncAgentsFromConfig({ agents: { targets: ['codex'] } }, root).written).toHaveLength(1)
  })
  it('drift: repo generated dirs equal the neutral source', () => {
    const src = join(REPO, '.agents/agents')
    for (const f of readdirSync(src)) {
      const text = readFileSync(join(src, f), 'utf8')
      expect(readFileSync(join(REPO, '.claude/agents', f), 'utf8')).toBe(text)
      expect(readFileSync(join(REPO, '.codex/agents', f.replace(/\.md$/, '.toml')), 'utf8')).toBe(
        toCodexRole(text),
      )
    }
  })
})
