import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  dispose,
  drive,
  fixtureRoot,
  headOf,
  installedCycle,
  recoveryFixture,
  resolveFrom,
  stalePreparation,
  type Fixture,
} from './fixtures/recovered-custody'

let root: string
beforeEach(() => {
  root = fixtureRoot()
})
afterEach(() => dispose(root))

const git = (tree: string, ...args: string[]) =>
  execFileSync('git', args, { cwd: tree, encoding: 'utf8', timeout: 5000 }).trim()

function siblingFixture(sealed: boolean, moved: boolean): Fixture {
  const f = recoveryFixture(root, sealed, moved, false)
  const branch = git(f.tree, 'branch', '--show-current')
  git(f.tree, 'branch', '-m', 'fixture-reviewed-history')
  git(f.tree, 'switch', '-q', '-c', branch, f.base)
  writeFileSync(join(f.tree, 'local.txt'), 'unpublished local work\n')
  git(f.tree, 'add', 'local.txt')
  git(f.tree, 'commit', '-qm', 'Unpublished local work')
  const local = headOf(f)
  if (sealed) return { ...f, local }

  const reviewed = git(f.tree, 'commit-tree', `${f.base}^{tree}`, '-p', f.base, '-m', 'Reviewed')
  const body = JSON.stringify({
    ...JSON.parse(f.review.body),
    inputHead: reviewed,
    reviewedHead: reviewed,
  })
  writeFileSync(f.review.file, body)
  return { ...f, local, reviewed, review: { ...f.review, body } }
}

function expectPark(f: Fixture, outcome: Awaited<ReturnType<typeof drive>>, attempt: number) {
  expect(outcome).toMatchObject({
    status: 'awaiting-human',
    stagesRun: 0,
    resumeToken: 'prepare:r2-g1:prepare-head-mismatch',
    next: {
      step: 'prepare',
      phase: 'r2-g1',
      base: f.reviewed,
      attempt,
      reason: 'prepare-head-mismatch',
    },
  })
  expect(f.readPackets()).toHaveLength(0)
}

function humanChoice(detail: string) {
  return (
    /\b(?:maintainer|human|operator)\b/i.test(detail) &&
    /\b(?:decid\w*|decision|choos\w*|authoriz\w*|approv\w*|must)\b/i.test(detail) &&
    /\b(?:preserv\w*|retain\w*|keep\w*|sav\w*|protect\w*)\b/i.test(detail) &&
    /\b(?:ancestr\w*|integrat\w*|reconcil\w*|restor\w*|merg\w*)\b/i.test(detail)
  )
}

function followSync(f: Fixture, detail: string) {
  const sync = detail.match(/\bbase-sync\b[^\n]*?\s--base[ =]+([a-f0-9]{40})\b/i)
  const namesGenericSync = /\buse cycle-state\.mjs base-sync for this story\b/i.test(detail)
  if (sync?.[1] !== f.reviewed && !namesGenericSync) return 'no executable recovery action'
  const base = sync?.[1] ?? 'origin/main'
  if (base === 'origin/main' && git(f.tree, 'rev-parse', base) !== f.base)
    return 'the advised integration sync does not include the reviewed commit'
  const result = spawnSync(
    process.execPath,
    [installedCycle, 'base-sync', '--cwd', f.tree, '--base', base, '--story', '7', '--dir', f.dir],
    { cwd: f.main, encoding: 'utf8', timeout: 5000 },
  )
  const response = result.stdout.trim() || result.stderr.trim()
  return `base-sync exit ${String(result.status)}: ${response}`
}

function followAction(f: Fixture, detail: string) {
  const merge = detail.match(/\bgit merge\s+(?:(?:--no-ff|--)\s+)*([a-f0-9]{40})\b/i)
  if (merge?.[1] !== f.reviewed) return followSync(f, detail)
  git(f.tree, 'merge', '--no-ff', '--no-edit', f.reviewed)
  return 'git merge'
}

async function verifyGuidance(f: Fixture, detail: string, attempt: number) {
  expect(detail).toContain(f.reviewed)
  expect(detail).toContain(f.local)
  if (humanChoice(detail)) {
    expectPark(f, await drive(f), attempt)
    expect(headOf(f)).toBe(f.local)
    expect(resolveFrom(f)?.['base']).toBe(f.reviewed)
    return
  }

  const action = followAction(f, detail)
  const head = headOf(f)
  const next = resolveFrom(f)
  const rerun = await drive(f)
  const reviewedAncestor = git(f.tree, 'merge-base', f.reviewed, head)
  expect(
    {
      reviewedAncestor,
      localAncestor: git(f.tree, 'merge-base', f.local, head),
      dispatched: rerun.stagesRun,
    },
    `${action}; next prepare base ${String(next?.['base'])}; re-run ${rerun.status}`,
  ).toEqual({ reviewedAncestor: f.reviewed, localAncestor: f.local, dispatched: 1 })
  expect(next).toMatchObject({ step: 'prepare', phase: 'r2-g1' })
  expect(f.readPackets()[0]?.at(-1)).toContain(`$phase=r2-g1 $head=${head}`)
}

it.each([
  ['sibling-review', false, false, false],
  ['sibling-stale-retry', false, false, true],
  ['sealed-sibling', true, false, false],
  ['sibling-integration-moved', false, true, false],
] as const)(
  'r5-8 %s',
  async (_scenario, sealed, moved, stale) => {
    const f = siblingFixture(sealed, moved)
    const attempt = stale ? 2 : 1
    if (stale) stalePreparation(f)
    expect(git(f.tree, 'status', '--porcelain')).toBe('')
    expect(git(f.tree, 'merge-base', f.reviewed, f.local)).toBe(f.base)
    expectPark(f, await drive(f), attempt)
    expect(headOf(f)).toBe(f.local)
    expect(resolveFrom(f)?.['base']).toBe(f.reviewed)
    const detail = (await drive(f)).next?.['detail']
    await verifyGuidance(f, String(detail ?? ''), attempt)
    expect(readFileSync(f.review.file, 'utf8')).toBe(f.review.body)
    expect(readFileSync(join(f.tree, 'local.txt'), 'utf8')).toBe('unpublished local work\n')
  },
  20_000,
)
