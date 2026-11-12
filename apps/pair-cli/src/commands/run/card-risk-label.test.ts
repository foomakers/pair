import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi } from 'vitest'
import { ENGINES } from './engines'
import { ghCardLabelHost, reconcileCardRiskLabel, type CardLabelHost } from './card-risk-label'
import { CANDIDATES_MARKER, parseSelection, selectRootAnswer } from './root-select'
import type { SpawnIterationInput } from './spawn'

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

describe('US-595 r1-1: unknown reviewed tier is rejected before any read/write (AC3)', () => {
  it.each([[[]], [['risk:green']]])(
    'reviewed risk:purple with card labels %j is unconfirmed, nothing written',
    async labels => {
      const host = fake(labels)
      const result = await run(host, { reviewed: 'risk:purple' })
      expect(result.status).toBe('unconfirmed')
      expect(result.reason).toContain('36')
      expect(result.reason).toContain('risk:purple')
      expect(host.writes).toEqual([])
      expect(host.labels).toEqual(labels)
    },
  )
})

/** A tracker behind a stubbed `gh`: `issue view --json labels` / `issue edit --add-label/--remove-label`. */
function ghStub(initial: string[], drop = false, throwOn?: 'view' | 'edit') {
  const state = { labels: [...initial], calls: [] as string[][] }
  const gh = (args: readonly string[]): string => {
    state.calls.push([...args])
    if (throwOn && args[0] === 'issue' && args[1] === throwOn)
      throw new Error(`gh ${throwOn} exited 1`)
    if (args[0] === 'issue' && args[1] === 'view')
      return JSON.stringify({ labels: state.labels.map(name => ({ name })) })
    if (args[0] === 'issue' && args[1] === 'edit') {
      const values = (flag: string) =>
        args.flatMap((a, i) => (args[i - 1] === flag ? a.split(',') : []))
      if (!drop) {
        const removed = values('--remove-label')
        state.labels = [...state.labels.filter(l => !removed.includes(l)), ...values('--add-label')]
      }
      return ''
    }
    throw new Error(`unexpected gh ${args.join(' ')}`)
  }
  return { state, gh }
}

describe('US-595 r0-1: a real label host reconciles through the PM tool (AC1, AC4)', () => {
  it('unlabelled card 36 ends with foreign labels + exactly risk:yellow via the gh-backed host', async () => {
    const { state, gh } = ghStub(['pair-ready', 'area:cli'])
    const result = await reconcileCardRiskLabel({
      card: '36',
      reviewed: 'risk:yellow',
      link: 'unique',
      projection: true,
      host: ghCardLabelHost('/project', gh),
    })
    expect(result.status).toBe('confirmed')
    expect(state.labels.filter(l => l.startsWith('risk:'))).toEqual(['risk:yellow'])
    expect(state.labels).toEqual(expect.arrayContaining(['pair-ready', 'area:cli']))
  })

  it('a tracker that silently drops the write is unconfirmed naming card 36', async () => {
    const { gh } = ghStub(['x'], true)
    const result = await reconcileCardRiskLabel({
      card: '36',
      reviewed: 'risk:yellow',
      link: 'unique',
      projection: true,
      host: ghCardLabelHost('/project', gh),
    })
    expect(result.status).toBe('unconfirmed')
    expect(result.reason).toContain('36')
  })
})

describe('US-595 r0-1: gh failures map to unconfirmed, never a throw (AC3)', () => {
  it.each([['view' as const], ['edit' as const]])(
    'gh issue %s exiting non-zero is unconfirmed naming card 36',
    async throwOn => {
      const { gh } = ghStub(['x'], false, throwOn)
      const result = await reconcileCardRiskLabel({
        card: '36',
        reviewed: 'risk:yellow',
        link: 'unique',
        projection: true,
        host: ghCardLabelHost('/project', gh),
      })
      expect(result.status).toBe('unconfirmed')
      expect(result.reason).toContain('36')
    },
  )
})

