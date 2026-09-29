import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'

// US-489 T-1: the `## Cycle Hooks` schema is pattern-based. The stage ids come from
// `cycle-state.mjs` (the authority) — this guard fails when a stage is added there and the
// schema's table of hook names does not follow, so no hand-kept list can fall out of sync.

const REPO_ROOT = join(__dirname, '../../../..')
const POLICY_REL = '.pair/knowledge/guidelines/collaboration/automation/automation-policy.md'
const CYCLE_STATE = join(
  __dirname,
  '../../dataset/.skills/workflow/cycle/scripts/cycle-state.mjs',
)

const policies = {
  dataset: join(__dirname, '../../dataset', POLICY_REL),
  mirror: join(REPO_ROOT, POLICY_REL),
}

async function stageIds(): Promise<string[]> {
  const mod = (await import(pathToFileURL(CYCLE_STATE).href)) as { STEPS: string[] }
  return mod.STEPS.filter(step => step !== 'done' && step !== 'blocked')
}

describe.each(Object.entries(policies))('US-489 T-1: ## Cycle Hooks schema (%s)', (_name, path) => {
  const doc = readFileSync(path, 'utf-8')
  const section = doc.slice(doc.indexOf('\n## Cycle Hooks'), doc.indexOf('\n## Related'))

  it('documents the section and the three names outside the per-stage pattern', () => {
    expect(section).toContain('## Cycle Hooks')
    for (const name of ['pre-cycle', 'post-cycle', 'on-halt']) expect(section).toContain(`\`${name}\``)
  })

  it('states the pattern pre-<stage-id>/post-<stage-id>, not a fixed enum', () => {
    expect(section).toContain('`pre-<stage-id>`')
    expect(section).toContain('`post-<stage-id>`')
  })

  it('has a pre-/post- entry for every stage id cycle-state.mjs enumerates', async () => {
    const ids = await stageIds()
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      expect(section, `pre-${id}`).toContain(`\`pre-${id}\``)
      expect(section, `post-${id}`).toContain(`\`post-${id}\``)
    }
  })

  it('states absent ⇒ no hooks and pre-* blocks while post-*/on-halt never do', () => {
    expect(section).toMatch(/absent[^\n]*⇒ no hooks/i)
    expect(section).toMatch(/never a HALT/)
    expect(section).toMatch(/HALTs the cycle before the stage runs/)
  })
})
