import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HARNESS_SURFACE_MAP, requiredHandles, resolveRealization } from '../tools/codex-fanout'

/**
 * Conformance for the fan-out capability's SECOND in-harness realization.
 *
 * Three families of assertion, all of them about properties a reader would otherwise have to
 * take on trust:
 *
 * - CONTAINMENT — the vendor's tool handles and config keys appear in the surface map and
 *   nowhere else. That is the whole claim of the anti-corruption layer, and it is the one
 *   claim prose cannot keep: a handle inlined into a step reads perfectly well right up to
 *   the release that renames it.
 * - ZERO MERIT LOGIC — the realization dispatches; it does not decide what to work on. The
 *   skill's own core rule says so, so the new section must not smuggle a selection or
 *   classification criterion in behind it.
 * - REGRESSION BY ABSENCE — nothing about the Claude realization or the distribution targets
 *   moved. Both are guarantees that something did NOT change, which is exactly the kind of
 *   guarantee that decays silently without an assertion.
 */

const REPO_ROOT = join(__dirname, '../../../..')
const SKILL_COPIES = [
  join(REPO_ROOT, 'packages/knowledge-hub/dataset/.skills/loop/SKILL.md'),
  join(REPO_ROOT, '.claude/skills/pair-loop/SKILL.md'),
]
const MODULE = join(REPO_ROOT, 'packages/knowledge-hub/src/tools/codex-fanout.ts')
const CLI_CONFIG = join(REPO_ROOT, 'apps/pair-cli/config.json')

const read = (path: string): string => readFileSync(path, 'utf8')

/**
 * The distinctive vendor tokens: handles and config keys that belong to ONE product.
 *
 * Bare `spawn` and `wait` are deliberately NOT here even though they are the second
 * toolset's handle names: they are also the capability's own vocabulary ("the bound spawn
 * handle"), so banning them would ban the sentences that explain the mechanism rather than
 * the coupling. Every token below is unambiguous — none of them is a word the capability
 * would use for itself.
 */
const VENDOR_TOKENS = [
  'spawn_agent',
  'wait_agent',
  'send_input',
  'resume_agent',
  'close_agent',
  'list_agents',
  'send_message',
  'followup_task',
  'interrupt_agent',
  'multi_agent',
  'max_concurrent_threads_per_session',
  'tool_namespace',
  'min_wait_timeout_ms',
  'max_wait_timeout_ms',
  'default_wait_timeout_ms',
]

describe('containment — the vendor surface lives in the map and nowhere else', () => {
  it('names every known handle and bounding key inside the map', () => {
    const declared = new Set<string>()
    for (const realization of HARNESS_SURFACE_MAP) {
      requiredHandles(realization.handles).forEach(h => declared.add(h))
      declared.add(realization.gating.featureKey.split('.').pop() as string)
      const bounding = realization.bounding
      if (!bounding) continue
      declared.add(bounding.concurrencyKey.split('.').pop() as string)
      Object.values(bounding.waitTimeoutKeys ?? {}).forEach(k =>
        declared.add(k.split('.').pop() as string),
      )
    }
    expect(declared).toContain('spawn_agent')
    expect(declared).toContain('wait_agent')
    expect(declared).toContain('max_concurrent_threads_per_session')
  })

  it.each(SKILL_COPIES)('the skill carries no vendor handle or config key — %s', path => {
    const text = read(path)
    const leaked = VENDOR_TOKENS.filter(token => text.includes(token))
    expect(leaked).toEqual([])
  })

  it('the module carries no vendor token outside its surface-map section', () => {
    const source = read(MODULE)
    const end = source.indexOf('// 2. PROBE → BIND → ANNOUNCE → DEGRADE')
    expect(end).toBeGreaterThan(0)
    const logic = source.slice(end)
    const leaked = VENDOR_TOKENS.filter(token => logic.includes(token))
    expect(leaked).toEqual([])
  })

  it('a renamed handle is a data edit — the cascade reads the map, never a literal', () => {
    // The probe of a session exposing a hypothetical renamed handle misses, because the map
    // is what declares the names. That is the intended failure mode: fail-closed, then a
    // one-line data edit, never a hunt through the logic.
    expect(resolveRealization({ tools: ['spawn_worker', 'await_worker'] }).tier).toBe(3)
  })
})

