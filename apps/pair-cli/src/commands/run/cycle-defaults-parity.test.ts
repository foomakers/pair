import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readBlockingSeverities, DEFAULT_BLOCKING_FLOOR } from './blocking-severities'

/**
 * r1-3: the pair-cli reader (`blocking-severities.ts`) and the in-session reader the cycle SKILL
 * documents (ported into `blocking-severities.mjs`, a dependency-free script the SKILL now runs
 * instead of hand-parsing) must resolve the SAME `## Blocking Severities` fixture to the SAME
 * policy — including the KB default when the section (or the file) is absent. Before this test
 * (and the SKILL's own script), nothing checked the two stayed in step: `git grep` found only the
 * prose match `g1-w14` (`/blockingFloor/`), which cannot catch a divergent DEFAULT or grammar edge.
 */

const SCRIPT = join(
  __dirname,
  '../../../../../.claude/skills/pair-workflow-cycle/scripts/blocking-severities.mjs',
)

function inSession(markdown: string | undefined): {
  blockingFloor?: string
  halt?: string
  maxDispatches?: unknown
} {
  if (markdown === undefined) {
    const dir = mkdtempSync(join(tmpdir(), 'us514-parity-'))
    const missing = join(dir, 'automation.md')
    const r = spawnSync(process.execPath, [SCRIPT, 'read', missing], { encoding: 'utf8' })
    rmSync(dir, { recursive: true, force: true })
    return JSON.parse(r.stdout.trim())
  }
  const dir = mkdtempSync(join(tmpdir(), 'us514-parity-'))
  const file = join(dir, 'automation.md')
  writeFileSync(file, markdown)
  const r = spawnSync(process.execPath, [SCRIPT, 'read', file], { encoding: 'utf8' })
  rmSync(dir, { recursive: true, force: true })
  return JSON.parse(r.stdout.trim())
}

function pairCli(markdown: string | undefined): {
  blockingFloor?: string
  halt?: string
  maxDispatches?: unknown
} {
  if (markdown === undefined) return { blockingFloor: DEFAULT_BLOCKING_FLOOR }
  try {
    return readBlockingSeverities(markdown)
  } catch (e) {
    return { halt: String((e as Error).message) }
  }
}

describe('US-514 r1-3: pair-cli reader / in-session reader parity', () => {
  const fixtures: Array<{ name: string; markdown: string | undefined }> = [
    { name: 'absent file', markdown: undefined },
    { name: 'absent section', markdown: '## Something Else\n\nx\n' },
    { name: '`Major`, no ceiling', markdown: '## Blocking Severities\n\nMajor\n' },
    {
      name: '`Major` + `max-dispatches: 40 block`',
      markdown: '## Blocking Severities\n\nMajor\nmax-dispatches: 40 block\n',
    },
    { name: 'empty section ⇒ HALT', markdown: '## Blocking Severities\n\n' },
    {
      name: 'a comma-separated LIST ⇒ HALT',
      markdown: '## Blocking Severities\n\nCritical, Major\n',
    },
  ]

  for (const { name, markdown } of fixtures) {
    it(`${name}: pair-cli and the in-session reader resolve to the SAME policy`, () => {
      const cli = pairCli(markdown)
      const session = inSession(markdown)
      if ('halt' in cli || cli.blockingFloor === undefined) {
        // Both must HALT (never one halting while the other silently defaults).
        expect(session.blockingFloor).toBeUndefined()
      } else {
        expect(session).toEqual(cli)
      }
    })
  }
})
