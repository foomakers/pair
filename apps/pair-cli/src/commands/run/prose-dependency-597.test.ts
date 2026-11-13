import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import type { LockAcquirer } from './card-lock'
import type { CardProcessRunner } from './parallel'
import type { RootCandidate } from './root-plan'

/**
 * US-597 AC1/AC3/AC5 (r3, r0-3) — selection-to-child integration: a card whose body declares a PROSE dependency on an
 * open card is excluded before any child (refine/plan/implement) starts, with the exact id and reason in the console
 * and the audit; an independent card still runs. `prereq-state` is the script's real grammar over a host fixture.
 */
const SCRIPT = join(
  __dirname,
  '../../../../../.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs',
)
type Host = { pm: { readCard: (id: string, o?: { fields?: string[] }) => unknown } }
type Prereq = (o: { story: string; host: Host }) => {
  blocked: boolean
  prerequisites: { id: string; state: string; reason?: string }[]
  blockedBy?: { id: string; reason: string }
}
let prereqState: Prereq
beforeAll(async () => {
  ;({ prereqState } = (await import(pathToFileURL(SCRIPT).href)) as { prereqState: Prereq })
})

type Card = { body?: string; state?: string; stateReason?: string; labels?: unknown[] }
const cwd = '/project'
const host = (cards: Record<string, Card>): Host => ({
  pm: {
    readCard: (id, o = {}) => {
      const c = cards[id]
      if (c === undefined) throw new Error('HTTP 404')
      const all = c as Record<string, unknown>
      return o.fields
        ? Object.fromEntries(o.fields.filter(f => f in all).map(f => [f, all[f]]))
        : { body: c.body }
    },
  },
})
const cand = (id: string): RootCandidate => ({
  id,
  title: `Card ${id}`,
  branch: `feature/US-${id}-x`,
  tier: 'risk:green',
  macrostate: 'Ready',
  labels: ['risk:green'],
  mutexResources: [],
  prerequisites: [],
})
const freeLock: LockAcquirer = ({ card: id }) => ({
  kind: 'acquired',
  lock: { path: `/locks/${id}`, release: () => {} },
})

afterEach(() => vi.restoreAllMocks())

async function root(cards: Record<string, Card>, ids: string[]) {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation(
    (...a: unknown[]) => void lines.push(a.map(String).join(' ')),
  )
  const audit: string[] = []
  const started: string[] = []
  const h = host(cards)
  const deps: RunHandlerDependencies = {
    runAudit: () => {},
    readPrereqState: id => prereqState({ story: id, host: h }),
    selectCandidates: async () => ids.map(cand),
    runCardProcess: vi.fn<CardProcessRunner>(async ({ card: c }) => {
      started.push(c.id)
      return { exitCode: 0, signal: null }
    }),
    acquireLock: freeLock,
    appendAudit: (_p, line) => void audit.push(line),
  }
  const fs = new InMemoryFileSystemService(
    {
      [`${cwd}/config.json`]: JSON.stringify({ asset_registries: {} }),
      '/bin/claude': '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
      [`${cwd}/${POLICY_PATH}`]: '## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n2\n',
    },
    cwd,
    cwd,
  )
  process.env['PATH'] = '/bin'
  await handleRunCommand(parseRunCommand({ root: '66', parallel: '2', autonomous: true }), fs, deps)
  return { lines: lines.join('\n'), audit: audit.join('\n'), started }
}

describe('run --root — prose dependency exclusion (selection → child)', () => {
  it('C-7 prose "Depends on #3" with #3 open: no child for #1, #2 still runs, id and reason reported', async () => {
    const r = await root(
      {
        1: { body: 'Depends on #3' },
        2: { body: '**Prerequisite Stories**: none' },
        3: { state: 'OPEN', labels: [] },
      },
      ['1', '2'],
    )
    expect(r.started).toEqual(['2'])
    expect(r.lines).toContain('Excluded #1: blocked by #3 (not merged)')
  })

  it('C-8 prose "Blocked by #3" with #3 open is audited with the same reason', async () => {
    const r = await root({ 1: { body: 'Blocked by #3' }, 3: { state: 'OPEN', labels: [] } }, ['1'])
    expect(r.started).toEqual([])
    expect(r.audit + r.lines).toMatch(/blocked by #3 \(not merged\)/)
  })

  it('C-9 control: prose dependency on a merged card is driven', async () => {
    const r = await root(
      {
        1: { body: 'Depends on #3' },
        3: { state: 'CLOSED', stateReason: 'COMPLETED', labels: [] },
      },
      ['1'],
    )
    expect(r.started).toEqual(['1'])
  })
})
