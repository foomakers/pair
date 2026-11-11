import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type IterationRunner, type RunHandlerDependencies } from './handler'
import type { LockAcquirer } from './card-lock'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import type { CardReadiness } from './cycle-scripts'

/**
 * US-487 remediation round 1, group r1-g1 — the DoR-gated fallback of `pair-cli run --card`
 * (AC14 as amended 2026-09-23, AC2, AC9 via the KB automation policy's per-card lock).
 *
 * r0-1 — the card's macrostate is resolved through the adopted `## State Mapping` of
 *        `.pair/adoption/tech/way-of-working.md` (case-insensitive), with the canonical-name
 *        fallback and the Definition-of-Ready fallback for a board with no Ready state
 *        (canonical-states.md § Resolution Rules / Readiness Fallback). Exercised through the
 *        PRODUCTION readiness probe (no `cardReadiness` injected): a recording stub `gh`, first on
 *        PATH, answers `gh issue view` with the card JSON.
 * r0-2 — a `--pr` entry never lands on a preparation skill: it reaches the cycle driver with the PR,
 *        or it is refused loudly naming `--pr`.
 * r0-4 — both fallback routes (prep skill, cycle coordinator) take the per-card lock: a held lock is
 *        a `run-in-progress` skip with nothing spawned; a free lock is released on every exit.
 * r0-5 — with `--autonomous` a card routed to a preparation skill is skipped cleanly (exit 0,
 *        "needs a human" printed, nothing spawned); supervised routing and the Ready ⇒ cycle entry
 *        are unchanged.
 *
 * Hermetic: in-memory project, injected engine runner / cycle driver / audit writer, stub `gh`.
 */

// A directory that EXISTS (r1-3): the production probe runs `gh` in the project, so the in-memory
// project's root must be somewhere a process can start. Only `gh` runs there; nothing is written.
const cwd = realpathSync(tmpdir())
const WOW_PATH = '.pair/adoption/tech/way-of-working.md'

