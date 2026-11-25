import { runHostProcess } from './host-process'

export { recoverWorktree } from '@pair/workflows/worktree'

/** A replay can advance a clean card branch only to its own upstream PR head. */
export async function prepareReplayHead(worktree: string, target: string): Promise<void> {
  const git = async (...args: string[]) => {
    const result = await runHostProcess('git', args, worktree)
    if (result.status !== 0)
      throw new Error(
        `replay-worktree: git ${args[0]} failed in ${worktree}: ${result.stderr.trim()}`,
      )
    return result.stdout.trim()
  }
  const clean = async () => {
    if (await git('status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'))
      throw new Error(`replay-worktree: preserve local changes in ${worktree} before resuming`)
  }
  await clean()
  const head = () => git('rev-parse', '--verify', 'HEAD')
  if ((await head()) === target) return
  const branch = await git('symbolic-ref', '--quiet', 'HEAD')
  if (!branch.startsWith('refs/heads/')) throw new Error('replay-worktree: expected a local branch')
  await git('fetch', '--no-tags', 'origin', branch)
  if ((await git('rev-parse', '--verify', 'FETCH_HEAD')) !== target)
    throw new Error('replay-worktree: the remote branch differs from the replay head')
  await git('merge-base', '--is-ancestor', 'HEAD', target)
  await clean()
  await git('merge', '--ff-only', target)
  if ((await head()) !== target)
    throw new Error('replay-worktree: fast-forward did not reach the replay head')
  await clean()
}