describe('zero merit logic — the realization dispatches, it never selects', () => {
  const FORBIDDEN = [
    /\brisk:(green|yellow|red)\b/,
    /\bstory points\b/i,
    /\bseverity floor\b/i,
    /\bthis skill (may|should) merge\b/i,
  ]

  it.each(SKILL_COPIES)('the Codex section introduces no criterion of its own — %s', path => {
    const text = read(path)
    const start = text.indexOf('## Step 1b: Codex In-Harness Fan-Out')
    const end = text.indexOf('## Boundaries')
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const section = text.slice(start, end)
    for (const pattern of FORBIDDEN) expect(section).not.toMatch(pattern)
  })

  it.each(SKILL_COPIES)(
    'defers eligibility, the predicate and auto-advance to the policy — %s',
    path => {
      const text = read(path)
      expect(text).toContain('it selects nothing, classifies nothing, and adds no policy parameter')
      expect(text).toContain(
        'auto-advance stay exactly where Step 0 and the automation policy put them',
      )
    },
  )

  it('the module owns no policy knob — its ceilings are all passed in', () => {
    const source = read(MODULE)
    expect(source).not.toMatch(/const\s+(MAX_PARALLELISM|DEFAULT_PARALLELISM|ELIGIBILITY)/)
    expect(source).toContain('It selects no card, classifies nothing, and owns no policy knob')
  })
})

describe('regression by absence — the Claude realization and distribution are untouched', () => {
  it.each(SKILL_COPIES)('still delegates the whole unattended run to the workflow — %s', path => {
    const text = read(path)
    expect(text).toContain('hand the entire unattended run to the runtime the binding named')
    expect(text).toContain('the `pair-loop` workflow')
    // The argument list the workflow validates by type and content is the Claude realization's
    // whole interface; a story that touched it would be changing that realization, not adding one.
    expect(text).toContain(
      '{ policyText, root, overrides, predicateOverride, startIteration, tagProjectionFamily }',
    )
  })

  it('binds a Claude Code session to the workflow realization, exactly as before this story', () => {
    // This assertion used to read `tier: 3`, freezing the regression AC11 forbids: the map held
    // only the Codex entries, so the `bind` every session is told to run answered a Claude
    // session `degraded-one-card`. The skill then printed and AUDITED "no fan-out primitive is
    // exposed in this session" on a run that fanned out through the workflow, and the step
    // guarded by "the probe missed" was true at the same time as the in-harness step.
    const binding = resolveRealization({ tools: ['Workflow', 'Task', 'Read', 'Bash'] })
    expect(binding.realization).toBe('claude-code-workflow')
    expect(binding.tier).toBe(1)
    expect(binding.dispatch).toBe('delegated-run')
    expect(binding.primitive).toBe('Workflow')
  })

  it('never binds a Codex realization for a session without Codex’s tools', () => {
    for (const tools of [
      ['Workflow', 'Task', 'Read', 'Bash'],
      ['Read', 'Bash'],
    ])
      expect(resolveRealization({ tools }).realization).not.toContain('codex')
    expect(resolveRealization({ tools: ['Read', 'Bash'] }).tier).toBe(3)
  })

  it.each(SKILL_COPIES)(
    'routes on the BINDING’s dispatch shape, never on a product name — %s',
    path => {
      const text = read(path)
      const start = text.indexOf('## Step 1: Realization')
      const end = text.indexOf('## Step 1b:')
      const step = text.slice(start, end)
      expect(step).toContain('`delegated-run`')
      expect(step).toContain('`spawn-wait`')
      // The branch conditions must be the bind result's, not "Act — Claude"/"Act — Codex".
      expect(step).not.toMatch(/\*\*Act — (Claude|Codex)/)
    },
  )

  it('writes no `.codex/` distribution target — Codex reads the shared symlink and AGENTS.md', () => {
    const config = JSON.parse(read(CLI_CONFIG)) as {
      asset_registries: Record<string, { targets: { path: string }[] }>
    }
    const targets = Object.values(config.asset_registries).flatMap(r => r.targets.map(t => t.path))
    expect(targets.filter(t => t.startsWith('.codex'))).toEqual([])
    expect(targets).toContain('.agents/skills/')
    expect(targets).toContain('AGENTS.md')
  })

  it('ships the fan-out asset through the knowledge registry, adding no registry of its own', () => {
    const config = JSON.parse(read(CLI_CONFIG)) as {
      asset_registries: Record<string, { source: string; targets: { path: string }[] }>
    }
    expect(Object.keys(config.asset_registries).sort()).toEqual([
      'adoption',
      'agent-definitions',
      'agents',
      'github',
      'knowledge',
      'skills',
      'workflows',
    ])
    expect(config.asset_registries.knowledge?.source).toBe('.pair/knowledge')
  })
})
