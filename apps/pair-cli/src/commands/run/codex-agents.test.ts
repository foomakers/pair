import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

import { syncCodexAgents, toCodexRole } from './codex-agents'

const md = (tools: string) =>
  `---\nname: pair-x\ndescription: Does x\nmodel: sonnet\ntools: ${tools}\n---\n\nBody line\n'''quoted'''\n`

describe('US-623 AC9 codex agents', () => {
  it('maps name, description, body; read-only without Edit/Write', () => {
    const t = toCodexRole(md('Read, Grep'))
    expect(t).toContain('name = "pair-x"')
    expect(t).toContain('description = "Does x"')
    expect(t).toContain('sandbox_mode = "read-only"')
    expect(t).toContain('Body line')
    expect(t).not.toContain('model')
  })
  it('workspace-write when tools include Edit', () => {
    expect(toCodexRole(md('Read, Edit'))).toContain('sandbox_mode = "workspace-write"')
  })
  it('keeps a body containing triple quotes valid (basic string, escaped)', () => {
    expect(toCodexRole(md('Read'))).toContain('developer_instructions = "Body line\\n')
  })
  it('syncs only listed targets; codex writes .toml per agent', () => {
    const root = mkdtempSync(join(tmpdir(), 'ca-'))
    mkdirSync(join(root, '.claude/agents'), { recursive: true })
    writeFileSync(join(root, '.claude/agents/pair-x.md'), md('Read'))
    expect(syncCodexAgents(root, '.claude/agents', ['claude'])).toEqual([])
    expect(syncCodexAgents(root, '.claude/agents', ['claude', 'codex'])).toEqual(['pair-x.toml'])
    expect(readdirSync(join(root, '.codex/agents'))).toEqual(['pair-x.toml'])
    expect(readFileSync(join(root, '.codex/agents/pair-x.toml'), 'utf8')).toContain('"pair-x"')
  })
})
