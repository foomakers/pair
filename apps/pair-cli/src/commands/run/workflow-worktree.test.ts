import { expect, it, vi } from 'vitest'
import { recoverWorktree } from './workflow-worktree'

it('retries a conflicting worktree with the linked PR branch (#738)', async () => {
  const prepare = vi
    .fn()
    .mockImplementationOnce(() => {
      throw new Error('worktree-conflict: branch mismatch')
    })
    .mockReturnValue('/existing')
  const linked = vi.fn().mockResolvedValue(739)
  const resolve = vi.fn().mockReturnValue('fix/US-738-existing')
  await expect(recoverWorktree('feature/US-738-generated', prepare, linked, resolve)).resolves.toBe(
    '/existing',
  )
  expect(resolve).toHaveBeenCalledWith(739)
  expect(prepare).toHaveBeenLastCalledWith('fix/US-738-existing')
})

it('preserves failures other than a worktree conflict', async () => {
  const linked = vi.fn()
  await expect(
    recoverWorktree(
      'branch',
      () => {
        throw new Error('disk failed')
      },
      linked,
      vi.fn(),
    ),
  ).rejects.toThrow('disk failed')
  expect(linked).not.toHaveBeenCalled()
})