describe('US-595 r0-1: the selection path reconciles before blocking (AC1, AC2, AC4)', () => {
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

  it('the reported case: reviewed risk:yellow, unlabelled card 36 is reconciled and selected, not blocked', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const host = fake(['pair-ready'])
    const answer = await selectRootAnswer({
      ...input,
      labelHost: host,
      runIteration: iteration([
        card('36', 'risk:yellow', []),
        card('491', 'risk:green', ['risk:green']),
      ]),
    } as never)
    expect(host.labels.filter(l => l.startsWith('risk:'))).toEqual(['risk:yellow'])
    expect(answer.candidates.map(c => c.id)).toEqual(['36', '491'])
    expect(answer.candidates[0]!.labels).toEqual(
      expect.arrayContaining(['risk:yellow', 'pair-ready']),
    )
    expect(answer.blocked ?? []).toEqual([])
    expect(log).not.toHaveBeenCalledWith(expect.stringMatching(/blocked.*36/))
    log.mockRestore()
  })

  it('a refused write keeps 36 blocked with a card-specific reason; 491 proceeds', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const host = fake([], 'refuse-write')
    const answer = await selectRootAnswer({
      ...input,
      labelHost: host,
      runIteration: iteration([
        card('36', 'risk:yellow', []),
        card('491', 'risk:green', ['risk:green']),
      ]),
    } as never)
    expect(answer.candidates.map(c => c.id)).toEqual(['491'])
    expect(host.labels).toEqual([])
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/blocked.*36.*unconfirmed/))
    log.mockRestore()
  })

  it('a consistent candidate never touches the host', async () => {
    const host = fake([])
    const reads = vi.spyOn(host, 'readLabels')
    const answer = await selectRootAnswer({
      ...input,
      labelHost: host,
      runIteration: iteration([card('491', 'risk:green', ['risk:green'])]),
    } as never)
    expect(answer.candidates.map(c => c.id)).toEqual(['491'])
    expect(reads).not.toHaveBeenCalled()
    expect(host.writes).toEqual([])
  })
})

describe('US-595 r0-1: a throwing label host keeps 36 blocked, 491 proceeds (AC3)', () => {
  it.each([['view' as const], ['edit' as const]])(
    'gh issue %s throws during selection',
    async throwOn => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { gh } = ghStub([], false, throwOn)
      const answer = await selectRootAnswer({
        engine: ENGINES.claude,
        root: '66',
        eligibility: 'risk:green',
        cwd: '/project',
        autonomyArgs: ['--dangerously-skip-permissions'],
        timeoutSeconds: 60,
        labelHost: ghCardLabelHost('/project', gh),
        runIteration: vi.fn(async (spawn: SpawnIterationInput) => {
          const c = (id: string, tier: string, labels: string[]) => ({
            id,
            title: 't',
            branch: 'b',
            tier,
            labels,
            mutexResources: [],
            prerequisites: [],
          })
          spawn.onEvent?.({
            type: 'assistant',
            text: `${CANDIDATES_MARKER} ${JSON.stringify({ candidates: [c('36', 'risk:yellow', []), c('491', 'risk:green', ['risk:green'])] })}`,
          })
          return { outcome: 'success' as const, detail: 'ok' }
        }),
      } as never)
      expect(answer.candidates.map(c => c.id)).toEqual(['491'])
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/blocked.*36.*unconfirmed/))
      log.mockRestore()
    },
  )
})

describe('US-595 r0-1: classify SKILL.md copies name the reachable owner (AC4)', () => {
  const root = fileURLToPath(new URL('../../../../../', import.meta.url))
  it.each([
    ['packages/knowledge-hub/dataset/.skills/capability/classify/SKILL.md'],
    ['.claude/skills/pair-capability-classify/SKILL.md'],
  ])('%s names ghCardLabelHost and selectRootAnswer', path => {
    const text = readFileSync(root + path, 'utf8')
    expect(text).toContain('ghCardLabelHost')
    expect(text).toContain('selectRootAnswer')
  })
})
