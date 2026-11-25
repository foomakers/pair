import { spawnSync } from 'node:child_process'
import { isAbsolute, join } from 'node:path'
import { prepareCardWorktree } from './index'

type Card = {
  readonly title: string | null
  readonly labels: readonly string[]
  readonly closed: boolean
}

function git(cwd: string, ...args: string[]): string | undefined {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : undefined
}

/** The first worktree in Git's porcelain output is the primary checkout. */
export function sessionMain(cwd: string): string {
  const listed = git(cwd, 'worktree', 'list', '--porcelain', '-z')?.split('\0')[0]?.slice(9)
  const unresolved = () =>
    new Error(`main-checkout-unresolved: cannot find the main checkout from ${cwd}`)
  if (!listed) throw unresolved()
  const common = git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir')
  const linked = git(cwd, 'rev-parse', '--absolute-git-dir') !== common
  const main = (linked && git(cwd, 'config', '--path', '--get', 'pair.mainCheckout')) || listed
  if (
    !isAbsolute(main) ||
    !common ||
    git(main, 'rev-parse', '--absolute-git-dir') !== common ||
    git(main, 'rev-parse', '--show-toplevel') !== main
  )
    throw unresolved()
  return main
}

function script<T>(scripts: string, cwd: string, file: string, args: string[]): T {
  const result = spawnSync(process.execPath, [join(scripts, file), ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 90_000,
  })
  if (result.error) throw result.error
  try {
    const value = JSON.parse(result.stdout) as T & { error?: string }
    if (value.error !== undefined) throw new Error(value.error)
    if (result.status === 0) return value
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
  }
  throw new Error(`${file} failed: ${result.stderr.trim() || result.stdout.trim()}`)
}

export const sessionCard = (scripts: string, main: string, story: string): Card =>
  script(scripts, main, 'cycle-state.mjs', ['workflow-card', '--story', story])

function branchFor(scripts: string, main: string, story: string, title: () => string): string {
  const pattern = `feature/US-${story}-*`
  const local = git(main, 'branch', '--list', pattern, '--format=%(refname:short)')?.split('\n')[0]
  const remote = git(
    main,
    'branch',
    '--list',
    '--remotes',
    `origin/${pattern}`,
    '--format=%(refname:lstrip=3)',
  )?.split('\n')[0]
  return (
    local ||
    remote ||
    script<{ branch: string }>(scripts, main, 'cycle-dispatch.mjs', [
      'branch',
      '--id',
      story,
      '--title',
      title(),
    ]).branch
  )
}

export function sessionWorktree(
  scripts: string,
  input: { main: string; story: string; title: () => string; adoption: string },
): Promise<string> {
  const { main, story, title, adoption } = input
  const dispatch = <T>(...args: string[]) => script<T>(scripts, main, 'cycle-dispatch.mjs', args)
  const { root } = dispatch<{ root: string }>('root', '--main', main)
  const declared = /`base-branch`\s*:\s*`([^`]+)`/.exec(adoption)?.[1] ?? 'main'
  const base = git(main, 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${declared}`)
    ? `origin/${declared}`
    : declared
  const setup = /\*\*`worktree-setup-command`\*\*:\s*`([^`]+)`/.exec(adoption)?.[1]?.trim()
  const defaultBranch = branchFor(scripts, main, story, title)

  return prepareCardWorktree(
    { main, story, base, worktreeRoot: root },
    {
      worktree: ({ branch }) =>
        dispatch(
          'worktree',
          '--main',
          main,
          '--story',
          story,
          '--base',
          base,
          '--branch',
          branch,
          '--worktree-root',
          root,
        ),
      resolveBranch: pr => (pr === undefined ? undefined : linkedBranch(main, pr)) || defaultBranch,
      async linkedPr() {
        return script<{ pr: number }>(scripts, main, 'workflow-facts.mjs', [
          'approval-target',
          story,
        ]).pr
      },
      async setup(_main, cwd) {
        return setup === undefined ? undefined : setupWorktree(setup, cwd)
      },
    },
  )
}

function linkedBranch(cwd: string, pr: number): string | undefined {
  const result = spawnSync(
    'gh',
    ['pr', 'view', String(pr), '--json', 'headRefName', '-q', '.headRefName'],
    {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GH_PROMPT_DISABLED: '1' },
      timeout: 30_000,
    },
  )
  return result.status === 0 ? result.stdout.trim() : undefined
}

function setupWorktree(command: string, cwd: string): string | undefined {
  const result = spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout: 20 * 60_000 })
  if (result.status === 0) return undefined
  const tail = (result.stderr || result.stdout).trim().split('\n').slice(-5).join('\n')
  return result.error?.message ?? `exited ${String(result.status ?? result.signal)} ${tail}`.trim()
}
