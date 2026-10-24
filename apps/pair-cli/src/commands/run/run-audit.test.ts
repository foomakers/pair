import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createRunAudit, previousExclusions } from './run-audit'

const lines = (path: string) =>
  readFileSync(path, 'utf-8')
    .trim()
    .split('\n')
    .map(l => JSON.parse(l) as Record<string, unknown>)

describe('live JSONL audit (US-573 AC4)', () => {
  const setup = () => {
    const path = join(mkdtempSync(join(tmpdir(), 'pair-audit-')), 'automation', 'loop-audit.md')
    let tick = 0
    const audit = createRunAudit({
      path,
      runId: 'run-1',
      root: '/project',
      policy: { eligibility: 'risk:green', idleTimeout: { seconds: 1800, source: 'default' } },
      now: () => `2026-10-23T10:00:0${tick++}.000Z`,
    })
    return { path, audit }
  }

  it('creates the file with a loop-start line (run id, root, effective policy) before any iteration', () => {
    const { path } = setup()
    expect(lines(path)).toEqual([
      {
        ts: '2026-10-23T10:00:00.000Z',
        runId: 'run-1',
        iteration: null,
        card: null,
        event: 'loop-start',
        detail: {
          root: '/project',
          policy: { eligibility: 'risk:green', idleTimeout: { seconds: 1800, source: 'default' } },
        },
      },
    ])
  })

  it('appends every event as ONE line at once — readable while the run is still going', () => {
    const { path, audit } = setup()
    audit.record({ event: 'card-start', card: 'ENG-12', title: 'T' }, 1)
    expect(lines(path)).toHaveLength(2)
    audit.record({ event: 'stage', card: 'ENG-12', stage: 'fix 1/3', pr: 41 }, 1)
    expect(lines(path).at(-1)).toEqual({
      ts: '2026-10-23T10:00:02.000Z',
      runId: 'run-1',
      iteration: 1,
      card: 'ENG-12',
      event: 'stage',
      detail: { stage: 'fix 1/3', pr: 41 },
    })
  })

  it('an interrupted run ends with loop-end interrupted, exactly once', () => {
    const { path, audit } = setup()
    audit.end('interrupted', 'SIGINT')
    audit.end('completed', 'late')
    const end = lines(path).filter(l => l['event'] === 'loop-end')
    expect(end).toEqual([
      expect.objectContaining({ detail: { status: 'interrupted', reason: 'SIGINT' } }),
    ])
  })
})

describe('US-575 AC9: exclusions of earlier runs, listed at start', () => {
  it('every card whose LATEST card-end is durable (failed-*, needs-human, escalate), with its reason, run and date — a later success clears it', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'prev-audit-')), 'audit.md')
    const end = ([runId, ts, card, status, reason]: readonly (string | undefined)[]) =>
      JSON.stringify({
        ts,
        runId,
        iteration: null,
        card,
        event: 'card-end',
        detail: { status, ...(reason && { reason }) },
      })
    writeFileSync(
      path,
      [
        '2026-10-22T10:00:00Z event=batch root=66 (a key=value line of the same file)',
        end(['run-a', '2026-10-22T10:00:00Z', '1', 'failed-implement', 'exit 1']),
        end([
          'run-a',
          '2026-10-22T10:01:00Z',
          '2',
          'needs-human',
          'needs-human: maxFixRounds (10) spent',
        ]),
        end(['run-a', '2026-10-22T10:02:00Z', '3', 'failed (crashed)', 'killed by SIGKILL']),
        end(['run-a', '2026-10-22T10:03:00Z', '4', 'escalate']),
        end(['run-b', '2026-10-23T09:00:00Z', '1', 'merged']),
      ].join('\n') + '\n',
    )
    expect(previousExclusions(path)).toEqual([
      {
        card: '2',
        reason: 'needs-human: maxFixRounds (10) spent',
        runId: 'run-a',
        date: '2026-10-22',
      },
      { card: '4', reason: 'escalate', runId: 'run-a', date: '2026-10-22' },
    ])
    expect(previousExclusions(join(tmpdir(), 'no-such-audit.md'))).toEqual([])
  })
})
