import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { readIterationOutcome, toLines } from './stream-reader'
import { buildSkillArgs } from './invocation'
import { readAutomationPolicy, POLICY_PATH } from './automation-policy'
import { InMemoryFileSystemService } from '@pair/content-ops'
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

  it('carries a token whose borrowed value is QUOTED (round 2, Major)', async () => {
    // The shape this PR's own amended contract declares (`--predicate "<text>"`) and the shape
    // round 1's quoting fix makes the driver render. Round 1's anchoring excluded `"` from the
    // capture, so this token did not match at all: the loop read "no token" and an unattended run
    // drove exactly ONE card, reporting success (AC4 lost, silently).
    const result = await readFixture('claude-quoted-predicate-token.jsonl', 'claude')

    expect(result.outcome).toBe('success')
    expect(result.continueToken).toBe(
      'pair-loop --root 212 --predicate "tag:risk:red ⇒ Done" --iteration 2',
    )
  })

  it('ignores the DOCUMENTED template echoed in a transcript (round 1, finding 5)', async () => {
    // pair-loop's own SKILL.md contains the literal line
    // `CONTINUE-TOKEN: pair-loop [--root <id>] [--predicate "<text>"] --iteration <n+1>`.
    // An agent that reads or quotes that file echoes it into the stream; an unanchored match then
    // invented a token and the loop kept re-invoking to the cap.
    const result = await readFixture('claude-echoed-skill-doc.jsonl', 'claude')

    expect(result.outcome).toBe('success')
    expect(result.continueToken).toBeUndefined()
  })

  it('ignores a mention that is not at the start of its own line', async () => {
    const result = await readFixture('claude-inline-mention.jsonl', 'claude')

    expect(result.continueToken).toBeUndefined()
  })

  it('takes the MOST RECENT token when a report quotes an earlier one (deliberate)', async () => {
    // A recap of the previous iteration, then this iteration's real token. Re-invoking the stale
    // one would replay a card the run already handled, so last-wins is the intended order.
    const stream = (async function* () {
      yield `${JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Previously:\nCONTINUE-TOKEN: pair-loop --iteration 2' },
            { type: 'text', text: 'Now:\nCONTINUE-TOKEN: pair-loop --iteration 3' },
          ],
        },
      })}\n`
      yield `${JSON.stringify({ type: 'result', subtype: 'success' })}\n`
    })()

    const result = await readIterationOutcome(toLines(stream), ENGINES.claude)

    expect(result.continueToken).toBe('pair-loop --iteration 3')
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

/**
 * The two halves of the continue-token contract, pinned TOGETHER.
 *
 * Round 1 fixed the writing side (quote multi-word borrowed values) and, in the same commit,
 * tightened the reading side in a way that could no longer read what the writing side emits. Each
 * half had passing tests; nothing tested the seam. This does.
 */
describe('round-trip: what the driver renders is what the driver can read back', () => {
  /**
   * The cases are DERIVED, not hand-picked (round 3, minor): the predicate comes out of the policy
   * reader itself, so the round-trip is anchored to the vocabulary the driver actually accepts
   * rather than to three strings a previous author happened to choose — which is how a value
   * carrying an excluded character slipped past this very guard once already.
   */
  function predicateFromPolicy(declaration: string): string {
    const fs = new InMemoryFileSystemService(
      { [`/project/${POLICY_PATH}`]: `## Stop Predicate\n\n${declaration}\nmax-iterations: 20\n` },
      '/project',
      '/project',
    )
    const predicate = readAutomationPolicy(fs, '/project').stopPredicate
    if (predicate === undefined) throw new Error(`policy reader rejected: ${declaration}`)
    return predicate
  }

  async function roundTrip(extra: { predicate?: string }) {
    const args = buildSkillArgs('pair-loop', { root: '212', iteration: 2, ...extra })
    const token = ['pair-loop', ...args].join(' ')
    const stream = (async function* () {
      yield `${JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: `LOOP RUN: done\n\nCONTINUE-TOKEN: ${token}` }],
        },
      })}\n`
      yield `${JSON.stringify({ type: 'result', subtype: 'success' })}\n`
    })()

    return { token, result: await readIterationOutcome(toLines(stream), ENGINES.claude) }
  }

  it('recognises the token it would print for a bare re-invocation', async () => {
    const { token, result } = await roundTrip({})

    expect(result.continueToken).toBe(token)
  })

  it.each([
    ["this repo's own predicate", 'tag:risk:red ⇒ Done'],
    ['a root selector', 'root ⇒ Done'],
    ['a combined condition', 'tag:risk:red ⇒ Done and has-tag:risk:red'],
    ['a type selector with a spaced issue type', 'type:user story ⇒ Done'],
  ])('recognises the token carrying %s, taken from the policy reader', async (_case, declared) => {
    const { token, result } = await roundTrip({ predicate: predicateFromPolicy(declared) })

    expect(token).toContain('"')
    expect(result.continueToken).toBe(token)
  })

  /**
   * The class of value that broke this guard twice: a legitimate predicate carrying a character
   * `isConcreteToken` used to reject wholesale. `=>` is HALTed by the policy reader (round 3), so
   * it cannot arrive from adoption — but it can still reach the driver through `--prompt` or a
   * future skill argument, and the reader must never silently truncate a run over it.
   */
  it('recognises a token whose predicate carries `=>`, not just the documented arrow', async () => {
    const { token, result } = await roundTrip({ predicate: 'tag:risk:red => Done' })

    expect(token).toContain('=>')
    expect(result.continueToken).toBe(token)
  })

  /**
   * Round 4, minor 2: a legitimate policy value may carry `<…>` (tier 1 accepts `tag:a<b>`), and it
   * arrives inside a QUOTED argument. The placeholder check must look at the token's flag structure,
   * not at the contents of a quoted value — otherwise a valid run stops after one card reporting
   * success, the signature of rounds 2 and 3.
   */
  it('recognises a token whose QUOTED value carries `<...>`', async () => {
    const { token, result } = await roundTrip({ predicate: 'tag:a<b> ⇒ Done' })

    expect(token).toContain('<b>')
    expect(result.continueToken).toBe(token)
  })

  it('still refuses the documented TEMPLATE, which is what placeholder syntax means', async () => {
    const stream = (async function* () {
      yield `${JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: 'CONTINUE-TOKEN: pair-loop [--root <id>] [--predicate "<text>"] --iteration <n+1>',
            },
          ],
        },
      })}\n`
      yield `${JSON.stringify({ type: 'result', subtype: 'success' })}\n`
    })()

    const result = await readIterationOutcome(toLines(stream), ENGINES.claude)

    expect(result.continueToken).toBeUndefined()
  })
})
