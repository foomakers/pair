import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { expect, vi } from 'vitest'
import { runCycle, type CycleResolveResult } from '../cycle'
import { createDefaultCycleDriver } from '../cycle-wiring'
import { CYCLE_WORKFLOW_VERSION } from '../cycle-scripts'
import { ENGINES } from '../engines'

vi.mock('../cycle', async importOriginal => {
  const cycle = await importOriginal<typeof import('../cycle')>()
  return { ...cycle, runCycle: vi.fn(cycle.runCycle) }
})

const repo = resolve(__dirname, '../../../../../..')
const branch = 'feature/US-7-a-story'
const baseRef = 'origin/main'
const version = CYCLE_WORKFLOW_VERSION
const pr = '42'
const story = '7'
const run = 'story-7'
const inScope = 'allowed.mjs'
const outside = 'outside.mjs'
const snapshotScript = '.claude/skills/pair-workflow-review-phase/scripts/red-snapshot.mjs'
const cycleScripts = '.claude/skills/pair-workflow-cycle/scripts'
const stages = ['cycle', 'green-fix', 'implement-phase', 'red-spec', 'red-verify', 'review-phase']
export const resolverCopies = ['dataset', 'installed'].flatMap(copy =>
  stages.map(stage => ({
    name: `${copy}-${stage}`,
    script: join(
      repo,
      copy === 'dataset'
        ? `packages/knowledge-hub/dataset/.skills/workflow/${stage}`
        : `.claude/skills/pair-workflow-${stage}`,
      'scripts/cycle-state.mjs',
    ),
  })),
)
export const installedCycle = join(repo, cycleScripts, 'cycle-state.mjs')

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5000,
  }).trim()

function nodeJson<T>(cwd: string, argv: string[], exit = 0): T {
  const output = spawnSync(process.execPath, argv, { cwd, encoding: 'utf8', timeout: 5000 })
  expect(output.status, output.stdout + output.stderr).toBe(exit)
  expect(output.stdout, output.stderr).not.toBe('')
  return JSON.parse(output.stdout) as T
}

function commit(cwd: string, message: string, ...paths: string[]) {
  git(cwd, 'add', '--', ...paths)
  git(cwd, 'commit', '-qm', message)
  return git(cwd, 'rev-parse', 'HEAD')
}

function installScripts(main: string) {
  mkdirSync(join(main, cycleScripts), { recursive: true })
  for (const file of ['cycle-state.mjs', 'cycle-dispatch.mjs', 'host']) {
    cpSync(join(repo, cycleScripts, file), join(main, cycleScripts, file), { recursive: true })
  }
  const reviewScripts = dirname(snapshotScript)
  mkdirSync(join(main, reviewScripts), { recursive: true })
  for (const file of ['red-snapshot.mjs', 'cycle-state.mjs', 'host']) {
    cpSync(join(repo, reviewScripts, file), join(main, reviewScripts, file), { recursive: true })
  }
  cpSync(join(repo, '.claude/agents'), join(main, '.claude/agents'), { recursive: true })
}

function sandboxGit() {
  vi.stubEnv('GIT_ALLOW_PROTOCOL', 'file')
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
  vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null')
  for (const key of Object.keys(process.env)) {
    if (
      /^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/.test(
        key,
      )
    )
      vi.stubEnv(key, undefined)
  }
}

