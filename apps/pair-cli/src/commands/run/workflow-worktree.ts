import { prepareReplayHead as prepareHead } from '@pair/workflows/worktree'
import { runHostProcess } from './host-process'

export { recoverWorktree } from '@pair/workflows/worktree'

export const prepareReplayHead = (worktree: string, target: string): Promise<void> =>
  prepareHead(worktree, target, runHostProcess)
