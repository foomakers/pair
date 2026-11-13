import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * US-597 AC1/AC3/AC5 (r1-g2, r0-2) — pair-loop selection resolves prerequisites through the deterministic
 * `cycle-state.mjs prereq-state` relay (one call per card, answered here by the REAL grammar with the script's
 * own output), never the selection agent's claim.
 */
const ROOT = join(__dirname, '../../../../../.claude')
const SCRIPTS = join(ROOT, 'skills/pair-workflow-cycle/scripts')
const SRC = readFileSync(join(ROOT, 'workflows/pair-loop.js'), 'utf8').replace(/^export /gm, '')
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...a: string[]
) => (...a: unknown[]) => Promise<unknown>
type Card = { body?: string; state?: string; stateReason?: string; labels?: unknown[] }
let resolvePolicy: (o: unknown) => unknown
let prereqState: (o: unknown) => unknown
beforeAll(async () => {
  ;({ resolvePolicy } = (await import(
    pathToFileURL(join(SCRIPTS, 'autonomy-policy.mjs')).href
  )) as {
    resolvePolicy: typeof resolvePolicy
  })
  ;({ prereqState } = (await import(pathToFileURL(join(SCRIPTS, 'cycle-state.mjs')).href)) as {
    prereqState: typeof prereqState
  })
})

const POLICY = '## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n2\n'
const MERGED: Card = { state: 'CLOSED', stateReason: 'COMPLETED', labels: [] }
const OPEN: Card = { state: 'OPEN', labels: [] }
const card = (id: string, claim: unknown[] = []) => ({
  id,
  title: `T${id}`,
  branch: `feature/US-${id}-x`,
  tier: 'risk:green',
  labels: ['risk:green'],
  macrostate: 'Ready',
  mutexResources: [`r${id}`],
  prerequisites: claim,
  escalated: false,
})

async function run(o: {
  candidates: unknown[]
  cards: Record<string, Card>
  relayThrows?: boolean
}) {
  const batches: string[][] = []
  const audits: string[] = []
  const relays: string[] = []
  const host = {
    pm: {
      readCard: (id: string, opts: { fields?: string[] } = {}) => {
        const c = o.cards[id]
        if (c === undefined) throw new Error('HTTP 502')
        const all = c as Record<string, unknown>
        return opts.fields
          ? Object.fromEntries(opts.fields.filter(f => f in all).map(f => [f, all[f]]))
          : { body: c.body }
      },
    },
  }
  const agent = async (prompt: string, opts: { phase?: string }) => {
    if (opts.phase === 'Policy' && prompt.includes('audit file')) return { haltedCardIds: [] }
    if (opts.phase === 'Audit') {
      audits.push(prompt)
      return { written: true, path: 'x' }
    }
    if (/autonomy-policy\.mjs resolve/.test(prompt))
      return resolvePolicy({ args: {}, adoptionText: POLICY })
    if (prompt.includes('Run /pair-next')) return { candidates: o.candidates }
    const m = /prereq-state --story (\S+)/.exec(prompt)
    if (m?.[1] !== undefined) {
      relays.push(m[1])
      if (o.relayThrows) throw new Error('relay agent died')
      return prereqState({ story: m[1].replace(/['"`]/g, ''), host })
    }
    return { states: [] }
  }
  const workflow = async (_name: string, input: { cards: { id: string }[] }) => {
    batches.push(input.cards.map(c => c.id))
    return { batch: input.cards.map(c => ({ id: c.id, status: 'target-ready' })) }
  }
  const parallel = (fns: (() => unknown)[]) =>
    Promise.all(
      fns.map(f =>
        Promise.resolve()
          .then(f)
          .catch(() => null),
      ),
    )
  await new AsyncFunction('args', 'agent', 'parallel', 'log', 'phase', 'workflow', SRC)(
    { policyText: POLICY, parallel: 2, maxIterations: 1 },
    agent,
    parallel,
    () => {},
    () => {},
    workflow,
  )
  return { batches, audits, relays }
}

describe('pair-loop selection resolves prerequisites via prereq-state', () => {
  it('L-7 agent claims none, script says #3 open: excluded before the batch, audited with the script reason', async () => {
    const r = await run({
      candidates: [card('1')],
      cards: { 1: { body: 'Blocked by #3' }, 3: OPEN },
    })
    expect(r.batches).toEqual([])
    expect(r.audits.join('\n')).toMatch(/blocked by #3 \(not merged\)/)
  })

  it('L-8 agent claims merged, script says open: still excluded', async () => {
    const r = await run({
      candidates: [card('1', [{ id: '3', merged: true }])],
      cards: { 1: { body: 'Depends on #3' }, 3: OPEN },
    })
    expect(r.batches).toEqual([])
  })

  it('L-9 agent claims unmerged, script says merged: driven (claims ignored both ways)', async () => {
    const r = await run({
      candidates: [card('1', [{ id: '3', merged: false }])],
      cards: { 1: { body: 'Depends on #3' }, 3: MERGED },
    })
    expect(r.batches).toEqual([['1']])
  })

  it('L-10 one blocked, one clear: only the clear one is driven', async () => {
    const r = await run({
      candidates: [card('1'), card('2')],
      cards: {
        1: { body: 'Depends on #3' },
        2: { body: '**Prerequisite Stories**: none' },
        3: OPEN,
      },
    })
    expect(r.batches).toEqual([['2']])
  })

  it('L-11 relay unreadable (agent dies): fails closed, nothing driven', async () => {
    const r = await run({
      candidates: [card('1')],
      cards: { 1: { body: 'plain' } },
      relayThrows: true,
    })
    expect(r.batches).toEqual([])
  })

  it('L-12 unrecognised declaration: excluded, audit carries the grammar guidance', async () => {
    const r = await run({
      candidates: [card('1')],
      cards: { 1: { body: 'Depends on the billing epic' } },
    })
    expect(r.batches).toEqual([])
    expect(r.audits.join('\n')).toMatch(/unrecognised/)
  })

  it('L-13 every candidate gets one relay call', async () => {
    const r = await run({
      candidates: [card('1'), card('2')],
      cards: { 1: { body: 'x' }, 2: { body: 'x' } },
    })
    expect([...r.relays].sort()).toEqual(['1', '2'])
  })

  it('C-6 control: no dependency and merged dependency are driven', async () => {
    const r = await run({
      candidates: [card('1'), card('2')],
      cards: {
        1: { body: '**Prerequisite Stories**: none' },
        2: { body: 'Depends on #3' },
        3: MERGED,
      },
    })
    expect(r.batches).toEqual([['1', '2']])
  })
})
