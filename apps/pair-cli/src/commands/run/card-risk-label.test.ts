import { describe, it, expect } from 'vitest'
import { reconcileCardRiskLabel, type CardLabelHost } from './card-risk-label'
import { parseSelection } from './root-select'

/**
 * US-595 r0-1 — verified card-label propagation (AC1, AC2, AC4). Oracle: the story AC, not the code.
 * `host` fakes the PM-tool card-label boundary: readLabels / writeLabels (replace the label set).
 */
interface Fake extends CardLabelHost {
  labels: string[]
  writes: string[][]
}

function fake(
  initial: string[],
  mode: 'ok' | 'refuse-write' | 'drop-write' | 'fail-read' | 'fail-readback' = 'ok',
): Fake {
  let reads = 0
  const host: Fake = {
    labels: [...initial],
    writes: [],
    async readLabels() {
      reads++
      if (mode === 'fail-read') throw new Error('read timeout')
      if (mode === 'fail-readback' && reads > 1) throw new Error('readback timeout')
      return [...host.labels]
    },
    async writeLabels(_card, labels) {
      if (mode === 'refuse-write') throw new Error('403 forbidden')
      host.writes.push([...labels])
      if (mode !== 'drop-write') host.labels = [...labels]
    },
  }
  return host
}

const run = (host: Fake, over: Record<string, unknown> = {}) =>
  reconcileCardRiskLabel({
    card: '36',
    reviewed: 'risk:yellow',
    link: 'unique',
    projection: true,
    host,
    ...over,
  })

describe('AC1: verified propagation', () => {
  it('writes the reviewed label, keeps foreign labels, confirms by read-back', async () => {
    const host = fake(['pair-ready', 'area:cli'])
    const result = await run(host)
    expect(result.status).toBe('confirmed')
    expect([...host.labels].sort()).toEqual(['area:cli', 'pair-ready', 'risk:yellow'])
  })

  it('re-run is idempotent: no second write, no duplicate label', async () => {
    const host = fake(['x'])
    await run(host)
    const again = await run(host)
    expect(again.status).toBe('confirmed')
    expect(host.writes).toHaveLength(1)
    expect(host.labels.filter(l => l === 'risk:yellow')).toHaveLength(1)
  })

  it('never lowers a higher refinement floor', async () => {
    const host = fake(['risk:red'])
    const result = await run(host)
    expect(result.status).toBe('confirmed')
    expect(host.labels).toEqual(['risk:red'])
  })

  it('raises a lower card label to the reviewed tier, leaving exactly one risk label', async () => {
    const host = fake(['risk:green', 'x'])
    await run(host)
    expect(host.labels.filter(l => l.startsWith('risk:'))).toEqual(['risk:yellow'])
    expect(host.labels).toContain('x')
  })

  it('collapses conflicting risk labels to exactly the final one', async () => {
    const host = fake(['risk:green', 'risk:red'])
    await run(host, { reviewed: 'risk:yellow' })
    expect(host.labels).toEqual(['risk:red'])
  })
})

describe('AC4: honest failure', () => {
  it('a silently dropped write is unconfirmed, naming the card', async () => {
    const result = await run(fake([], 'drop-write'))
    expect(result.status).toBe('unconfirmed')
    expect(result.reason).toContain('36')
  })

  it('a refused write is unconfirmed with the host reason', async () => {
    const result = await run(fake([], 'refuse-write'))
    expect(result.status).toBe('unconfirmed')
    expect(result.reason).toMatch(/36.*403 forbidden|403 forbidden.*36/)
  })

  it('a read failure is unconfirmed and nothing is written', async () => {
    const host = fake([], 'fail-read')
    const result = await run(host)
    expect(result.status).toBe('unconfirmed')
    expect(result.reason).toContain('read timeout')
    expect(host.writes).toEqual([])
  })

  it('a write ok but failing read-back is unconfirmed, never confirmed', async () => {
    const host = fake(['x'], 'fail-readback')
    const result = await run(host)
    expect(result.status).toBe('unconfirmed')
    expect(result.reason).toContain('36')
    expect(result.reason).toContain('readback timeout')
    expect(host.writes).toHaveLength(1)
  })

  it.each(['ambiguous', 'unavailable'])('a %s PR link writes nothing, unconfirmed', async link => {
    const host = fake(['x'])
    const result = await run(host, { link })
    expect(result.status).toBe('unconfirmed')
    expect(result.reason).toContain('36')
    expect(host.writes).toEqual([])
  })

  it('after repair, a re-run re-reads current labels and confirms without duplicates', async () => {
    const host = fake([], 'drop-write')
    expect((await run(host)).status).toBe('unconfirmed')
    const repaired = fake(host.labels)
    expect((await run(repaired)).status).toBe('confirmed')
    expect(repaired.labels).toEqual(['risk:yellow'])
  })
})

describe('AC5: boundaries', () => {
  it('projection off or no reviewed tier: skipped, host untouched', async () => {
    for (const over of [{ projection: false }, { reviewed: undefined }]) {
      const host = fake(['x'])
      expect((await run(host, over)).status).toBe('skipped')
      expect(host.writes).toEqual([])
    }
  })
})

describe('AC2: reconcile then select', () => {
  it('the reported case: unlabelled card 36 is selected after reconcile', async () => {
    const host = fake([])
    await run(host)
    const answer = parseSelection(
      JSON.stringify({
        candidates: [
          { id: '36', title: 't', branch: 'b', tier: 'risk:yellow', labels: host.labels },
          { id: '491', title: 't', branch: 'b', tier: 'risk:green', labels: ['risk:green'] },
        ],
      }),
    )
    expect(answer.candidates.map(c => c.id)).toEqual(['36', '491'])
    expect(answer.blocked).toEqual([])
  })
})