function stubTools(root: string) {
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const gh = join(bin, 'gh')
  const engine = join(bin, 'engine')
  const log = join(root, 'packets.jsonl')
  writeFileSync(
    gh,
    `#!/bin/sh
case "$1:$2" in
  issue:view) printf '%s\\n' '{"title":"Fixture","body":"**Status**: Refined\\n\\n## Task Breakdown\\n\\n- [ ] T-1"}' ;;
  pr:view)
    case " $* " in
      *" headRefName "*) printf '%s\\n' '${branch}' ;;
      *) exit 1 ;;
    esac ;;
  api:*)
    case " $* " in
      *'/issues/7/comments '*) printf '%s\\n' "\${FIXTURE_COMMENTS:-[]}" ;;
      *'/issues/42/comments '*) printf '%s\\n' '[]' ;;
      *) exit 1 ;;
    esac ;;
  *) exit 1 ;;
esac
`,
  )
  writeFileSync(
    engine,
    `#!${process.execPath}
require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n')
console.log(JSON.stringify({type:'result',subtype:'success'}))
`,
  )
  chmodSync(gh, 0o755)
  chmodSync(engine, 0o755)
  vi.stubEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`)
  sandboxGit()
  return {
    engine,
    readPackets: (): string[][] =>
      existsSync(log)
        ? readFileSync(log, 'utf8')
            .trim()
            .split('\n')
            .map(line => JSON.parse(line) as string[])
        : [],
  }
}

function handoff(
  dir: string,
  {
    phase,
    skill,
    seq,
    inputHead,
  }: { phase: string; skill: string; seq: number; inputHead: string },
  data: object,
) {
  const file = join(dir, `${phase}-${skill}.json`)
  const body = JSON.stringify({
    schemaVersion: 3,
    workflowVersion: version,
    run,
    story,
    pr: Number(pr),
    phase,
    skill,
    seq,
    attempt: 1,
    inputHead,
    createdAt: '2000-01-01T00:00:00.000Z',
    ...data,
  })
  writeFileSync(file, body)
  return { file, body }
}

function prepareSeal(tree: string, dir: string) {
  const file = 'fixture.test.mjs'
  const text =
    "import { value } from './allowed.mjs'\nif (value !== 2) throw new Error('FAIL fixture')\n"
  writeFileSync(join(tree, file), text)
  const draft = join(dir, 'seal-fixture.json')
  writeFileSync(
    draft,
    JSON.stringify({
      fixScope: { owner: 'fixture', mode: 'behavioral', allowedPaths: [inScope] },
      matrix: [
        {
          id: 'fixture-row',
          kind: 'witness',
          baseline: 'red',
          condition: 'fixture',
          oracle: `node ${file}`,
          expected: '2',
          covers: ['fixture'],
        },
      ],
      redTests: [
        {
          file,
          kind: 'test',
          baseline: 'red',
          sha256: `sha256:${createHash('sha256').update(text).digest('hex')}`,
          command: `node ${file}`,
          observed: 'FAIL fixture',
        },
      ],
      testExempt: false,
    }),
  )
  return draft
}

function sealReview(tree: string, dir: string, base: string) {
  const draft = prepareSeal(tree, dir)
  const out = nodeJson<{ snapshot: string; manifest: string }>(tree, [
    join(repo, '.claude/skills/pair-workflow-red-verify/scripts/red-snapshot.mjs'),
    'seal',
    '--pr',
    pr,
    '--phase',
    'r1-g1',
    '--base',
    base,
    '--cwd',
    tree,
    '--contract',
    draft,
    '--static-gates',
    '[]',
  ])
  const seal = handoff(
    dir,
    { phase: 'r1-g1', skill: 'red-verify', seq: 1, inputHead: base },
    {
      sealed: true,
      verified: true,
      snapshot: out.snapshot,
    },
  )
  git(tree, 'rm', '-q', '--', out.manifest)
  writeFileSync(join(tree, inScope), 'export const value = 2\n')
  const reviewed = commit(tree, 'Green', inScope)
  return { reviewed, seal, snapshot: out.snapshot }
}

function outsideFinding() {
  return {
    id: 'r0-1',
    severity: 'Major',
    location: inScope,
    description: 'fixture finding',
    recommendation: 'fix fixture',
    kind: 'defect',
    transition: 'open',
    blocking: true,
  }
}

function configureOrigin(main: string, origin: string, moved: boolean) {
  git(main, 'clone', '-q', '--bare', main, origin)
  git(main, 'remote', 'add', 'origin', origin)
  if (moved) {
    git(main, 'commit', '-q', '--allow-empty', '-m', 'Integration moved')
    const integration = git(main, 'rev-parse', 'HEAD')
    // Expose the new integration commit through a throwaway local bare repository.
    git(origin, 'fetch', '-q', main, `${integration}:refs/heads/main`)
  }
  git(main, 'fetch', '-q', 'origin')
}

export function recoveryFixture(root: string, sealed: boolean, moved: boolean, breach: boolean) {
  const { engine, readPackets } = stubTools(root)
  const main = join(root, 'main')
  const tree = join(root, 'pair-worktrees', 'main', story)
  const origin = join(root, 'origin.git')
  const dir = join(main, '.pair/working/runs', run, story)
  mkdirSync(dir, { recursive: true })
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.name', 'Fixture')
  git(main, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(main, inScope), 'export const value = 1\n')
  writeFileSync(join(main, outside), 'export const value = 0\n')
  const base = commit(main, 'Init', inScope, outside)
  installScripts(main)
  git(main, 'worktree', 'add', '-q', '-b', branch, tree)
  const sealedReview = sealed ? sealReview(tree, dir, base) : undefined
  const reviewed = sealedReview?.reviewed ?? git(tree, 'rev-parse', 'HEAD')
  const review = handoff(
    dir,
    { phase: 'r1', skill: 'review-phase', seq: 2, inputHead: reviewed },
    {
      reviewedHead: reviewed,
      verdict: 'changes-requested',
      findings: [outsideFinding()],
      custody: { contractBreach: false },
      readiness: { ready: false },
    },
  )
  configureOrigin(main, origin, moved)
  if (sealed) verify({ main, tree, dir, base }, 'clean')
  const file = breach ? outside : inScope
  writeFileSync(join(tree, file), 'export const value = 3\n')
  const local = commit(tree, 'Local descendant', file)
  expect(git(tree, 'rev-parse', `origin/${branch}`)).toBe(reviewed)
  expect(git(tree, 'merge-base', reviewed, local)).toBe(reviewed)
  return { main, tree, dir, engine, readPackets, review, reviewed, local, base, sealedReview }
}

export const fixtureRoot = () => mkdtempSync(join(tmpdir(), 'pair-recovered-custody-'))

export function dispose(root: string) {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
}

export type Fixture = ReturnType<typeof recoveryFixture>
export const preparePackets = (fixture: Fixture) =>
  fixture.readPackets().filter(args => args.at(-1)?.includes('$mode=remediation'))
export const headOf = (f: Fixture) => git(f.tree, 'rev-parse', 'HEAD')
export const recoveryFile = (f: Fixture) => join(f.dir, 'recovery.json')
export const recoveryRead = (f: Fixture) =>
  JSON.parse(existsSync(recoveryFile(f)) ? readFileSync(recoveryFile(f), 'utf8') : '{}') as {
    baseSynced?: { head: string }
    rounds?: { kind: string }[]
  }

export function expectHistory(fixture: Fixture) {
  const { tree, local, review, reviewed, sealedReview } = fixture
  const head = headOf(fixture)
  expect(git(tree, 'merge-base', local, head)).toBe(local)
  expect(git(tree, 'merge-base', reviewed, head)).toBe(reviewed)
  expect(readFileSync(review.file, 'utf8')).toBe(review.body)
  if (sealedReview) {
    expect(readFileSync(sealedReview.seal.file, 'utf8')).toBe(sealedReview.seal.body)
    expect(git(tree, 'merge-base', sealedReview.snapshot, head)).toBe(sealedReview.snapshot)
  }
}

export function verify(
  f: Pick<Fixture, 'main' | 'tree' | 'dir' | 'base'>,
  verdict: 'clean' | 'breach' | 'unsealed' | 'overridden',
) {
  const report = nodeJson<{
    verified: boolean
    breaches: object[]
    contract?: string
    overriddenBreaches?: object[]
  }>(
    f.tree,
    [
      join(f.main, snapshotScript),
      'verify-chain',
      '--pr',
      pr,
      '--base',
      f.base,
      '--base-ref',
      baseRef,
      '--run-dir',
      f.dir,
      '--cwd',
      f.tree,
    ],
    verdict === 'breach' ? 1 : 0,
  )
  expect(report.verified).toBe(verdict !== 'breach')
  if (verdict === 'breach') {
    expect(report.breaches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'out-of-scope', path: outside, segment: 'r1-g1' }),
      ]),
    )
    expect(report.overriddenBreaches ?? []).toEqual([])
  }
  if (verdict === 'unsealed') expect(report.contract).toBe('none')
  if (verdict === 'overridden')
    expect(report.overriddenBreaches).toEqual([
      expect.objectContaining({ code: 'out-of-scope', path: outside, segment: 'r1-g1' }),
    ])
}

export async function drive(f: Fixture, recoveryBudget = 5) {
  const packetsBefore = f.readPackets().length
  const { runCycle: actualRun } = await vi.importActual<typeof import('../cycle')>('../cycle')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.mocked(runCycle).mockImplementationOnce(input =>
    actualRun({
      ...input,
      resolve: async () =>
        f.readPackets().length > packetsBefore
          ? { status: 'completed', next: { step: 'done' } }
          : input.resolve(),
    }),
  )
  return createDefaultCycleDriver({
    engine: { ...ENGINES.codex, command: f.engine },
    cwd: f.main,
    fs: new InMemoryFileSystemService({}, f.main, f.main),
    location: { scriptsDir: join(f.main, cycleScripts) },
    autonomyArgs: [],
    timeoutSeconds: 5,
    workflowVersion: version,
    baseBranch: baseRef,
  })({ runId: run, card: story, pr: Number(pr), budgets: { autoRecoveryRounds: recoveryBudget } })
}

export function expectCustodyRefusal(f: Fixture, outcome: Awaited<ReturnType<typeof drive>>) {
  expect.soft(outcome).toMatchObject({
    status: 'awaiting-human',
    stagesRun: 0,
    resumeToken: 'prepare:r2-g1:prepare-head-mismatch',
    next: { step: 'prepare', phase: 'r2-g1', base: f.reviewed, reason: 'prepare-head-mismatch' },
    reason: expect.stringContaining('base-sync verify-chain failed: custody does not hold'),
  })
}

export function expectPendingFinding(f: Fixture) {
  expect.soft(resolveFrom(f)).toMatchObject({
    step: 'prepare',
    phase: 'r2-g1',
    base: f.reviewed,
    findings: [outsideFinding()],
  })
}

export function runSync(f: Fixture, script = installedCycle) {
  return nodeJson<{ head: string; synced: boolean; reason?: string }>(f.main, [
    script,
    'base-sync',
    '--cwd',
    f.tree,
    '--base',
    baseRef,
    '--story',
    story,
    '--dir',
    f.dir,
  ])
}

export function resolveFrom(
  f: Fixture,
  script = installedCycle,
  representation: 'cli' | 'function' = 'cli',
) {
  const input = {
    dir: f.dir,
    workflowVersion: version,
    policy: { autoRecoveryRounds: 5 },
    entry: 'pr',
    story,
    pr: Number(pr),
  }
  const argv =
    representation === 'cli'
      ? [
          script,
          'resolve',
          '--dir',
          input.dir,
          '--workflowVersion',
          version,
          '--entry',
          'pr',
          '--story',
          story,
          '--pr',
          pr,
          '--policy',
          JSON.stringify(input.policy),
        ]
      : [
          '--input-type=module',
          '-e',
          'import { pathToFileURL } from "node:url"; const { resolve } = await import(pathToFileURL(process.argv[2]).href); console.log(JSON.stringify(resolve(JSON.parse(process.argv[1]))))',
          JSON.stringify(input),
          script,
        ]
  return nodeJson<CycleResolveResult>(f.main, argv).next
}

export function pinLegacyMemo(f: Fixture, at = '2099-01-01T00:00:00.000Z', head = headOf(f)) {
  writeFileSync(
    recoveryFile(f),
    JSON.stringify({
      ...recoveryRead(f),
      baseSynced: { head, cwd: f.tree, at },
    }),
  )
}

export function newerReviewedHead(f: Fixture) {
  const current = headOf(f)
  handoff(
    f.dir,
    { phase: 'r2', skill: 'review-phase', seq: 3, inputHead: current },
    {
      createdAt: '2000-01-03T00:00:00.000Z',
      reviewedHead: current,
      verdict: 'changes-requested',
      findings: [outsideFinding()],
      custody: { contractBreach: false },
      readiness: { ready: false },
    },
  )
  return current
}

const decisionRef = 'https://github.com/fixture/pair/issues/7#issuecomment-9'

export function grantOverride(f: Fixture, target: { path?: string; segment?: string } = {}) {
  const adoption = join(f.main, '.pair/adoption/tech')
  mkdirSync(adoption, { recursive: true })
  writeFileSync(join(adoption, 'way-of-working.md'), '- `default-assignee`: `fixture-maintainer`\n')
  const hash = createHash('sha256').update(f.review.body).digest('hex').slice(0, 12)
  const body =
    '```json\n' +
    JSON.stringify({
      schemaVersion: 1,
      kind: 'maintainer-decision',
      story,
      block: `${basename(f.review.file)}@${hash}`,
      choice: 'override',
      reason: 'Accept the fixture change',
      overrides: [{ code: 'out-of-scope', path: outside, segment: 'r1-g1', ...target }],
    }) +
    '\n```'
  const comment = {
    id: 9,
    body,
    html_url: decisionRef,
    user: { login: 'fixture-maintainer', type: 'User' },
    created_at: '2000-01-02T00:00:00.000Z',
    updated_at: '2000-01-02T00:00:00.000Z',
  }
  vi.stubEnv('FIXTURE_COMMENTS', JSON.stringify([comment]))
  return comment
}

export function pickUpDecisions(f: Fixture) {
  return nodeJson<{
    errors: string[]
    recorded: { decisionRef: string; status: string; choice: string }[]
    revoked: { decisionRef: string; reason: string }[]
  }>(f.main, [
    join(f.main, cycleScripts, 'cycle-state.mjs'),
    'decisions',
    '--dir',
    f.dir,
    '--story',
    story,
    '--pr',
    pr,
  ])
}

export function moveAdmittedMemo(f: Fixture) {
  writeFileSync(join(f.tree, outside), 'export const value = 4\n')
  const head = commit(f.tree, 'Unreviewed change', outside)
  const approved = recoveryRead(f)
  writeFileSync(
    recoveryFile(f),
    JSON.stringify({
      ...approved,
      baseSynced: { ...approved.baseSynced, head },
    }),
  )
  return head
}

export function stalePreparation(f: Fixture) {
  handoff(
    f.dir,
    { phase: 'r2-g1', skill: 'red-spec', seq: 3, inputHead: f.reviewed },
    {
      status: 'stale',
      mode: 'remediation',
      createdAt: '2000-01-02T00:00:00.000Z',
    },
  )
}
