import { describe, it, expect, vi } from 'vitest'
import { ENGINES } from './engines'
import type { CardLabelHost } from './card-risk-label'
import { CANDIDATES_MARKER, selectRootAnswer } from './root-select'
import type { SpawnIterationInput } from './spawn'

/**
 * US-595 r2-1 (floor read failure) — AC3: a failed floor read never lets a card through with a
 * tier below its own risk label. root-select.ts tier/labels invariant.
 */
function flakyHost(after: string[]) {
  const host = {
    reads: 0,
    writes: [] as string[][],
    async readLabels() {
      if (host.reads++ === 0) throw new Error('transient gh failure')
      return [...after]
    },
    async writeLabels(_card: string, labels: string[]) {
      host.writes.push([...labels])
    },
  }
  return host satisfies CardLabelHost
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

describe('US-595 r2-1: first floor read fails, later read shows a higher risk label (AC3)', () => {
  it.each([[['risk:red']], [['risk:yellow']]])(
    'tier risk:green, first read throws then %j: blocked, never selected, no write',
    async after => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      const host = flakyHost(after)
      const answer = await selectRootAnswer({
        engine: ENGINES.claude,
        root: '66',
        eligibility: 'risk:green',
        cwd: '/project',
        autonomyArgs: ['--dangerously-skip-permissions'],
        timeoutSeconds: 60,
        labelHost: host,
        runIteration: iteration([
          card('36', 'risk:green', []),
          card('491', 'risk:green', ['risk:green']),
        ]),
      } as never)
      log.mockRestore()
      expect(answer.candidates.map(c => c.id)).toEqual(['491'])
      expect((answer.blocked ?? []).join('\n')).toMatch(/36/)
      expect(host.writes).toEqual([])
    },
  )
})
