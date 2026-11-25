import { vi } from 'vitest'
import type { prepareCardWorktree } from './index'

type PrepareCardWorktree = typeof prepareCardWorktree
type WorktreePorts = Parameters<PrepareCardWorktree>[1]

const adapters = import.meta.glob<PrepareCardWorktree>('./index.ts', {
  eager: true,
  import: 'prepareCardWorktree',
})

function sharedWorktree() {
  const prepare = adapters['./index.ts']
  expect(prepare, 'shared worktree adapter exports prepareCardWorktree').toBeTypeOf('function')
  return prepare as PrepareCardWorktree
}

const request = {
  main: '/checkout',
  story: '696',
  base: 'release',
  worktreeRoot: '/configured worktrees',
}
const path = '/configured worktrees/696'
const branch = 'feature/US-696-example'
const linkedBranch = 'feature/US-696-existing'
const pr = 706

function fixture() {
  return {
    worktree: vi.fn<WorktreePorts['worktree']>().mockReturnValue({
      path,
      branch,
      created: true,
      reused: false,
    }),
    resolveBranch: vi.fn<WorktreePorts['resolveBranch']>().mockReturnValue(branch),
    linkedPr: vi.fn<WorktreePorts['linkedPr']>().mockResolvedValue(pr),
    setup: vi.fn<WorktreePorts['setup']>().mockResolvedValue(undefined),
  }
}

describe('shared card worktree preparation (#696 T-3)', () => {
  it('passes the requested root, base and branch to Git and runs setup on creation', async () => {
    const prepare = sharedWorktree()
    const ports = fixture()
    await expect(prepare(request, ports)).resolves.toBe(path)
    expect(ports.worktree).toHaveBeenCalledExactlyOnceWith({ ...request, branch })
    expect(ports.setup).toHaveBeenCalledExactlyOnceWith(request.main, path)
  })

  it('reuses the card worktree without running setup or looking up a PR', async () => {
    const prepare = sharedWorktree()
    const ports = fixture()
    ports.worktree.mockReturnValue({ path, branch, created: false, reused: true })
    await expect(prepare(request, ports)).resolves.toBe(path)
    expect(ports.setup).not.toHaveBeenCalled()
    expect(ports.linkedPr).not.toHaveBeenCalled()
  })

  it('recovers a Git worktree conflict using the branch of the linked PR', async () => {
    const prepare = sharedWorktree()
    const ports = fixture()
    ports.worktree
      .mockImplementationOnce(() => {
        throw new Error('worktree-conflict: branch mismatch')
      })
      .mockReturnValueOnce({ path, branch: linkedBranch, created: false, reused: true })
    ports.resolveBranch.mockImplementation(number => (number === pr ? linkedBranch : branch))
    await expect(prepare(request, ports)).resolves.toBe(path)
    expect(ports.worktree).toHaveBeenNthCalledWith(1, { ...request, branch })
    expect(ports.linkedPr).toHaveBeenCalledTimes(1)
    expect(ports.worktree).toHaveBeenNthCalledWith(2, { ...request, branch: linkedBranch })
    expect(ports.setup).not.toHaveBeenCalled()
  })

  it('reports the reason when setup fails on a newly created worktree', async () => {
    const prepare = sharedWorktree()
    const ports = fixture()
    ports.setup.mockResolvedValue('install exited 1')
    await expect(prepare(request, ports)).rejects.toThrow('worktree-setup-failed: install exited 1')
  })
})
