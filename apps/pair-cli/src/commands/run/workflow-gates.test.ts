import { describe, expect, it } from 'vitest'
import { performHostKind, runStepGates } from './workflow-kinds'

describe('runStepGates (#729: a slow gate is a configuration problem)', () => {
  it('passes when every entry exits 0', async () => {
    expect(await runStepGates({}, process.cwd())(['command:true'])).toBeUndefined()
  })
  it('fails a red entry with its output', async () => {
    const result = await runStepGates({}, process.cwd())(['command:echo boom; exit 3'])
    expect(result).toMatchObject({
      status: 'failed',
      reason: 'gate-failed: command:echo boom; exit 3',
    })
    expect(result?.detail).toContain('boom')
  })
  it('fails an entry that runs past the timeout, naming the configuration', async () => {
    const result = await runStepGates({}, process.cwd(), {}, 150)(['command:sleep 5'])
    expect(result?.status).toBe('failed')
    expect(result?.detail).toContain('configuration problem')
  })
})

describe('workflow gate with GitHub facts (#726 AC-1)', () => {
  const expected = 'a'.repeat(40)
  const gate = {
    id: 'gate',
    kind: 'gate',
    uses: '',
    with: { checks: ['head-unchanged'] },
    inputs: { card: '726', reviewedHead: expected },
    attempt: 1,
  } as const

  it.each([
    [expected, { status: 'ok' }],
    ['b'.repeat(40), { status: 'failed', reason: 'head-changed' }],
  ])('checks the reviewed head against the card PR head %s', async (head, result) => {
    const read = async () => head
    const perform = performHostKind({}, process.cwd(), {}, step => ({
      head: read,
      reviewedHead: async () => step.inputs['reviewedHead'] as string,
      ci: async () => 'pending',
      reviewApproved: async () => false,
      openPrerequisites: async () => [],
    }))
    expect(await perform(gate)).toMatchObject(result)
  })
})
