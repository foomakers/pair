import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ENGINES } from './engines'
import { readIterationOutcome, toLines } from './stream-reader'

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
})
