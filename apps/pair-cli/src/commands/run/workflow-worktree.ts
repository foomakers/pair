/** Retry a branch conflict only after resolving the card's linked PR. */
export async function recoverWorktree<T>(
  branch: string,
  prepare: (branch: string) => T,
  linkedPr: () => Promise<number>,
  resolve: (pr: number) => string,
): Promise<T> {
  try {
    return prepare(branch)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('worktree-conflict:')) throw error
    const pr = await linkedPr()
    return prepare(resolve(pr))
  }
}
