import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runHostProcess } from './host-process'
import { performHostKind, runStepGates } from './workflow-kinds'

vi.mock('./host-process', () => ({ runHostProcess: vi.fn() }))

const processCall = vi.mocked(runHostProcess)
const success = (stdout = '') => ({ status: 0, stdout, stderr: '' })

beforeEach(() => {
  processCall.mockReset().mockResolvedValue(success())
})

describe('runStepGates (#729: a slow gate is a configuration problem)', () => {
  it('passes when every entry exits 0', async () => {
    expect(await runStepGates({}, process.cwd())(['command:true'])).toBeUndefined()
  })
  it('fails a red entry with its output', async () => {
    processCall.mockResolvedValue({ status: 3, stdout: '', stderr: 'boom' })
    const result = await runStepGates({}, process.cwd())(['command:check'])
    expect(result).toMatchObject({
      status: 'failed',
      reason: 'gate-failed: command:check',
    })
    expect(result?.detail).toContain('boom')
  })
  it('fails an entry that runs past the timeout, naming the configuration', async () => {
    processCall.mockResolvedValue({ ...success(), status: null, error: new Error('timed out') })
    const result = await runStepGates({}, process.cwd(), {}, 150)(['command:check'])
    expect(processCall).toHaveBeenCalledWith('sh', ['-c', 'check'], process.cwd(), { timeout: 150 })
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
    { name: 'clean reviewed tree', local: expected, dirty: '', after: {}, passes: true },
    { name: 'different commit', local: 'b'.repeat(40), dirty: '', after: {}, passes: false },
    { name: 'modified tree', local: expected, dirty: ' M src/index.ts', after: {}, passes: false },
    { name: 'untracked file', local: expected, dirty: '?? src/new.ts', after: {}, passes: false },
    {
      name: 'gate changes HEAD',
      local: expected,
      dirty: '',
      after: { local: 'b'.repeat(40) },
      passes: false,
    },
    {
      name: 'gate changes files',
      local: expected,
      dirty: '',
      after: { dirty: 'M  src/index.ts' },
      passes: false,
    },
  ])('binds local gate evidence to the $name (726-ac4-gate-worktree-head)', async row => {
    let { local, dirty } = row
    processCall.mockImplementation(async (bin, args) => {
      if (bin === 'git' && args[0] === 'rev-parse') return success(local + '\n')
      if (bin === 'git' && args[0] === 'status') {
        expect(args).toContain('--untracked-files=all')
        expect(args).toContain('--ignore-submodules=none')
        return success(dirty)
      }
      if (bin !== 'sh') throw new Error('Unexpected host command')
      local = row.after.local ?? local
      dirty = row.after.dirty ?? dirty
      return success()
    })
    const perform = performHostKind({ unit: 'check' }, '/worktree', { pr: ['unit'] }, () => ({
      head: async () => expected,
      reviewedHead: async () => expected,
      ci: async () => 'pending',
      reviewApproved: async () => false,
      openPrerequisites: async () => [],
    }))
    const result = await perform({ ...gate, with: { ...gate.with, gates: ['target:pr'] } })
    if (row.passes) {
      expect(result).toMatchObject({ status: 'ok', gatedHead: expected })
      expect(processCall).toHaveBeenCalledWith(
        'sh',
        ['-c', 'check'],
        '/worktree',
        expect.anything(),
      )
    } else {
      expect(result).toMatchObject({ status: 'failed', reason: 'gate-worktree-mismatch' })
      expect(result).not.toHaveProperty('gatedHead')
      if (row.local !== expected || row.dirty)
        expect(processCall.mock.calls.some(([bin]) => bin === 'sh')).toBe(false)
    }
  })

  it.each([
    [expected, { status: 'ok', gatedHead: expected }],
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
