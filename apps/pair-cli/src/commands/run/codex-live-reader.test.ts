import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ENGINES } from './engines'
import { readIterationOutcome, toLines } from './stream-reader'
import { selectRootCandidates } from './root-select'
import type { SpawnIterationInput } from './spawn'

/** US-603 r0-1: the recorded live `codex exec --json` run is consumed, and the adapter no longer calls it pending. */

const live = readFileSync(join(__dirname, '__fixtures__', 'codex-0.166-live.jsonl'), 'utf-8')

describe('codex-0.166-live fixture', () => {
  it('reader-ends-live-run-as-success', async () => {
    const result = await readIterationOutcome(
      toLines(
        (async function* () {
          yield live
        })(),
      ),
      ENGINES.codex,
    )
    expect(result.outcome).toBe('success')
  })

  it('root-select-reads-live-last-message', async () => {
    const runIteration = vi.fn(async (input: SpawnIterationInput) => {
      for (const line of live.split('\n').filter(Boolean)) input.onEvent?.(JSON.parse(line))
      return { outcome: 'success' as const, detail: '' }
    })
    const candidates = await selectRootCandidates({
      engine: ENGINES.codex,
      cwd: '.',
      autonomyArgs: [],
      root: '1',
      runIteration,
    })
    expect(candidates.map(c => c.id)).toEqual(['603'])
  })
})
