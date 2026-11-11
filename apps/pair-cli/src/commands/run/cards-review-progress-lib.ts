import { afterEach, beforeEach, expect, vi } from 'vitest'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import type { CardProcessExit } from './parallel'

// Real CLI/adapter subprocesses need headroom when the full quality gate runs concurrently.
vi.setConfig({ testTimeout: 30000 })

export let root: string
export const repository = resolve(__dirname, '../../../../..')
export const reviewScript = join(
  repository,
  '.claude/skills/pair-workflow-review-phase/scripts/pr-state.mjs',
)
export const mapping =
  'Github Projects is adopted for project management.\n\n## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Checking | Review |\n| Finished | Done |\n'
export const card = () => ({
  number: 12,
  title: 'Card',
  body: '',
  labels: [],
  state: 'OPEN',
  stateReason: null as string | null,
  closedAt: null as string | null,
  projectItems: [{ status: { name: 'Checking' } }],
})
export const pr = () => ({
  number: 42,
  title: 'Card 12',
  body: 'Closes #12',
  state: 'OPEN',
  isDraft: false,
  headRefOid: 'a'.repeat(40),
  labels: [{ name: 'pr-state:to-be-reviewed' }],
  reviewDecision: 'REVIEW_REQUIRED' as string | null,
  statusCheckRollup: [] as { context: string; state: string }[],
  mergedAt: null as string | null,
  closingIssuesReferences: [{ number: 12 }] as { number: number }[] | null,
})
export type Tracker = {
  cards: Record<string, ReturnType<typeof card>>
  prs: ReturnType<typeof pr>[]
}
export const initial = (): Tracker => ({
  cards: { 12: card(), 15: { ...card(), number: 15 } },
  prs: [pr()],
})
export const save = (state: Tracker) =>
  writeFileSync(join(root, 'tracker.json'), JSON.stringify(state))
export const load = (): Tracker => JSON.parse(readFileSync(join(root, 'tracker.json'), 'utf8'))
export const retry: CardProcessExit = {
  exitCode: 1,
  signal: null,
  cycleStatus: 'rounds-bound-reached',
}
export const target: CardProcessExit = { exitCode: 0, signal: null, cycleStatus: 'target-ready' }

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-review-progress-')))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  writeFileSync(
    join(bin, 'gh'),
    `#!${process.execPath}\n${readFileSync(join(__dirname, '__fixtures__/cards-review-gh.cjs'), 'utf8')}`,
    { mode: 0o755 },
  )
  symlinkSync(process.execPath, join(bin, 'node'))
  vi.stubEnv('PATH', `${bin}:/usr/bin:/bin`)
  vi.stubEnv('PAIR_GH_BIN', join(bin, 'gh'))
  vi.stubEnv('PAIR_REVIEW_FIXTURE', root)
  mkdirSync(join(root, '.pair/adoption/tech'), { recursive: true })
  writeFileSync(join(root, '.pair/adoption/tech/way-of-working.md'), mapping)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})
export function installed() {
  cpSync(
    join(repository, '.claude/skills/pair-workflow-cycle/scripts'),
    join(root, '.claude/skills/pair-workflow-cycle/scripts'),
    { recursive: true },
  )
}
export function conclude(state: Tracker, verdict = 'approved') {
  save(state)
  const result = spawnSync(
    process.execPath,
    [
      reviewScript,
      'conclude',
      '--pr',
      '42',
      '--sha',
      state.prs[0]!.headRefOid,
      '--verdict',
      verdict,
      '--repo',
      'fixture/repo',
    ],
    { cwd: root, encoding: 'utf8', timeout: 5000 },
  )
  expect(result.status, result.stdout + result.stderr).toBe(0)
  const out = JSON.parse(result.stdout)
  expect(out.check.published).toBe(true)
  expect(out.label.confirmed).toBe(true)
  const after = load()
  expect(after.prs[0]!.reviewDecision).toBe(state.prs[0]!.reviewDecision)
  state.prs = after.prs
  return out
}
export async function invoke(
  state: Tracker,
  step: (id: string, count: number) => CardProcessExit,
  cards = '12',
  cap = 4,
) {
  save(state)
  const calls: string[] = []
  const counts = new Map<string, number>()
  const output: string[] = []
  const audit: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.join(' '))
  })
  const files = {
    [join(root, 'config.json')]: JSON.stringify({ asset_registries: {} }),
    [join(root, '.pair/adoption/tech/way-of-working.md')]: mapping,
  }
  const code = await handleRunCommand(
    parseRunCommand({ cwd: root, cards, autonomous: true, maxIterations: cap }),
    new InMemoryFileSystemService(files, root, root),
    {
      runCardProcess: async ({ card: selected }) => {
        calls.push(selected.id)
        const n = (counts.get(selected.id) ?? 0) + 1
        counts.set(selected.id, n)
        const result = step(selected.id, n)
        save(state)
        return result
      },
      appendAudit: (_path, line) => {
        audit.push(line)
      },
    },
  )
  expect(existsSync(join(root, 'unexpected.txt'))).toBe(false)
  return { code, calls, output: output.join('\n'), audit: audit.join('\n') }
}
export function expectProgress(result: Awaited<ReturnType<typeof invoke>>, advances: boolean) {
  expect(result.calls).toEqual(advances ? ['12', '12'] : ['12'])
  expect(result.code).toBe(advances ? 0 : 1)
  expect(result.output).toContain(`Stop: ${advances ? 'all-at-target' : 'no-progress'}`)
  expect(result.audit).toContain(`12:${advances ? 'at-target' : 'retryable'}`)
}
export function ready(state: Tracker) {
  const selected = state.prs[0]!
  selected.labels = [{ name: 'pr-state:ready-to-merge' }]
  selected.statusCheckRollup = [{ context: 'pair-review', state: 'SUCCESS' }]
}
export const incomplete = (
  [
    ['label-only', 'SUCCESS', false, true, 'pair-review'],
    ['check-only', 'SUCCESS', true, false, 'pair-review'],
    ['native-only', 'SUCCESS', false, false, 'pair-review'],
    ['pending', 'PENDING', true, true, 'pair-review'],
    ['failure', 'FAILURE', true, true, 'pair-review'],
    ['error', 'ERROR', true, true, 'pair-review'],
    ['unknown', 'UNKNOWN', true, true, 'pair-review'],
    ['other-context', 'SUCCESS', true, true, 'build'],
  ] as const
).map(([id, status, hasCheck, hasLabel, context]) => ({ id, status, hasCheck, hasLabel, context }))
export const associations = [
  { id: 'matching', refs: [{ number: 12 }], body: '', advances: true },
  { id: 'multiple', refs: [{ number: 15 }, { number: 12 }], body: '', advances: true },
  { id: 'other-overrides', refs: [{ number: 15 }], body: 'Related context #12', advances: false },
  { id: 'empty-mention', refs: [], body: 'Related context #12', advances: false },
  { id: 'absent-mention', refs: null, body: 'Related context #12', advances: false },
  { id: 'empty-body', refs: [], body: '', advances: false },
  { id: 'numeric-collision', refs: [], body: 'Closes #120', advances: false },
] as const