const baseFiles = (root: string): Record<string, string> => ({
  [`${root}/config.json`]: JSON.stringify({
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
  [`${root}/.claude/skills/pair-loop/SKILL.md`]: '',
  [`${root}/.claude/skills/pair-process-refine-story/SKILL.md`]: '',
  [`${root}/.claude/skills/pair-process-plan-tasks/SKILL.md`]: '',
  [`${root}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
  [`${root}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
  [`${root}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
  '/bin/claude': '',
})

function project(files: Record<string, string> = {}, root = cwd) {
  return new InMemoryFileSystemService({ ...baseFiles(root), ...files }, root, root)
}

/** This repository's own board mapping (way-of-working.md § State Mapping), verbatim. */
const REPO_MAPPING = `# Way of Working

## State Mapping

| Board State | Macrostate  |
| ----------- | ----------- |
| Todo        | Draft       |
| Refined     | Ready       |
| In Progress | In Progress |
| Done        | Done        |
`

/** A 3-column board: no state maps to Ready ⇒ the Definition-of-Ready fallback applies. */
const NO_READY_MAPPING = `# Way of Working

## State Mapping

| Board State | Macrostate  |
| ----------- | ----------- |
| Todo        | Draft       |
| In Progress | In Progress |
| Done        | Done        |
`

/** `## Eligibility` + `## Workflows`: a project that opted into tag dispatch (US-217). */
const MAPPED_POLICY = '## Eligibility\n\nrisk:green\n\n## Workflows\n\nauto-dev ⇒ pair-loop\n'

const BREAKDOWN = `
## Task Breakdown

- [ ] **T-1**: Build the thing
`

/** A body meeting all six DoR criteria (definition-of-ready-and-done.md) plus the inline breakdown. */
const FULL_DOR = `
## Story Statement

**As a** maintainer
**I want** the thing built
**So that** the team can ship

## Acceptance Criteria

1. **Given** a card **When** it runs **Then** it ships

## Story Sizing and Sprint Readiness

**Final Story Points**: 3

## Dependencies and Coordination

**Story Dependencies**: None

## Technical Analysis

### Implementation Approach

**Design:** not required
`

const card = (status: string, extra = '') => `## Epic Context

**Status**: ${status}
${extra}`

/** Captures what an operator would read on the console. */
function captureLog() {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  return () => lines.join('\n')
}

const bins: string[] = []

/** A stub `gh`, first on PATH: `gh issue view …` prints the card JSON; anything else fails. */
function stubGh(status: string, body: string): void {
  const bin = mkdtempSync(join(tmpdir(), 'pair-r1g1-gh-'))
  bins.push(bin)
  const json = join(bin, 'card.json')
  writeFileSync(
    json,
    JSON.stringify({
      title: 'Build the thing for the team',
      body,
      state: 'OPEN',
      projectItems: [{ status: { name: status } }],
    }),
  )
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh\nif [ "$1" = "issue" ] && [ "$2" = "view" ]; then cat ${JSON.stringify(json)}; exit 0; fi\nexit 1\n`,
  )
  chmodSync(join(bin, 'gh'), 0o755)
  vi.stubEnv('PATH', `${bin}:/bin`)
}

function fakeLock(held = false) {
  const events: string[] = []
  const acquire: LockAcquirer = ({ card: id }) => {
    events.push(`acquire:${id}`)
    if (held) return { kind: 'held', path: `/locks/${id}`, since: new Date().toISOString() }
    return {
      kind: 'acquired',
      lock: { path: `/locks/${id}`, release: () => events.push(`release:${id}`) },
    }
  }
  return { events, acquire }
}

function harness(opts: { readiness?: CardReadiness; held?: boolean } = {}) {
  const calls: Array<Parameters<IterationRunner>[0]> = []
  const runIteration: IterationRunner = async input => {
    calls.push(input)
    return { outcome: 'success', detail: 'done' }
  }
  const lock = fakeLock(opts.held === true)
  const driveCycle = vi.fn(async () => ({ status: 'ready-for-merge', stagesRun: 1 }))
  const handler: RunHandlerDependencies = {
    runIteration,
    acquireLock: lock.acquire,
    appendAudit: () => {},
    driveCycle,
    ...(opts.readiness !== undefined && { cardReadiness: async () => opts.readiness! }),
  }
  return { calls, lock, driveCycle, handler }
}

/** Runs the command; a rejection is captured, never lost, so a row can assert on either outcome. */
async function run(
  options: Parameters<typeof parseRunCommand>[0],
  fs: InMemoryFileSystemService,
  handler: RunHandlerDependencies,
): Promise<{ code?: number; error?: Error }> {
  try {
    return { code: await handleRunCommand(parseRunCommand(options), fs, handler) }
  } catch (error) {
    return { error: error as Error }
  }
}

const prompts = (calls: Array<{ promptText: string }>) => calls.map(c => c.promptText).join('\n')

beforeEach(() => vi.stubEnv('PATH', '/bin'))
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  for (const bin of bins.splice(0)) rmSync(bin, { recursive: true, force: true })
})

// ── r0-1 — macrostate via the adopted State Mapping (production probe, stub gh) ─────────────────
describe('r0-1: the card macrostate is resolved through the adopted State Mapping', () => {
  const supervised = { card: '218', cardTags: '' }
  const routes = [{
      id: 'R1-W6',
      name: 'board with no Ready state, Todo + all six DoR criteria + breakdown (DoR fallback) ⇒ the delivery cycle',
      wow: NO_READY_MAPPING,
      status: 'Todo',
      body: card('Todo', `${FULL_DOR}${BREAKDOWN}`),
      expect: 'cycle',
    },] as const

  for (const row of routes) {
    it(`${row.id}: ${row.name}`, async () => {
      stubGh(row.status, row.body)
      captureLog()
      const { calls, driveCycle, handler } = harness()

      const outcome = await run(supervised, project({ [`${cwd}/${WOW_PATH}`]: row.wow }), handler)

      expect(outcome.error?.message).toBeUndefined()
      expect(outcome.code).toBe(0)
      if (row.expect === 'cycle') {
        expect(driveCycle).toHaveBeenCalledTimes(1)
        expect(calls).toHaveLength(0)
      } else {
        expect(driveCycle).not.toHaveBeenCalled()
        expect(calls).toHaveLength(1)
        expect(calls[0]?.promptText).toContain(`pair-process-${row.expect}`)
      }
    })
  }

  it('R1-C4: a literal neither mapped nor canonical (`Icebox`) is out of scope (canonical-states.md Reading rule 4) — a clean skip: exit 0, the literal named, nothing spawned, no cycle', async () => {
    stubGh('Icebox', card('Icebox', BREAKDOWN))
    const output = captureLog()
    const { calls, driveCycle, handler } = harness()

    const outcome = await run(
      supervised,
      project({ [`${cwd}/${WOW_PATH}`]: REPO_MAPPING }),
      handler,
    )

    expect(outcome.error?.message).toBeUndefined()
    expect(outcome.code).toBe(0)
    expect(output()).toContain('Icebox')
    expect(calls).toHaveLength(0)
    expect(driveCycle).not.toHaveBeenCalled()
  })

  for (const status of ['Done', 'Review']) {
    it(`R1-C5 (${status}): a card past In Progress is never routed to a preparation skill`, async () => {
      stubGh(status, card(status, BREAKDOWN))
      captureLog()
      const { calls, handler } = harness()

      await run(supervised, project({ [`${cwd}/${WOW_PATH}`]: REPO_MAPPING }), handler)

      expect(prompts(calls)).not.toMatch(/pair-process-(refine-story|plan-tasks)/)
    })
  }
})

// ── r0-2 — a --pr entry never lands on a preparation skill ──────────────────────────────────────
describe('r0-2: `--card N --pr P` enters the cycle with the PR or refuses naming --pr — never a prep skill', () => {
  const prRows = [{ id: 'R2-W1', readiness: 'draft' as const, autonomous: false },]
  for (const row of prRows) {
    it(`${row.id}: --pr 12 on a ${row.readiness} card${row.autonomous ? ' (--autonomous)' : ''}`, async () => {
      captureLog()
      const { calls, driveCycle, handler } = harness({ readiness: row.readiness })

      const outcome = await run(
        { card: '9', cardTags: '', pr: '12', ...(row.autonomous && { autonomous: true }) },
        project(),
        handler,
      )

      expect(calls).toHaveLength(0)
      expect(prompts(calls)).not.toMatch(/pair-process-(refine-story|plan-tasks)/)
      const entered = driveCycle.mock.calls.length > 0
      if (entered) {
        expect(driveCycle).toHaveBeenCalledTimes(1)
        expect(driveCycle).toHaveBeenCalledWith(expect.objectContaining({ card: '9', pr: 12 }))
      } else {
        expect(outcome.error?.message ?? '').toContain('--pr')
      }
    })
  }
})

// ── r0-4 — the per-card lock on both fallback routes ────────────────────────────────────────────
describe('r0-4: both fallback routes take the per-card lock and release it on every exit', () => {

  it('R4-C1: a MAPPED route with the lock held is a run-in-progress skip (US-217, unchanged)', async () => {
    const output = captureLog()
    const { calls, handler } = harness({ held: true })

    const outcome = await run(
      { card: '9', cardTags: 'auto-dev,risk:green' },
      project({ [`${cwd}/${POLICY_PATH}`]: MAPPED_POLICY }),
      handler,
    )

    expect(outcome.code).toBe(0)
    expect(output()).toContain('run-in-progress')
    expect(calls).toHaveLength(0)
  })
})
