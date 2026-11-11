import { expect, it } from 'vitest'
import { cpSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { spawnSync } from 'child_process'
import { readCardClosedAt, readCardDocumentViaGh } from './cycle-wiring'
import { parseStateMapping, resolveMacrostate } from './card-readiness'
import {
  root,
  mapping,
  retry,
  prepared,
  target,
  Card,
  board,
  closed,
  save,
  invoke,
  initial,
} from './cards-lifecycle-lib'
function installed() {
  cpSync(
    resolve(__dirname, '../../../../../.claude/skills/pair-workflow-cycle/scripts'),
    join(root, '.claude/skills/pair-workflow-cycle/scripts'),
    { recursive: true },
  )
}

it.each(['board', 'prepare', 'completion'] as const)(
  'G1-%s: installed adapter reaches list decisions',
  async kind => {
    installed()
    const state = initial()
    save(state)
    const script = join(root, '.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs')
    const read = spawnSync(process.execPath, [script, 'card', '--story', '12'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
    })
    expect(read.status).toBe(0)
    expect(JSON.parse(read.stdout)).toMatchObject({ boardState: 'Inbox' })
    expect(JSON.parse(read.stdout)).not.toHaveProperty('projectItems')
    const result = await invoke(
      state,
      (_id, n) => {
        if (n > 1) return target
        state.cards['12'] = kind === 'completion' ? closed() : board('Planned')
        return kind === 'prepare' ? prepared : retry
      },
      { cards: '12' },
    )
    expect(result.calls).toEqual(kind === 'completion' ? ['12'] : ['12', '12'])
    expect(result.output).toContain('#12: at-target')
    expect(result.code).toBe(0)
  },
)

const boardCases = [
  { id: 'canonical-default', map: '', from: 'Draft', to: 'Ready', forward: true },
  { id: 'canonical-mapped', map: mapping, from: 'Draft', to: 'Ready', forward: true },
  { id: 'case', map: mapping, from: 'iNbOx', to: 'pLaNnEd', forward: true },
  {
    id: 'alias',
    map: mapping + '| Queued | Ready |\n',
    from: 'Planned',
    to: 'Queued',
    forward: false,
  },
  { id: 'canonical-alias', map: mapping, from: 'Planned', to: 'Ready', forward: false },
  { id: 'unmapped', map: mapping, from: 'Outside', to: 'Removed', forward: false },
  { id: 'known-to-unmapped', map: mapping, from: 'Checking', to: 'Removed', forward: false },
  { id: 'case-only', map: mapping, from: 'Planned', to: 'PLANNED', forward: false },
  { id: 'body', map: mapping, from: 'Inbox', to: 'Planned', forward: true },
  { id: 'stale-body', map: mapping, from: 'Inbox', to: 'Inbox', forward: false },
] as const
for (const adapter of ['fallback', 'installed'] as const) {
  it.each(boardCases)(`G3-${adapter}-$id: resolved macrostate governs progress`, async c => {
    if (adapter === 'installed') installed()
    writeFileSync(join(root, '.pair/adoption/tech/way-of-working.md'), c.map)
    const state = initial()
    const make = (label: string): Card =>
      c.id === 'body'
        ? { ...board(), projectItems: [], body: `**Status**: ${label}` }
        : {
            ...board(label),
            body: c.id === 'stale-body' ? '**Status**: Finished' : '**Status**: Inbox',
          }
    state.cards['12'] = make(c.from)
    save(state)
    expect(readCardDocumentViaGh('12', root).boardState).toBe(c.from)
    const map = parseStateMapping(c.map)
    const before = resolveMacrostate(c.from, map)
    const after = resolveMacrostate(c.to, map)
    if (c.forward) expect([before, after]).toEqual(['Draft', 'Ready'])
    else if (c.id === 'unmapped') expect([before, after]).toEqual([undefined, undefined])
    else if (c.id === 'known-to-unmapped') expect([before, after]).toEqual(['Review', undefined])
    else expect(before).toBe(after)
    const result = await invoke(
      state,
      (_id, n) => {
        if (n > 1) return target
        state.cards['12'] = make(c.to)
        return retry
      },
      { cards: '12' },
    )
    expect(result.calls).toEqual(c.forward ? ['12', '12'] : ['12'])
    expect(result.output).toContain(c.forward ? 'Stop: all-at-target' : 'Stop: no-progress')
    expect(result.code).toBe(c.forward ? 0 : 1)
  })
}

const closures = [
  {
    id: 'not-planned',
    state: 'CLOSED',
    reason: 'NOT_PLANNED',
    at: '2026-01-01T00:00:00Z',
    valid: false,
  },
  { id: 'missing-date', state: 'CLOSED', reason: 'COMPLETED', at: null, valid: false },
  { id: 'invalid-date', state: 'CLOSED', reason: 'COMPLETED', at: 'not-a-date', valid: false },
  {
    id: 'open-with-date',
    state: 'OPEN',
    reason: 'COMPLETED',
    at: '2026-01-01T00:00:00Z',
    valid: false,
  },
  {
    id: 'completed',
    state: 'CLOSED',
    reason: 'COMPLETED',
    at: '2026-01-01T00:00:00Z',
    valid: true,
  },
  {
    id: 'legacy-null-reason',
    state: 'CLOSED',
    reason: null,
    at: '2026-01-01T00:00:00Z',
    valid: true,
  },
] as const
for (const adapter of ['fallback', 'installed'] as const) {
  it.each(closures)(`G4-${adapter}-$id: closure evidence before and after execution`, async c => {
    if (adapter === 'installed') installed()
    const state = initial()
    const evidence = { ...board('Building'), state: c.state, stateReason: c.reason, closedAt: c.at }
    state.cards['12'] = evidence
    save(state)
    expect(readCardClosedAt('12', root) instanceof Date).toBe(c.valid)
    const before = await invoke(state, () => retry, { cards: '12' })
    expect(before.calls).toEqual(c.valid ? [] : ['12'])
    expect(before.code).toBe(c.valid ? 0 : 1)
    state.cards['12'] = board('Building')
    const after = await invoke(
      state,
      () => {
        state.cards['12'] = evidence
        return retry
      },
      { cards: '12' },
    )
    expect(after.calls).toEqual(['12'])
    expect(after.output).toContain(c.valid ? '#12: at-target' : '#12: retryable')
    expect(after.code).toBe(c.valid ? 0 : 1)
  })
  it(`G4-${adapter}-done: new mapped Done ends without a second invocation`, async () => {
    if (adapter === 'installed') installed()
    const state = initial()
    const result = await invoke(
      state,
      () => {
        state.cards['12'] = board('Finished')
        return retry
      },
      { cards: '12' },
    )
    expect(result.calls).toEqual(['12'])
    expect(result.output).toContain('#12: at-target')
    expect(result.code).toBe(0)
  })
}

// AC6/AC7: explicit human/terminal or global-halt evidence retains precedence.
it.each(['gate-red', 'needs-human', 'merged-closure-unfinished'])(
  'G4-precedence-%s: durable completion does not erase a terminal result',
  async cycleStatus => {
    const state = initial()
    const result = await invoke(
      state,
      () => {
        state.cards['12'] = closed()
        return { ...prepared, cycleStatus }
      },
      { cards: '12' },
    )
    expect(result.calls).toEqual(['12'])
    expect(result.output).toContain('#12: terminal')
    expect(result.code).toBe(1)
  },
)
it('G4-precedence-halt: completion cannot erase a safety-required halt', async () => {
  const state = initial()
  const result = await invoke(
    state,
    () => {
      state.cards['12'] = closed()
      save(state)
      throw new Error('perimeter refused')
    },
    { cards: '12,15' },
  )
  expect(result.calls).toEqual(['12'])
  expect(result.output).toContain('Stop: halt')
  expect(result.code).toBe(1)
})
