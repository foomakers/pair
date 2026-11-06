import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ENGINES } from './engines'
import { readIterationOutcome, toLines } from './stream-reader'
import { selectRootCandidates } from './root-select'
import { relayLines } from './spawn'
import type { SpawnIterationInput } from './spawn'

/** US-603 — codex's final text is its LAST agent message; `turn.completed` carries only usage. */

const lines = (text: string) =>
  toLines(
    (async function* () {
      yield text
    })(),
  )
const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf-8')
const stream = (...events: unknown[]) => events.map(e => JSON.stringify(e)).join('\n')
const message = (text: string) => ({
  type: 'item.completed',
  item: { id: 'i', type: 'agent_message', text },
})
const completed = { type: 'turn.completed', usage: { input_tokens: 1 } }

describe('AC1: final result from the last agent message', () => {
  it('sets final from the LAST message, ignoring earlier messages and tool output', async () => {
    const result = await readIterationOutcome(
      lines(fixture('codex-stage-agent-messages.jsonl')),
      ENGINES.codex,
    )
    expect(result.outcome).toBe('success')
    expect(result.final).toEqual({ status: 'ok', next: { step: 'verify' } })
  })

  it('a turn.failed still fails the iteration', async () => {
    const result = await readIterationOutcome(
      lines(
        stream(message('{"status":"ok"}'), { type: 'turn.failed', error: { message: 'boom' } }),
      ),
      ENGINES.codex,
    )
    expect(result.outcome).toBe('failed')
    expect(result.detail).toContain('boom')
  })

  it('other engines keep their resultField path', async () => {
    const result = await readIterationOutcome(
      lines(stream({ type: 'result', subtype: 'success', result: '{"status":"ok"}' })),
      ENGINES.claude,
    )
    expect(result.final).toEqual({ status: 'ok' })
  })
})

describe('AC3: failure detail', () => {
  it('carries the ~500 char tail of the last agent message', async () => {
    const long = 'HEAD' + 'x'.repeat(600) + 'TAIL'
    const result = await readIterationOutcome(
      lines(stream(message(long), completed)),
      ENGINES.codex,
    )
    expect(result.final).toBeUndefined()
    expect(result.detail).toContain('TAIL')
    expect(result.detail).not.toContain('HEAD')
    expect(result.detail).toContain('x'.repeat(400))
  })

  it('says so when there is no agent message', async () => {
    const result = await readIterationOutcome(lines(stream(completed)), ENGINES.codex)
    expect(result.detail).toContain('no agent message')
  })
})

describe('AC2: root selection from the last agent message', () => {
  const run = (text: string) => {
    const runIteration = vi.fn(async (input: SpawnIterationInput) => {
      for (const line of text.split('\n').filter(Boolean)) input.onEvent?.(JSON.parse(line))
      return { outcome: 'success' as const, detail: '' }
    })
    return selectRootCandidates({
      engine: ENGINES.codex,
      cwd: '.',
      autonomyArgs: [],
      root: '1',
      runIteration,
    })
  }

  it('returns the candidates (not 0)', async () => {
    expect(await run(fixture('codex-root-select.jsonl'))).toHaveLength(1)
  })

  it('a marker in an earlier message only is not read', async () => {
    const marked = fixture('codex-root-select.jsonl').split('\n')
    const text = [marked[2], marked[3]!.replace('Candidates below.\\nPAIR', 'PAIR')].join('\n')
    const swapped = [text, JSON.stringify(message('and nothing else'))].join('\n')
    await expect(run(swapped)).rejects.toThrow(/no PAIR-ROOT-CANDIDATES/)
  })
})

describe('AC4: stdin noise', () => {
  it('is dropped from the codex relay, other lines kept', async () => {
    const logged: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((l: string) => void logged.push(l))
    try {
      const chunk = async function* () {
        yield 'Reading additional input from stdin...\nreal warning\n'
      }
      await relayLines(chunk(), 'codex')
      await relayLines(chunk(), 'claude')
    } finally {
      spy.mockRestore()
    }
    expect(logged).toEqual([
      'real warning',
      'Reading additional input from stdin...',
      'real warning',
    ])
  })
})

describe('AC5/AC6: adapter', () => {
  it.each(['xhigh', 'max'])('passes %s through unclamped', level => {
    expect(ENGINES.codex.effortArgs?.(level)).toEqual(['-c', `model_reasoning_effort=${level}`])
  })
  it('names codex 0.166.0', () => {
    expect(ENGINES.codex.verifiedAgainst).toContain('0.166.0')
  })
})
