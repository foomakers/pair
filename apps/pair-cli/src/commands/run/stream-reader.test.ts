import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { readIterationOutcome, toLines } from './stream-reader'
import { ENGINES, type EngineId } from './engines'

/** Feeds a recorded stream through the reader the way a child process would: in chunks. */
async function readFixture(name: string, engine: EngineId, chunkSize = 64) {
  const content = readFileSync(join(__dirname, '__fixtures__', name), 'utf-8')
  const chunks = (async function* () {
    for (let index = 0; index < content.length; index += chunkSize) {
      yield content.slice(index, index + chunkSize)
    }
  })()
  return readIterationOutcome(toLines(chunks), ENGINES[engine])
}

describe('readIterationOutcome — per engine, from recorded streams', () => {
  it('reads a claude success from its result event', async () => {
    const result = await readFixture('claude-success.jsonl', 'claude')

    expect(result.outcome).toBe('success')
    expect(result.detail).toContain('success')
  })

  it('reads a claude failure from the same event, by subtype', async () => {
    const result = await readFixture('claude-failure.jsonl', 'claude')

    expect(result.outcome).toBe('failed')
  })

  it('reads an opencode success from a step_finish with reason stop', async () => {
    const result = await readFixture('opencode-success.jsonl', 'opencode')

    expect(result.outcome).toBe('success')
  })

  it('does not treat an intermediate tool-call step as terminal', async () => {
    // A stream whose first step_finish carries reason "tool-calls" must run on to the real one.
    const result = await readFixture('opencode-intermediate-steps.jsonl', 'opencode')

    expect(result.outcome).toBe('success')
  })

  it('reads a pi success from agent_settled', async () => {
    const result = await readFixture('pi-success.jsonl', 'pi')

    expect(result.outcome).toBe('success')
  })
})

describe('readIterationOutcome — fail-closed', () => {
  it('fails when the stream carries no recognisable terminal event (AC7)', async () => {
    const result = await readFixture('claude-no-terminal.jsonl', 'claude')

    expect(result.outcome).toBe('failed')
    expect(result.detail).toContain('no terminal event')
  })

  it('fails on a truncated stream', async () => {
    const result = await readFixture('pi-truncated.jsonl', 'pi')

    expect(result.outcome).toBe('failed')
  })

  it('skips malformed lines and still reads the terminal event after them', async () => {
    const result = await readFixture('pi-malformed-lines.jsonl', 'pi')

    expect(result.outcome).toBe('success')
  })

  it('a zero exit code cannot rescue a stream with no terminal event', async () => {
    // The reader is given the stream ONLY: there is no exit-code parameter to pass, which is
    // the invariant this test pins (AC7 — the exit code is not in the decision path at all).
    expect(readIterationOutcome.length).toBe(2)
  })
})

describe('readIterationOutcome — continue-token', () => {
  it("carries pair-loop's continue-token out of the stream", async () => {
    const result = await readFixture('claude-success.jsonl', 'claude')

    expect(result.continueToken).toBe('pair-loop --root 212 --iteration 2')
  })

  it('carries it on a portable engine too', async () => {
    const result = await readFixture('pi-success.jsonl', 'pi')

    expect(result.continueToken).toBe('pair-loop --root 212 --iteration 5')
  })

  it('reports no token when the skill printed none (it reported itself finished)', async () => {
    const result = await readFixture('opencode-success.jsonl', 'opencode')

    expect(result.continueToken).toBeUndefined()
  })
})

describe('toLines', () => {
  it('splits across chunk boundaries and yields a trailing partial line', async () => {
    const chunks = (async function* () {
      yield '{"a":1}\n{"b'
      yield '":2}\n{"c":3'
    })()

    const lines: string[] = []
    for await (const line of toLines(chunks)) lines.push(line)

    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3'])
  })

  it('handles CRLF streams', async () => {
    const chunks = (async function* () {
      yield '{"a":1}\r\n{"b":2}\r\n'
    })()

    const lines: string[] = []
    for await (const line of toLines(chunks)) lines.push(line)

    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('accepts byte chunks, as a child process delivers them', async () => {
    const chunks = (async function* () {
      yield Buffer.from('{"a":1}\n')
    })()

    const lines: string[] = []
    for await (const line of toLines(chunks)) lines.push(line)

    expect(lines).toEqual(['{"a":1}'])
  })
})
