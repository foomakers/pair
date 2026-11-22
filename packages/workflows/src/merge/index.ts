import type { StepResult } from '../kinds'

export interface MergeAdapter {
  /** The PR head now. */
  head(pr: number): Promise<string>
  /** Merges; a platform refusal (protection, conflicts) is `ok: false` with its reason. */
  merge(
    pr: number,
    method: string,
  ): Promise<
    { readonly ok: true; readonly commit: string } | { readonly ok: false; readonly reason: string }
  >
  /** Story closure: DoD ticked, card Done, cascade, cleanup of branches, worktree and checkpoint. */
  close(card: string): Promise<void>
}

/** Merges `pr` if its head is still `head`, then closes the card. Checks nothing else: gates and approval come before. */
export async function runMerge(
  input: {
    readonly card: string
    readonly pr: number
    readonly head: string
    readonly method?: string
  },
  adapter: MergeAdapter,
): Promise<StepResult> {
  if ((await adapter.head(input.pr)) !== input.head)
    return {
      status: 'failed',
      reason: 'head-moved',
      summary: `PR #${input.pr} head is not ${input.head}`,
    }
  const done = await adapter.merge(input.pr, input.method ?? 'squash')
  if (!done.ok)
    return {
      status: 'failed',
      reason: done.reason,
      summary: `the platform refused the merge of #${input.pr}`,
    }
  await adapter.close(input.card)
  return { status: 'ok', summary: `merged #${input.pr}`, merged: true, mergeCommit: done.commit }
}
