import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createRunAudit } from './run-audit'

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
