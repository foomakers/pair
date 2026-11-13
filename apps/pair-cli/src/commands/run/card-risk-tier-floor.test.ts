import { describe, it, expect, vi } from 'vitest'
import { ENGINES } from './engines'
import type { CardLabelHost } from './card-risk-label'
import { CANDIDATES_MARKER, selectRootAnswer } from './root-select'
import type { SpawnIterationInput } from './spawn'

/**
 * US-595 r2-1 — AC3: a tier is never used to bypass eligibility. After reconcile, a card is
 * selected only when its tier equals its single risk:* label (root-select.ts tier/labels invariant).
 */
function fakeHost(initial: string[]) {
  const host = {
    labels: [...initial],
    writes: [] as string[][],
    async readLabels() {
      return [...host.labels]
    },
    async writeLabels(_card: string, labels: string[]) {
      host.writes.push([...labels])
      host.labels = [...labels]
    },
  }
  return host satisfies CardLabelHost
}

const input = {
  engine: ENGINES.claude,
  root: '66',
  eligibility: 'risk:green',
  cwd: '/project',
  autonomyArgs: ['--dangerously-skip-permissions'],
  timeoutSeconds: 60,
}
const card = (id: string, tier: string, labels: string[]) => ({
  id,
  title: 't',
  branch: 'b',
  tier,
  labels,
  mutexResources: [],
  prerequisites: [],
})
const iteration = (candidates: unknown[]) =>
  vi.fn(async (spawn: SpawnIterationInput) => {
    spawn.onEvent?.({
      type: 'assistant',
      text: `${CANDIDATES_MARKER} ${JSON.stringify({ candidates })}`,
    })
    return { outcome: 'success' as const, detail: 'ok' }
  })

const select = async (cards: unknown[], labels: string[]) => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const host = fakeHost(labels)
  const answer = await selectRootAnswer({
    ...input,
    labelHost: host,
    runIteration: iteration(cards),
  } as never)
  log.mockRestore()
  return { host, answer }
}

describe('US-595 r2-1: card floor above reviewed tier stays blocked (AC3)', () => {
  it.each([
    ['risk:green', ['risk:red']],
    ['risk:yellow', ['risk:red']],
    ['risk:yellow', ['risk:yellow', 'risk:red']],
  ])('tier %s with labels %j is blocked, never selected, host untouched', async (tier, labels) => {
    const { host, answer } = await select(
      [card('36', tier, labels), card('491', 'risk:green', ['risk:green'])],
      labels,
    )
    expect(answer.candidates.map(c => c.id)).toEqual(['491'])
    expect((answer.blocked ?? []).join('\n')).toMatch(/36/)
    expect(host.writes).toEqual([])
  })

  it('control: a card whose floor is below the reviewed tier is raised and selected with tier == its label', async () => {
    const { host, answer } = await select(
      [card('36', 'risk:red', ['risk:yellow'])],
      ['risk:yellow'],
    )
    expect(answer.candidates.map(c => c.id)).toEqual(['36'])
    const risk = (answer.candidates[0]!.labels ?? []).filter(l => l.startsWith('risk:'))
    expect(risk).toEqual([answer.candidates[0]!.tier])
    expect(host.writes.length).toBeGreaterThan(0)
  })
})
