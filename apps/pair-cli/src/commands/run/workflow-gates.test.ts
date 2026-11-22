import { describe, expect, it } from 'vitest'
import { runStepGates } from './workflow-kinds'

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
