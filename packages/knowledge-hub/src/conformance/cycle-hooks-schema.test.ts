import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'

// US-489 T-1: the `## Cycle Hooks` schema is pattern-based. The stage ids come from
// `cycle-state.mjs` (the authority) — this guard fails when a stage is added there and the
// schema's table of hook names does not follow, so no hand-kept list can fall out of sync.

const REPO_ROOT = join(__dirname, '../../../..')
const POLICY_REL = '.pair/knowledge/guidelines/collaboration/automation/automation-policy.md'
const CYCLE_STATE = join(__dirname, '../../dataset/.skills/workflow/cycle/scripts/cycle-state.mjs')

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
    for (const name of ['pre-cycle', 'post-cycle', 'on-halt'])
      expect(section).toContain(`\`${name}\``)
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

  it('the per-phase usage table covers every hook point, and each type has a worked example', async () => {
    const usage = section.slice(section.indexOf('### Hook points and their typical use'))
    const points = ['pre-cycle', 'post-cycle', 'on-halt']
    for (const id of await stageIds()) points.push(`pre-${id}`, `post-${id}`)
    const rows = usage.split('\n').filter(line => line.startsWith('|'))
    for (const point of points) {
      const covered = rows.some(
        row =>
          row.includes(`\`${point}\``) || row.includes(`\`${point.split('-')[0]}-<stage-id>\``),
      )
      expect(covered, point).toBe(true)
    }
    for (const type of ['pre-cycle', 'pre-verify', 'post-implement', 'post-cycle', 'on-halt'])
      expect(usage, type).toMatch(new RegExp(`^- \`${type}\`: \``, 'm'))
  })

  it('states absent ⇒ no hooks and pre-* blocks while post-*/on-halt never do', () => {
    expect(section).toMatch(/absent[^\n]*⇒ no hooks/i)
    expect(section).toMatch(/never a HALT/)
    expect(section).toMatch(/HALTs the cycle before the stage runs/)
  })
})

// US-489 review r0-1: a STAGE hook (`pre-<stage-id>` / `post-<stage-id>`) gates the tree that stage
// works on — the STORY worktree — never the developer's main checkout; a verify hook gates the
// story worktree at the PR head, not the detached review worktree the verify agent creates itself.
describe.each(Object.entries(policies))('r0-1: ## Cycle Hooks run location (%s)', (_n, path) => {
  const doc = readFileSync(path, 'utf-8')
  const section = doc.slice(doc.indexOf('\n## Cycle Hooks'), doc.indexOf('\n## Related'))
  const lines = section.split('\n')

  it('g1-w6: states that stage hooks run in the story worktree, not that every command runs in the main checkout', () => {
    expect(section).not.toMatch(/Commands run in the repo root \(the main checkout\)/)
    expect(
      lines.some(line => line.includes('<stage-id>') && /story worktree/i.test(line)),
      'no line ties `pre-<stage-id>`/`post-<stage-id>` to the story worktree',
    ).toBe(true)
  })

  it('g1-w6 (verify): states that a verify hook gates the story worktree at the PR head, not the review worktree', () => {
    expect(
      lines.some(
        line =>
          /verify/.test(line) &&
          /story worktree/i.test(line) &&
          /PR head/i.test(line) &&
          /review worktree/i.test(line),
      ),
      'no line states that `pre-verify`/`post-verify` gate the story worktree at the PR head (not the review worktree)',
    ).toBe(true)
    expect(section).not.toMatch(/`(pre|post)-verify`[^.\n]*runs? in the review worktree/i)
  })

  it('g1-w7: the pre-cycle example does not promise to fix the judged tree while it runs in the main checkout', () => {
    const preCycleInWorktree = lines.some(
      line => line.includes('`pre-cycle`') && /(story|stage)[’']?s? worktree/i.test(line),
    )
    if (preCycleInWorktree) return
    expect(section).not.toMatch(/`pre-cycle` fixes the tree once before any stage judges it/)
    expect(section).not.toMatch(/^- `pre-cycle`: `pnpm mirrors:regenerate`/m)
  })
})

// US-489 PR analysis — the PUBLIC page (`apps/website/.../adoption-files.mdx`) must say what the KB
// schema says: where each hook kind runs (r0-1) and the AC9 per-hook timeout. It describes the
// `pre-<stage-id>` pattern and never hand-lists the stage ids (`cycle-state.mjs` is the authority;
// a hand-kept list drifts the day a stage is added).
describe('US-489: adoption-files.mdx ## Cycle Hooks conformance', () => {
  const page = readFileSync(
    join(REPO_ROOT, 'apps/website/content/docs/concepts/adoption-files.mdx'),
    'utf-8',
  )
  const start = page.indexOf('**`## Cycle Hooks`**')
  const section = page.slice(start, page.indexOf('\n### ', start))
  const lines = section.split('\n')

  it('d-c1 (control): the section exists and names pre-cycle, post-cycle, on-halt', () => {
    expect(start).toBeGreaterThan(-1)
    for (const name of ['pre-cycle', 'post-cycle', 'on-halt'])
      expect(section).toContain(`\`${name}\``)
  })

  it('d-c2 (control): states the `pre-<stage-id>` / `post-<stage-id>` pattern', () => {
    expect(section).toContain('`pre-<stage-id>`')
    expect(section).toContain('`post-<stage-id>`')
  })

  it('d-w1: states that stage hooks run in the story worktree', () => {
    expect(
      lines.some(line => line.includes('<stage-id>') && /story worktree/i.test(line)),
      'no line ties `pre-<stage-id>`/`post-<stage-id>` to the story worktree',
    ).toBe(true)
  })

  it('d-w2: states that a verify hook runs in the story worktree at the PR head', () => {
    expect(
      lines.some(
        line => /verify/.test(line) && /story worktree/i.test(line) && /PR head/i.test(line),
      ),
      'no line states that a verify hook runs in the story worktree at the PR head',
    ).toBe(true)
  })

  it('d-w3: states that pre-cycle, post-cycle and on-halt run in the main checkout', () => {
    for (const name of ['pre-cycle', 'post-cycle', 'on-halt'])
      expect(
        lines.some(line => line.includes(`\`${name}\``) && /main checkout/i.test(line)),
        `no line says \`${name}\` runs in the main checkout`,
      ).toBe(true)
  })

  it('d-w4: documents the AC9 `timeout` key, its default and that `0` disables it', async () => {
    const { DEFAULT_TIMEOUT } = (await import(
      pathToFileURL(join(__dirname, '../../dataset/.skills/workflow/cycle/scripts/cycle-hooks.mjs'))
        .href
    )) as { DEFAULT_TIMEOUT: number }
    const timeoutLines = lines.filter(line => line.includes('`timeout`'))
    expect(timeoutLines.length, 'the `timeout` key is not documented').toBeGreaterThan(0)
    const text = timeoutLines.join('\n')
    expect(text, `default ${DEFAULT_TIMEOUT}`).toContain(String(DEFAULT_TIMEOUT))
    expect(text).toMatch(/`0`[^\n]*(disabl|no timeout)/i)
  })

  it('d-w5: does not hand-list the stage ids', async () => {
    const listed = (await stageIds()).filter(id => section.includes(`\`${id}\``))
    expect(listed.length, `hand-listed stage ids: ${listed.join(', ')}`).toBeLessThan(3)
  })
})
