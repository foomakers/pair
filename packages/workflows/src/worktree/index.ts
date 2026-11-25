interface CardWorktreeInput {
  readonly main: string
  readonly story: string
  readonly base: string
  readonly worktreeRoot?: string
}

interface WorktreePorts {
  readonly worktree: (input: CardWorktreeInput & { branch: string }) => {
    readonly path: string
    readonly branch: string
    readonly created: boolean
    readonly reused: boolean
  }
  readonly resolveBranch: (pr?: number) => string
  readonly linkedPr: () => Promise<number>
  readonly setup: (main: string, worktree: string) => Promise<string | undefined>
}

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

/** Prepare the card's branch through the host's worktree bridge and run setup on creation. */
export async function prepareCardWorktree(
  input: CardWorktreeInput,
  ports: WorktreePorts,
): Promise<string> {
  const made = await recoverWorktree(
    ports.resolveBranch(),
    branch => ports.worktree({ ...input, branch }),
    ports.linkedPr,
    ports.resolveBranch,
  )
  const failed = made.created ? await ports.setup(input.main, made.path) : undefined
  if (failed !== undefined) throw new Error(`worktree-setup-failed: ${failed}`)
  return made.path
}
