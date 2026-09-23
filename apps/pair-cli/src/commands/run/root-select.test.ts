import { describe, it, expect, vi } from 'vitest'
import { ENGINES } from './engines'
import {
  CANDIDATES_MARKER,
  buildSelectionPrompt,
  candidatesInEvent,
  parseCandidates,
  selectRootCandidates,
} from './root-select'
import type { SpawnIterationInput } from './spawn'

/**
 * US-491 AC7 — selection stays `pair-next`'s: the fan-out asks `pair-next --root` (plus the policy's
 * own `## Eligibility`, exactly as `pair-loop`'s Select phase does) and reads back the candidate set
 * as data. The marker is the only protocol; its content is validated, never trusted.
 */

const candidate = {
  id: '491',
  title: 'Fan-out',
  branch: 'feature/US-491-x',
  tier: 'risk:green',
  labels: ['user story', 'risk:green'],
  mutexResources: ['apps/pair-cli/src/commands/run'],
  prerequisites: [{ id: '487', merged: true }],
}

const marker = (value: unknown) => `${CANDIDATES_MARKER} ${JSON.stringify(value)}`

describe('buildSelectionPrompt', () => {
  it('invokes pair-next with --root, and --filter only when ## Eligibility is declared', () => {
    const withEligibility = buildSelectionPrompt(ENGINES.claude, {
      root: '66',
      eligibility: 'risk:green',
    })
    expect(withEligibility.startsWith('/pair-next --root 66 --filter risk:green')).toBe(true)

    const without = buildSelectionPrompt(ENGINES.claude, { root: '66' })
    expect(without.startsWith('/pair-next --root 66')).toBe(true)
    expect(without).not.toContain('--filter')
  })

  it('asks for the fields pair-loop’s Select phase asks for, and forbids acting on the selection', () => {
    const prompt = buildSelectionPrompt(ENGINES.pi, { root: '66' })
    expect(prompt).toContain('Prerequisite Stories')
    expect(prompt).toContain('mutex-resource')
    expect(prompt).toContain(CANDIDATES_MARKER)
    expect(prompt).toMatch(/do not invoke/i)
  })
})

describe('candidatesInEvent / parseCandidates', () => {
  it('reads the marker line out of a nested event string', () => {
    const event = { type: 'result', result: `Report…\n${marker({ candidates: [candidate] })}\n` }
    expect(candidatesInEvent(event)).toEqual([candidate])
  })

  it('ignores a marker that is not at the start of its own line', () => {
    expect(candidatesInEvent({ text: `it prints ${marker({ candidates: [] })}` })).toBeUndefined()
  })

  it('takes the LAST marker in an event (the final report wins over a quoted earlier one)', () => {
    const text = `${marker({ candidates: [] })}\n${marker({ candidates: [candidate] })}`
    expect(candidatesInEvent({ text })).toEqual([candidate])
  })

  it('defaults absent labels/resources/prerequisites to empty', () => {
    const [parsed] = parseCandidates(
      JSON.stringify({ candidates: [{ id: '7', title: 't', branch: 'b', tier: 'risk:green' }] }),
    )
    expect(parsed).toEqual({
      id: '7',
      title: 't',
      branch: 'b',
      tier: 'risk:green',
      labels: [],
      mutexResources: [],
      prerequisites: [],
    })
  })

  it.each([
    ['invalid JSON', '{nope'],
    ['no candidates array', JSON.stringify({})],
    [
      'an unsafe id (it becomes argv and a lock path)',
      JSON.stringify({ candidates: [{ ...candidate, id: '1; rm -rf /' }] }),
    ],
    ['a traversal id', JSON.stringify({ candidates: [{ ...candidate, id: '..' }] })],
    ['a non-string label', JSON.stringify({ candidates: [{ ...candidate, labels: [3] }] })],
    [
      'a label carrying a comma (the --card-tags separator)',
      JSON.stringify({ candidates: [{ ...candidate, labels: ['a,b'] }] }),
    ],
    ['an unsafe label', JSON.stringify({ candidates: [{ ...candidate, labels: ['$(whoami)'] }] })],
    [
      'a prerequisite without merged status',
      JSON.stringify({ candidates: [{ ...candidate, prerequisites: [{ id: '1' }] }] }),
    ],
    [
      'a non-string mutex resource',
      JSON.stringify({ candidates: [{ ...candidate, mutexResources: [{}] }] }),
    ],
  ])('refuses %s', (_name, json) => {
    expect(() => parseCandidates(json)).toThrow(/selection/)
  })
})

describe('selectRootCandidates — one engine process, its marker read back', () => {
  const input = {
    engine: ENGINES.claude,
    root: '66',
    eligibility: 'risk:green',
    cwd: '/project',
    autonomyArgs: ['--dangerously-skip-permissions'],
    timeoutSeconds: 60,
  }

  it('spawns pair-next once, in the project, and returns the candidates the stream carried', async () => {
    const runIteration = vi.fn(async (spawn: SpawnIterationInput) => {
      spawn.onEvent?.({ type: 'assistant', text: marker({ candidates: [candidate] }) })
      return { outcome: 'success' as const, detail: 'ok' }
    })

    const result = await selectRootCandidates({ ...input, runIteration })

    expect(result).toEqual([candidate])
    expect(runIteration).toHaveBeenCalledTimes(1)
    const call = runIteration.mock.calls[0]![0]
    expect(call.cwd).toBe('/project')
    expect(call.promptText.startsWith('/pair-next --root 66 --filter risk:green')).toBe(true)
    expect(call.autonomyArgs).toEqual(['--dangerously-skip-permissions'])
  })

  it('fails closed when the selection process failed', async () => {
    const runIteration = vi.fn(async () => ({ outcome: 'failed' as const, detail: 'boom' }))
    await expect(selectRootCandidates({ ...input, runIteration })).rejects.toThrow(
      /selection.*failed.*boom/,
    )
  })

  it('fails closed when the stream carried no marker at all', async () => {
    const runIteration = vi.fn(async () => ({ outcome: 'success' as const, detail: 'ok' }))
    await expect(selectRootCandidates({ ...input, runIteration })).rejects.toThrow(
      new RegExp(`no ${CANDIDATES_MARKER}`),
    )
  })

  it('returns an empty set when pair-next selected nothing (the "nothing to do" terminal)', async () => {
    const runIteration = vi.fn(async (spawn: SpawnIterationInput) => {
      spawn.onEvent?.({ text: marker({ candidates: [] }) })
      return { outcome: 'success' as const, detail: 'ok' }
    })
    await expect(selectRootCandidates({ ...input, runIteration })).resolves.toEqual([])
  })
})
