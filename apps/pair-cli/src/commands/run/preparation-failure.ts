import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

/**
 * US-591 AC-5/AC-6: a rejected preparation leaves local implementation and/or published RED tests.
 * Observe (read-only, paths and refs only, never content) what is local vs published, say what could
 * not be observed, and print + persist it with the original refusal. Never cleans, publishes or resets.
 */
export const PREPARATION_FAILURE_FILE = 'preparation-failure.json'
const UNAVAILABLE = 'unavailable' as const

export type Git = (cwd: string, args: readonly string[]) => string | undefined
const realGit: Git = (cwd, args) => {
  try {
    return execFileSync('git', [...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trimEnd()
  } catch {
    return undefined
  }
}

export interface PreparationFailure {
  readonly refusal: string
  readonly detail?: string
  readonly worktree: string
  readonly branch: string
  readonly localChanges: readonly string[] | typeof UNAVAILABLE
  readonly localHead: string
  readonly pushedHead: string
  readonly pr: string
  readonly recovery: readonly string[]
}

const worktreeOf = (git: Git, main: string, card: string) => {
  const porcelain = git(main, ['worktree', 'list', '--porcelain'])
  if (porcelain === undefined) return undefined
  for (const block of porcelain.split('\n\n')) {
    const path = /^worktree (.+)$/m.exec(block)?.[1]
    if (path !== undefined && basename(path) === card)
      return { path, branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] }
  }
  return undefined
}

const prOf = (runDir: string): string => {
  if (!existsSync(runDir)) return UNAVAILABLE
  for (const f of readdirSync(runDir).sort().reverse()) {
    if (!/^a0.*implement-phase.*\.json$|^a0.*red-spec.*\.json$/.test(f)) continue
    try {
      const n = (JSON.parse(readFileSync(join(runDir, f), 'utf-8')) as { prNumber?: number })
        .prNumber
      if (typeof n === 'number') return `#${n} (from handoff ${f}; live state not queried)`
    } catch {
      /* unreadable handoff: keep looking */
    }
  }
  return 'none recorded in the run directory'
}

const RECOVERY = [
  'Nothing was cleaned, reset or published: local changes and any pushed RED tests are preserved.',
  'Local-only work (uncommitted/unpushed above) is a dependency of the pushed tests: review it, commit it on the story branch, and push so the PR is coherent BEFORE retrying.',
  'Never rewrite a sealed snapshot; if the sealed oracle itself is wrong, request an owner-approved correction (cycle-state approve-correction).',
  'Retry by re-running the same card: budgets are not reset.',
]

const pushedHeadOf = (git: Git, path: string, branch: string | undefined): string => {
  const remote =
    branch === undefined ? undefined : git(path, ['ls-remote', '--heads', 'origin', branch])
  return remote === undefined ? UNAVAILABLE : remote.trim().split(/\s/)[0] || 'not pushed'
}

/** `-z`: raw NUL-separated paths (never quoted); a rename/copy entry is followed by its source path field, skipped. */
const changesOf = (git: Git, path: string | undefined): PreparationFailure['localChanges'] => {
  const status = path && git(path, ['status', '--porcelain', '-z', '--untracked-files=all'])
  if (typeof status !== 'string') return UNAVAILABLE
  const fields = status.split('\0').filter(Boolean)
  const paths: string[] = []
  for (let i = 0; i < fields.length; i++) {
    paths.push(fields[i]!.slice(3))
    if (/^[RC]/.test(fields[i]!)) i++
  }
  return paths
}

const observeWorktree = (
  git: Git,
  wt: { path: string; branch: string | undefined },
): Record<'path' | 'branch' | 'head' | 'pushed', string> & {
  changes: PreparationFailure['localChanges']
} => ({
  path: wt.path,
  branch: wt.branch ?? UNAVAILABLE,
  changes: changesOf(git, wt.path),
  head: git(wt.path, ['rev-parse', 'HEAD']) || UNAVAILABLE,
  pushed: pushedHeadOf(git, wt.path, wt.branch),
})

export function observePreparationFailure(input: {
  readonly next: { reason?: unknown; refusal?: unknown; detail?: unknown }
  readonly main: string
  readonly card: string
  readonly runDir: string
  readonly git?: Git
}): PreparationFailure {
  const git = input.git ?? realGit
  const wt = worktreeOf(git, input.main, input.card)
  const here = wt
    ? observeWorktree(git, wt)
    : {
        path: UNAVAILABLE,
        branch: UNAVAILABLE,
        changes: UNAVAILABLE as typeof UNAVAILABLE,
        head: UNAVAILABLE,
        pushed: UNAVAILABLE,
      }
  return {
    refusal: String(input.next.refusal ?? input.next.reason ?? 'failed-preparation'),
    ...(typeof input.next.detail === 'string' && { detail: input.next.detail }),
    worktree: here.path,
    branch: here.branch,
    localChanges: here.changes,
    localHead: here.head,
    pushedHead: here.pushed,
    pr: prOf(input.runDir),
    recovery: RECOVERY,
  }
}

export function renderPreparationFailure(f: PreparationFailure): string[] {
  const changes =
    f.localChanges === UNAVAILABLE
      ? UNAVAILABLE
      : f.localChanges.length === 0
        ? 'none'
        : f.localChanges.join(', ')
  return [
    `  Preparation failed: ${f.refusal}`,
    `  Worktree: ${f.worktree} · branch: ${f.branch}`,
    `  Local changed/untracked paths: ${changes}`,
    `  Local head: ${f.localHead} · pushed head: ${f.pushedHead}`,
    `  PR: ${f.pr}`,
    ...f.recovery.map(r => `  Recovery: ${r}`),
  ]
}

/** Prints and persists the diagnostic; an unwritable audit is reported, never fatal. */
export function reportPreparationFailure(
  input: Parameters<typeof observePreparationFailure>[0],
): void {
  const f = observePreparationFailure(input)
  for (const line of renderPreparationFailure(f)) console.log(line)
  try {
    writeFileSync(join(input.runDir, PREPARATION_FAILURE_FILE), JSON.stringify(f, null, 2))
  } catch {
    console.log('  Audit: could not write preparation-failure.json')
  }
}
