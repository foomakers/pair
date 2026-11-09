import { InMemoryFileSystemService } from '@pair/content-ops'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleRunCommand, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'

/** US-623 AC9 (review r4-2): `pair run --card` syncs the neutral agents per `pair.config.json` `agents.targets`. */

afterEach(() => vi.restoreAllMocks())

async function run(agents: object | undefined) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'pair-agents-wire-')))
  mkdirSync(join(cwd, '.agents/agents'), { recursive: true })
  writeFileSync(
    join(cwd, '.agents/agents/pair-x.md'),
    '---\nname: pair-x\ndescription: d\ntools: Read\n---\nBody\n',
  )
  const fs = new InMemoryFileSystemService(
    {
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          skills: {
            source: '.skills',
            behavior: 'overwrite',
            description: 'skills',
            prefix: 'pair',
            targets: [{ path: '.claude/skills/', mode: 'canonical' }],
          },
        },
      }),
      [`${cwd}/pair.config.json`]: JSON.stringify(agents ? { agents } : {}),
      [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
      '/bin/claude': '',
    },
    cwd,
    cwd,
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const deps: RunHandlerDependencies = {
    runIteration: async () => ({ outcome: 'success', detail: 'done' }),
    acquireLock: ({ card }) => ({
      kind: 'acquired',
      lock: { path: `/locks/${card}`, release: () => {} },
    }),
    appendAudit: () => {},
    cardReadiness: async () => 'ready',
    driveCycle: async () => ({ status: 'merged', stagesRun: 1, next: { step: 'merge' } }),
  }
  await handleRunCommand(parseRunCommand({ card: '32', cardTags: '' }), fs, deps)
  return cwd
}

describe('US-623 r4-2: run wires the agents sync', () => {
  it('agents.targets [claude, codex] generates both dirs', async () => {
    const cwd = await run({ targets: ['claude', 'codex'] })
    expect(existsSync(join(cwd, '.codex/agents/pair-x.toml'))).toBe(true)
    expect(existsSync(join(cwd, '.claude/agents/pair-x.md'))).toBe(true)
  })
  it('no agents block generates nothing', async () => {
    const cwd = await run(undefined)
    expect(existsSync(join(cwd, '.codex'))).toBe(false)
  })
})
