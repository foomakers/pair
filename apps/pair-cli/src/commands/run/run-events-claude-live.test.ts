import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { readIterationOutcome, toLines } from './stream-reader'
import { ENGINES } from './engines'
import type { RunEvent } from './run-events'

// r0-3 (recorded live, claude 2.x, 2026-10-23): a background Workflow's log() never reaches
// `claude -p` stream-json; its agents' labels do, live, in system/task_progress.workflow_progress.
describe('claude live stream (recorded fixture, r0-3)', () => {
  it('agent labels in task_progress.workflow_progress map to card-start + one stage per agent', async () => {
    const content = readFileSync(
      join(__dirname, '__fixtures__', 'claude-live-workflow-progress.jsonl'),
      'utf-8',
    )
    const events: RunEvent[] = []
    await readIterationOutcome(
      toLines(
        (async function* () {
          yield content
        })(),
      ),
      ENGINES.claude,
      undefined,
      e => events.push(e),
    )
    expect(events.map(e => [e.event, e.card, e.stage])).toEqual([
      ['card-start', '573', undefined],
      ['stage', '573', 'implement'],
      ['stage', '573', 'review'],
      ['stage', '573', 'prepare'],
      ['stage', '573', 'fix'],
      ['stage', '573', 'merge'],
    ])
  })
})
