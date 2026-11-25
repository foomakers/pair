import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { acquireCardLock, acquireRunLock } from '../src/cli'
import { next, record, start } from '../src/engine'

const repo = join(__dirname, '../../..')
const script = '.claude/skills/pair-capability-workflow/scripts/workflow.mjs'
const cycle = '.claude/skills/pair-workflow-cycle/scripts'
const workflowFile = '.pair/adoption/tech/workflows/quick.yaml'
const configFile = '.pair/adoption/tech/configurations/mine.yaml'
const adoptionFile = '.pair/adoption/tech/way-of-working.md'
const filesystemPm = '- `pm-tool`: `filesystem`\n'
const card = '42'
const title = 'Prepare release notes'
const runId = `quick-${card}`
const branch = `feature/US-${card}-prepare-release-notes`
const backlog = '.pair/adoption/product/backlog/03-user-stories'
const cardFile = `${backlog}/not-started/${card}.md`
const workflow = `version: 1
name: quick
steps:
  draft:
    kind: generic
    skill: pair-fixture-draft
    escalate: { failed: stop, blocked: stop, needs-decision: stop }
  discuss:
    kind: generic
    skill: pair-fixture-discuss
    interactive: true
    escalate: { failed: stop, blocked: stop, needs-decision: stop }
`
const configurationDefaults = `version: 1
name: mine
defaults: { engine: codex, model: gpt-5, effort: medium }
`
const configuration = `${configurationDefaults}steps:
  discuss: { effort: high }
`
const drafted = { status: 'ok', summary: 'Draft prepared' }
const discussed = { status: 'ok', summary: 'Discussion finished' }
const fenced = (result: unknown) =>
  `Step complete.\n\`\`\`json\n${JSON.stringify(result)}\n\`\`\`\n`
const hash = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const files = {
  existsSync,
  readFileSync: (path: string) => readFileSync(path, 'utf8'),
  mkdir,
  rename,
  writeFile,
}

let main: string
let runDir: string
let worktree: string

function write(path: string, value: string) {
  const file = join(main, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, value)
}

function git(...args: string[]) {
  return execFileSync('git', args, {
    cwd: main,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function commitFixture() {
  git('add', '.')
  git(
    '-c',
    'user.name=Pair Fixture',
    '-c',
    'user.email=fixture@example.test',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-m',
    'Fixture',
  )
}

beforeEach(() => {
  main = realpathSync(mkdtempSync(join(tmpdir(), 'pair-session-command-')))
  runDir = join(main, '.pair/working/runs', runId)
  worktree = join(main, 'worktrees', card)
  git('init', '-b', 'main')
  write('.gitignore', '/worktrees/\n/.pair/working/\n')
  write('pair.config.json', JSON.stringify({ worktreeRoot: 'worktrees' }))
  write(adoptionFile, filesystemPm)
  write(cardFile, `# ${title}\n\n**Status**: Ready\n`)
  write(workflowFile, workflow)
  write(configFile, configuration)
  for (const skill of ['pair-fixture-draft', 'pair-fixture-discuss'])
    write(
      `.claude/skills/${skill}/SKILL.md`,
      `---\nname: ${skill}\ndescription: Fixture skill\n---\n`,
    )
  cpSync(join(repo, cycle), join(main, cycle), { recursive: true })
  const control = '.claude/skills/pair-next/control-state.mjs'
  mkdirSync(dirname(join(main, control)), { recursive: true })
  cpSync(join(repo, control), join(main, control))
  mkdirSync(dirname(join(main, script)), { recursive: true })
  cpSync(join(repo, script), join(main, script))
  commitFixture()
})

afterEach(() => rmSync(main, { recursive: true, force: true }))

function invoke(args: string[], input?: string, cwd = main) {
  return spawnSync(process.execPath, [join(main, script), ...args], {
    cwd,
    input,
    encoding: 'utf8',
    timeout: 5_000,
    env: { ...process.env, NODE_PATH: '' },
  })
}

function successful(args: string[], input?: string, cwd?: string): string {
  const result = invoke(args, input, cwd)
  expect(result.status, result.error?.message ?? (result.stderr || result.stdout)).toBe(0)
  return result.stdout
}

function openSession(args: string[], cwd?: string) {
  const opened = JSON.parse(successful(args, undefined, cwd)) as {
    runId: string
    lease: string
    worktree: string
  }
  expect(opened).toMatchObject({ runId, worktree, lease: expect.any(String) })
  expect(opened.lease).not.toBe('')
  return ['--lease', opened.lease]
}

const readRun = (file: string) => readFileSync(join(runDir, file), 'utf8')

it('#696 AC-8: validates and previews effective settings without opening a run', () => {
  expect(
    JSON.parse(successful(['validate', 'quick', '--engine', 'codex', '--config', 'mine'])),
  ).toMatchObject({
    file: join(main, workflowFile),
    workflow: 'quick',
    configuration: 'mine',
    steps: [
      { id: 'draft', settings: { engine: 'codex', model: 'gpt-5', effort: 'medium' } },
      { id: 'discuss', settings: { engine: 'codex', model: 'gpt-5', effort: 'high' } },
    ],
    warnings: [],
  })
  expect(existsSync(dirname(runDir))).toBe(false)
  expect(git('worktree', 'list', '--porcelain')).not.toContain(`worktree ${worktree}\n`)
})

it('#696 AC-8: validates the mapped configuration from a staged non-Git project', () => {
  const staged = realpathSync(mkdtempSync(join(tmpdir(), 'pair-workflow-staged-')))
  try {
    for (const folder of ['.pair', '.claude'])
      cpSync(join(main, folder), join(staged, folder), { recursive: true })
    writeFileSync(
      join(staged, 'pair.config.json'),
      JSON.stringify({ workflows: { quick: { configuration: 'mine' } } }),
    )

    expect(JSON.parse(successful(['validate', 'quick'], undefined, staged))).toMatchObject({
      file: join(staged, workflowFile),
      configuration: 'mine',
    })
  } finally {
    rmSync(staged, { recursive: true, force: true })
  }
})

it('#696 AC-8: rejects validation when a workflow requires a missing skill', () => {
  write(workflowFile, workflow.replace('pair-fixture-draft', 'pair-missing-skill'))

  const result = invoke(['validate', 'quick', '--engine', 'codex'])
  expect(result.status).toBe(1)
  expect(JSON.parse(result.stderr)).toMatchObject({
    error: expect.stringMatching(
      /workflow-invalid:[\s\S]*skill 'pair-missing-skill' is not installed/,
    ),
  })
})

it('#696 design §2: exposes serializable workflow kinds', () => {
  expect(JSON.parse(successful(['kinds']))).toMatchObject({
    generic: { name: 'generic', defaultInteractive: false },
  })
})

it('#696 design §2: lists project workflows and configurations by source', () => {
  expect(JSON.parse(successful(['list']))).toMatchObject({
    workflows: expect.arrayContaining([
      { name: 'quick', file: join(main, workflowFile), source: 'project' },
    ]),
    configurations: expect.arrayContaining([
      { name: 'mine', file: join(main, configFile), source: 'project' },
    ]),
  })
})

it('#696 design §2: expands included workflow steps in order', () => {
  write(
    '.pair/adoption/tech/workflows/nested.yaml',
    'version: 1\nname: nested\nsteps:\n  included: { kind: generic, uses: quick }\n',
  )

  expect(JSON.parse(successful(['expand', 'nested']))).toMatchObject({
    name: 'nested',
    steps: [{ id: 'included/draft' }, { id: 'included/discuss' }],
  })
})

it('#696 AC-1/AC-2/AC-5: advances a session run through the shipped script and resumes its frozen inputs', () => {
  const lease = openSession([
    'start',
    'quick',
    '--card',
    card,
    '--engine',
    'codex',
    '--config',
    'mine',
  ])
  expect(git('worktree', 'list', '--porcelain')).toContain(`worktree ${worktree}\n`)
  expect(acquireRunLock(runDir).kind).toBe('run-locked')
  const frozenWorkflow = readRun('workflow.yaml')
  const frozenConfig = readRun('configuration.yaml')
  expect(JSON.parse(readRun('state.json'))).toMatchObject({
    card,
    workflow: { name: 'quick', hash: hash(frozenWorkflow) },
    configuration: { hash: hash(frozenConfig) },
  })

  const first = JSON.parse(successful(['next', runId, ...lease]))
  expect(first).toMatchObject({
    run: 'running',
    ready: [
      {
        id: 'draft',
        message: expect.stringMatching(
          /pair-fixture-draft[\s\S]*- card: 42[\s\S]*fenced `json` block/,
        ),
        interactive: false,
        settings: { engine: 'codex', model: 'gpt-5', effort: 'medium' },
      },
    ],
  })
  expect(
    JSON.parse(
      successful(
        ['record', runId, 'draft', ...lease, '--result', '-', '--model', 'gpt-6-sol'],
        fenced(drafted),
      ),
    ),
  ).toMatchObject(drafted)
  expect(JSON.parse(readRun('steps/draft/result.json'))).toMatchObject(drafted)
  expect(readRun('steps/draft/output.log')).toBe(fenced(drafted))
  successful(['stop', runId, ...lease])

  writeFileSync(join(worktree, 'draft.local'), 'Retain local work')
  write(workflowFile, 'The authoring source changed.\n')
  write(configFile, 'The configuration source changed.\n')
  const resumed = openSession(['resume', runId, '--engine', 'codex'], worktree)
  expect(readFileSync(join(worktree, 'draft.local'), 'utf8')).toBe('Retain local work')
  const interactive = JSON.parse(successful(['next', runId, ...resumed], undefined, worktree)) as {
    ready: Array<{ message: string }>
  }
  expect(interactive).toMatchObject({
    run: 'running',
    ready: [
      {
        id: 'discuss',
        message: expect.stringContaining('pair-fixture-discuss'),
        interactive: true,
        settings: { engine: 'codex', model: 'gpt-5', effort: 'high' },
      },
    ],
  })
  expect(interactive.ready[0]?.message).not.toContain('Execution mode: unattended.')
  expect(
    JSON.parse(
      successful(['record', runId, 'discuss', ...resumed, '--result', '-'], fenced(discussed)),
    ),
  ).toMatchObject(discussed)
  expect(JSON.parse(successful(['next', runId, ...resumed]))).toMatchObject({
    run: 'done',
    ready: [],
  })
  expect(readRun('workflow.yaml')).toBe(frozenWorkflow)
  expect(readRun('configuration.yaml')).toBe(frozenConfig)
  const finalState = JSON.parse(readRun('state.json')) as { steps: Record<string, unknown> }
  expect(finalState).toMatchObject({
    steps: {
      draft: { state: 'ok', executions: 1, host: 'session', model: 'gpt-6-sol' },
      discuss: { state: 'ok', host: 'session' },
    },
  })
  expect(finalState.steps['discuss']).not.toHaveProperty('model')
  successful(['stop', runId, ...resumed])
  expect(existsSync(join(runDir, 'run.lock'))).toBe(false)
}, 15_000)

async function seedHeadlessRun() {
  const run = { dir: runDir, files }
  await start(run, { file: join(main, workflowFile), text: workflow }, { card })
  await next(run)
  await record(run, 'draft', drafted, { host: 'pair-run', model: 'gpt-5' })
  await next(run)
  git('worktree', 'add', '-b', branch, worktree, 'main')
}

it('#696 AC-4: refuses to resume a run held by the live headless lock', async () => {
  await seedHeadlessRun()
  const lock = acquireRunLock(runDir)
  if (lock.kind !== 'acquired') throw new Error(`Fixture could not acquire ${runId}`)
  try {
    const saved = readRun('state.json')
    const result = invoke(['resume', runId, '--engine', 'codex'])
    expect(result.status).toBe(1)
    expect(result.stderr || result.stdout).toContain('run-locked')
    expect(readRun('state.json')).toBe(saved)
  } finally {
    lock.release()
  }
})

it('#696 AC-4: takes over an orphaned headless run and relaunches its interrupted step', async () => {
  await seedHeadlessRun()
  const owner = spawnSync(process.execPath, ['-e', ''], { timeout: 5_000 })
  expect(owner.status).toBe(0)
  writeFileSync(
    join(runDir, 'run.lock'),
    JSON.stringify({ pid: owner.pid, host: hostname(), startedAt: new Date().toISOString() }),
  )

  const lease = openSession(['resume', runId, '--engine', 'codex'])
  expect(JSON.parse(successful(['next', runId, ...lease]))).toMatchObject({
    run: 'running',
    ready: [{ id: 'discuss', attempt: 2 }],
  })
  expect(JSON.parse(readRun('state.json'))).toMatchObject({
    steps: {
      draft: { state: 'ok', executions: 1, host: 'pair-run', model: 'gpt-5' },
      discuss: { state: 'running', executions: 2 },
    },
  })
  successful(['stop', runId, ...lease])
})

it('#696 AC-1/AC-4: resumes a completed headless run without recreating its worktree', async () => {
  await seedHeadlessRun()
  const run = { dir: runDir, files }
  await record(run, 'discuss', discussed, { host: 'pair-run' })
  expect(await next(run)).toMatchObject({ run: 'done', ready: [] })
  git('worktree', 'remove', worktree)
  const outcomes = ['state.json', 'steps/draft/result.json', 'steps/discuss/result.json']
  const saved = outcomes.map(readRun)

  const opened = JSON.parse(successful(['resume', runId, '--engine', 'codex'])) as {
    lease: string
  }

  expect(opened).toMatchObject({ runId, status: 'complete' })
  successful(['stop', runId, '--lease', opened.lease])
  expect(outcomes.map(readRun)).toEqual(saved)
  expect(existsSync(worktree)).toBe(false)
  expect(git('worktree', 'list', '--porcelain')).not.toContain(`worktree ${worktree}\n`)
})

const namedWorkflow = (steps: string) => `version: 1\nname: quick\nsteps:\n${steps}`

function startWorkflow(steps: string) {
  write(workflowFile, namedWorkflow(steps))
  return openSession(['start', 'quick', '--card', card, '--engine', 'codex'])
}

const advance = (lease: string[]) => JSON.parse(successful(['next', runId, ...lease])) as unknown

function startTelemetrySession(enabled: boolean) {
  write(workflowFile, namedWorkflow('  draft: { kind: generic, skill: pair-fixture-draft }\n'))
  write(configFile, `${configurationDefaults}telemetry: ${String(enabled)}\n`)
  const lease = openSession([
    'start',
    'quick',
    '--card',
    card,
    '--engine',
    'codex',
    '--config',
    'mine',
  ])
  write(configFile, `${configurationDefaults}telemetry: ${String(!enabled)}\n`)
  return lease
}

const readTelemetry = () =>
  readRun('telemetry.jsonl')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line) as unknown)

it.each(['measured', 'estimated'] as const)('#696 AC-10: records %s session usage', source => {
  const lease = startTelemetrySession(true)
  const launch = advance(lease) as { ready: [{ message: string; attempt: number }] }
  expect(launch).toMatchObject({ ready: [{ id: 'draft', attempt: 1 }] })
  const [{ message, attempt }] = launch.ready
  const final = fenced(drafted)
  const usage = { read: 113, cached: 17, written: 29 }
  expect(
    JSON.parse(
      successful(
        [
          'record',
          runId,
          'draft',
          ...lease,
          '--attempt',
          String(attempt),
          '--result',
          '-',
          '--model',
          'gpt-6-sol',
          ...(source === 'measured' ? ['--usage', JSON.stringify(usage)] : []),
        ],
        final,
      ),
    ),
  ).toMatchObject(drafted)

  const identity = { schema: 2, run: runId, workflow: 'quick', card }
  const tokens = {
    read: { value: source === 'measured' ? usage.read : Math.ceil(message.length / 4), source },
    cached:
      source === 'measured' ? { value: usage.cached, source } : { value: null, source: 'unknown' },
    written: { value: source === 'measured' ? usage.written : Math.ceil(final.length / 4), source },
  }
  const steps = readTelemetry()
  expect(steps).toMatchObject([
    {
      ...identity,
      type: 'step',
      step: 'draft',
      kind: 'generic',
      uses: 'pair-fixture-draft',
      host: 'session',
      engine: 'codex',
      model: 'gpt-6-sol',
      effort: 'medium',
      attempt: 1,
      status: 'ok',
      durationMs: expect.any(Number),
      tokens,
      ...(source === 'estimated' && { estimate: 'lower-bound-from-text' }),
    },
  ])
  if (source === 'measured') expect(steps[0]).not.toHaveProperty('estimate')

  expect(advance(lease)).toMatchObject({ run: 'done', ready: [] })
  expect(readTelemetry()).toMatchObject([
    ...steps,
    {
      ...identity,
      type: 'run',
      status: 'done',
      steps: 1,
      durationMs: expect.any(Number),
      tokens: {
        ...tokens,
        cached: {
          ...tokens.cached,
          ...(source === 'estimated' && { unknown: ['draft#1'] }),
        },
      },
    },
  ])
})

it('#696 AC-10: leaves telemetry unwritten when frozen configuration disables it', () => {
  const lease = startTelemetrySession(false)
  expect(advance(lease)).toMatchObject({ ready: [{ id: 'draft', attempt: 1 }] })
  expect(
    JSON.parse(successful(['record', runId, 'draft', ...lease, '--result', '-'], fenced(drafted))),
  ).toMatchObject(drafted)
  expect(advance(lease)).toMatchObject({ run: 'done', ready: [] })
  expect(existsSync(join(runDir, 'telemetry.jsonl'))).toBe(false)
})

it('#696 AC-9: runs the standalone gate in the card worktree', () => {
  write(
    adoptionFile,
    `${filesystemPm}
### Custom Gate Registry

| Key | Command | Target |
| --- | --- | --- |
| fixture-gate | mkdir -p .pair/working && pwd > .pair/working/gate.cwd | pr |
`,
  )
  commitFixture()
  const lease = startWorkflow(`  verify:
    kind: gate
    with: { gates: ['target:pr'] }
`)

  expect(advance(lease)).toMatchObject({
    ready: [],
    events: [{ step: 'verify', state: 'ok', summary: expect.any(String) }],
  })
  expect(readFileSync(join(worktree, '.pair/working/gate.cwd'), 'utf8').trim()).toBe(worktree)
  expect(advance(lease)).toMatchObject({ run: 'done', ready: [] })
})

it.each([
  { name: 'skips a step whose live card no longer matches when', label: '', ready: 'discuss' },
  {
    name: 'launches a step whose live card still matches when',
    label: '**Labels**: ready-for-notes\n',
    ready: 'draft',
  },
])('#696 AC-9: $name', ({ label, ready }) => {
  const markdown = `# ${title}\n\n**Status**: Ready\n`
  write(cardFile, `${markdown}**Labels**: ready-for-notes\n`)
  commitFixture()
  const lease = startWorkflow(`  draft:
    kind: generic
    skill: pair-fixture-draft
    when: { has: [ready-for-notes] }
  discuss:
    kind: generic
    skill: pair-fixture-discuss
`)
  write(cardFile, `${markdown}${label}`)

  const skipped = ready === 'discuss'
  expect(advance(lease)).toMatchObject({
    run: 'running',
    ready: [{ id: ready }],
    ...(skipped && { events: [{ step: 'draft', state: 'skipped', summary: expect.any(String) }] }),
  })
  expect(JSON.parse(readRun('state.json'))).toMatchObject({
    steps: { ...(skipped && { draft: { state: 'skipped' } }), [ready]: { state: 'running' } },
  })
})

it('#696 AC-9: a failed post-step gate overrides the agent success', () => {
  const lease = startWorkflow(`  draft:
    kind: generic
    skill: pair-fixture-draft
    gates: ['command:test -f release-notes.md']
`)
  write('release-notes.md', 'Only in the main checkout')
  expect(advance(lease)).toMatchObject({ ready: [{ id: 'draft', attempt: 1 }] })
  expect(
    JSON.parse(successful(['record', runId, 'draft', ...lease, '--result', '-'], fenced(drafted))),
  ).toMatchObject({ status: 'failed', reason: 'gate-failed: command:test -f release-notes.md' })
  expect(advance(lease)).toMatchObject({ run: 'failed', ready: [] })
})

const codeState = '.pair/working/fixture-code.json'
const approver = 'release-maintainer'
const pr = 14
const mergeCommit = 'c'.repeat(40)
const question = 'Approve the release notes PR?'
const approvalStep = `  consent:
    kind: approval
    with: { question: ${question} }
`

function installCodeHost(permission: 'read' | 'write', prBranch = branch) {
  write(adoptionFile, `${filesystemPm}\n## Git Workflow\n\n- \`code-host\`: \`fixture-code\`\n`)
  write(
    `${cycle}/host/fixture-code.mjs`,
    `import { readFileSync, writeFileSync } from 'node:fs'
import { defineAdapter, REQUIRED_METHODS } from './adapter-kit.mjs'

const path = ${JSON.stringify(join(main, codeState))}
const state = () => JSON.parse(readFileSync(path, 'utf8'))

export default defineAdapter({
  id: 'fixture-code',
  binaries: [],
  create: () => ({
    ...Object.fromEntries(REQUIRED_METHODS.map(method => [method, () => {
      throw new Error('Unexpected fixture code host call: ' + method)
    }])),
    workflowPr: () => ${pr},
    prHead: () => state().head,
    workflowPrDetails: () => ({
      head: state().head,
      merged: state().merges.length > 0,
      mergeCommit: ${JSON.stringify(mergeCommit)},
      branch: ${JSON.stringify(prBranch)},
      author: 'release-author',
    }),
    workflowReviews: () => [],
    workflowReviewIdentity: () => 'review-bot',
    workflowActor: () => ({ login: ${JSON.stringify(approver)}, human: true }),
    readPermission: ({ user }) => user === ${JSON.stringify(approver)} ? state().permission : 'none',
    merge(input) {
      const saved = state()
      writeFileSync(path, JSON.stringify({ ...saved, merges: [...saved.merges, input] }))
    },
    deleteBranch: () => ({ deleted: true }),
  }),
})
`,
  )
  commitFixture()
  const head = git('rev-parse', 'HEAD').trim()
  write(codeState, JSON.stringify({ head, permission, merges: [] }))
  return head
}

it('#696 AC-1/AC-4: resumes on the registered worktree from the linked PR branch', async () => {
  const prBranch = 'release/notes'
  installCodeHost('write', prBranch)
  git('worktree', 'add', '-b', prBranch, worktree, 'main')
  await start({ dir: runDir, files }, { file: join(main, workflowFile), text: workflow }, { card })

  const gh = '.pair/working/bin/gh'
  write(gh, '#!/bin/sh\nexit 1\n')
  chmodSync(join(main, gh), 0o755)
  vi.stubEnv('PATH', [dirname(join(main, gh)), process.env['PATH']].join(delimiter))
  try {
    const lease = openSession(['resume', runId, '--engine', 'codex'])
    expect(git('-C', worktree, 'branch', '--show-current').trim()).toBe(prBranch)
    successful(['stop', runId, ...lease])
  } finally {
    vi.unstubAllEnvs()
  }
})

it('#696 AC-1/AC-4: replays review at the current PR head after a saved gate failure', async () => {
  const reviewedHead = git('rev-parse', 'HEAD').trim()
  const head = installCodeHost('write')
  git('worktree', 'add', '-b', branch, worktree, 'main')
  expect(git('-C', worktree, 'rev-parse', 'HEAD').trim()).toBe(head)
  expect(git('-C', worktree, 'status', '--porcelain')).toBe('')
  const source = namedWorkflow(`  implement: { kind: implement }
  review: { kind: review }
  verify:
    kind: gate
    with: { checks: [head-unchanged] }
    on-resume: { reason: head-changed, step: review }
`)
  const run = { dir: runDir, files }
  await start(run, { file: join(main, workflowFile), text: source }, { card })
  await next(run)
  await record(
    run,
    'implement',
    { status: 'ok', summary: 'Implemented', pr, head: reviewedHead, branch },
    { host: 'pair-run' },
  )
  await next(run)
  await record(run, 'review', {
    status: 'ok',
    summary: 'Approved',
    verdict: 'approved',
    reviewedHead,
    findings: [],
  })
  await next(run)
  await record(run, 'verify', { status: 'failed', summary: 'Head moved', reason: 'head-changed' })
  expect(JSON.parse(readRun('state.json'))).toMatchObject({
    steps: {
      review: { state: 'ok', outputs: { reviewedHead } },
      verify: { state: 'failed', reason: 'head-changed' },
    },
  })

  const lease = openSession(['resume', runId, '--engine', 'codex'])

  expect(JSON.parse(readRun('state.json'))).toMatchObject({
    steps: {
      implement: {
        state: 'ok',
        executions: 1,
        host: 'pair-run',
        outputs: { pr, head: reviewedHead },
      },
      verify: { state: 'pending', executions: 1 },
    },
  })
  expect(advance(lease)).toMatchObject({
    run: 'running',
    ready: [{ id: 'review', attempt: 2, inputs: { pr, head }, worktree }],
  })
  successful(['stop', runId, ...lease])
})

const parkedApproval = {
  run: 'parked',
  ready: [],
  approval: { step: 'consent', question },
}

it('#696 AC-9: parks at an approval with the question for the session', () => {
  installCodeHost('write')
  const lease = startWorkflow(approvalStep)
  expect(advance(lease)).toMatchObject(parkedApproval)
  expect(JSON.parse(readRun('state.json'))).toMatchObject({
    steps: { consent: { state: 'needs-decision' } },
  })
})

it('#696 AC-9: a session answer from a read-only actor leaves approval parked', () => {
  installCodeHost('read')
  const lease = startWorkflow(approvalStep)
  advance(lease)

  expect(JSON.parse(successful(['next', runId, ...lease, '--answer', 'approve']))).toMatchObject(
    parkedApproval,
  )
  expect(JSON.parse(readRun('steps/consent/result.json'))).toMatchObject({
    status: 'needs-decision',
  })
})

it('#696 AC-9: a session answer from an authorized actor approves its exact PR head', () => {
  const head = installCodeHost('write')
  const lease = startWorkflow(approvalStep)
  advance(lease)

  expect(JSON.parse(successful(['next', runId, ...lease, '--answer', 'approve']))).toMatchObject({
    ready: [],
    events: [{ step: 'consent', state: 'ok', summary: expect.any(String) }],
  })
  expect(JSON.parse(readRun('steps/consent/result.json'))).toMatchObject({
    status: 'ok',
    approvedBy: approver,
    approvedPr: pr,
    approvedHead: head,
  })
  expect(advance(lease)).toMatchObject({ run: 'done', ready: [] })
})

it('#696 AC-9: an authorized session rejection stops the run and retains its note', () => {
  installCodeHost('write')
  const lease = startWorkflow(approvalStep)
  advance(lease)

  const note = 'Release notes omit the upgrade steps'
  expect(
    JSON.parse(successful(['next', runId, ...lease, '--answer', `reject:${note}`])),
  ).toMatchObject({ ready: [], events: [{ step: 'consent', state: 'failed' }] })
  expect(JSON.parse(readRun('steps/consent/result.json'))).toMatchObject({
    status: 'failed',
    reason: note,
  })
  expect(advance(lease)).toMatchObject({ run: 'failed', ready: [] })
})

it.each([
  {
    name: 'merges the head covered by review, gate and approval',
    matches: true,
    state: 'ok',
    closure: false,
  },
  {
    name: 'refuses merge when the gate covered another head',
    matches: false,
    state: 'failed',
    closure: false,
  },
  {
    name: 'R754-03 finishes only verified post-merge closure',
    matches: true,
    state: 'ok',
    closure: true,
  },
])('#696 AC-9: $name', async ({ matches, state, closure }) => {
  const head = installCodeHost('write')
  const source = namedWorkflow(`  implement: { kind: implement }
  review: { kind: review }
  verify: { kind: gate, with: { checks: [head-unchanged] } }
  consent: { kind: approval }
  land: { kind: merge, with: { method: squash } }
`)
  const run = { dir: runDir, files }
  await start(run, { file: join(main, workflowFile), text: source }, { card })
  for (const [step, outputs] of Object.entries({
    implement: { pr, head, branch },
    review: { verdict: 'approved', reviewedHead: head, findings: [] },
    verify: { gatedHead: matches ? head : 'f'.repeat(40) },
    consent: { approvedHead: head, approvedPr: pr, approvedBy: approver },
  })) {
    await next(run)
    expect(
      await record(run, step, { status: 'ok', summary: `Fixture ${step}`, ...outputs }),
    ).toMatchObject({
      status: 'ok',
    })
  }
  if (closure) {
    await next(run)
    write(codeState, JSON.stringify({ head, permission: 'write', merges: [{ pr }] }))
    write(`${backlog}/completed/${card}.md`, `# ${title}\n\n**Status**: Done\n`)
    rmSync(join(main, cardFile))
    const opened = JSON.parse(successful(['resume', runId, '--engine', 'codex']))
    expect(opened).toMatchObject({ status: 'complete' })
    expect(existsSync(worktree)).toBe(false)
    expect(JSON.parse(readRun('steps/land/result.json'))).toMatchObject({
      status: 'ok',
      merged: true,
    })
    expect(JSON.parse(readFileSync(join(main, codeState), 'utf8')).merges).toEqual([{ pr }])
    return
  }
  const lease = openSession(['resume', runId, '--engine', 'codex'])

  expect(advance(lease)).toMatchObject({
    ready: [],
    events: [{ step: 'land', state, summary: expect.any(String) }],
  })
  expect(JSON.parse(readFileSync(join(main, codeState), 'utf8'))).toMatchObject({
    merges: matches ? [expect.objectContaining({ pr, headSha: head, strategy: 'squash' })] : [],
  })
  expect(JSON.parse(readRun('steps/land/result.json'))).toMatchObject(
    matches
      ? { status: 'ok', merged: true, mergeCommit }
      : { status: 'failed', reason: 'head-moved' },
  )
  expect(existsSync(join(main, backlog, 'completed', `${card}.md`))).toBe(matches)
})

it('R754-01 / AC-4: holds the card across workflows until the session stops', () => {
  write('.pair/adoption/tech/workflows/other.yaml', workflow.replace('name: quick', 'name: other'))
  const startQuick = ['start', 'quick', '--card', card, '--engine', 'codex']
  const lockRequest = { workingArea: join(main, '.pair/working'), card }
  const terminalLock = acquireCardLock(lockRequest)
  if (terminalLock.kind !== 'acquired') throw new Error('fixture could not lock the card')
  expect(invoke(startQuick).stderr).toContain('card-locked')
  terminalLock.lock.release()

  const lease = openSession(startQuick)
  expect(acquireCardLock(lockRequest)).toMatchObject({ kind: 'held', alive: true })
  const args = ['start', 'other', '--card', card, '--engine', 'codex']
  const refused = invoke(args)
  expect(refused.status).toBe(1)
  expect(refused.stderr).toContain('card-locked')
  expect(existsSync(join(main, '.pair/working/runs', `other-${card}`, 'state.json'))).toBe(false)
  successful(['stop', runId, ...lease])
  expect(JSON.parse(successful(args))).toMatchObject({ runId: `other-${card}`, worktree })
})

it.each([
  { source: 'workflow', filter: 'has: [release]', label: 'release' },
  { source: 'configuration', filter: 'has: [release]', label: 'release' },
  { source: 'workflow', filter: 'status: [Draft]', label: undefined },
])(
  'R754-02: enforces the $source filter $filter before worktree setup',
  ({ source, filter, label }) => {
    const select = `select: { filter: { ${filter} } }\n`
    if (source === 'workflow') write(workflowFile, workflow + select)
    else {
      write(workflowFile, workflow + 'select: { filter: { has: [superseded] } }\n')
      write(configFile, configuration + select)
    }
    const args = ['start', 'quick', '--card', card, '--engine', 'codex', '--config', 'mine']
    const result = invoke(args)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('selection filter')
    expect(existsSync(worktree)).toBe(false)
    write(
      cardFile,
      `# ${title}\n\n${label === undefined ? '**Status**: Draft' : `**Status**: Ready\n**Labels**: ${label}`}\n`,
    )
    expect(JSON.parse(successful(args))).toMatchObject({ status: 'started', worktree })
  },
)

it('R754-03: refuses a closed card with unfinished agent work', async () => {
  await seedHeadlessRun()
  write(`${backlog}/completed/${card}.md`, `# ${title}\n\n**Status**: Done\n`)
  rmSync(join(main, cardFile))
  const saved = readRun('state.json')
  const result = invoke(['resume', runId, '--engine', 'codex'])
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('card-closed')
  expect(readRun('state.json')).toBe(saved)
})

it('R754-04: refuses the same undeclared alias during validate and start', () => {
  write(configFile, configuration + 'aliases: { undeclared: { effort: low } }\n')
  const flags = ['--engine', 'codex', '--config', 'mine']
  for (const args of [
    ['validate', 'quick', ...flags],
    ['start', 'quick', '--card', card, ...flags],
  ]) {
    const result = invoke(args)
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/configuration-invalid:.*alias 'undeclared'/)
  }
  expect(existsSync(worktree)).toBe(false)
  expect(existsSync(join(runDir, 'configuration.yaml'))).toBe(false)
})

it('R754-05: renews the lease without replacing an outstanding step attempt', () => {
  const clock = '.pair/working/clock.cjs'
  write(clock, 'Date.now = () => Number(process.env.PAIR_TEST_NOW)\n')
  const now = Date.now()
  const setMinutes = (minutes: number) =>
    vi.stubEnv('PAIR_TEST_NOW', String(now + minutes * 60_000))
  vi.stubEnv('NODE_OPTIONS', `--require="${join(main, clock)}"`)
  try {
    setMinutes(0)
    const lease = openSession(['start', 'quick', '--card', card, '--engine', 'codex'])
    expect(advance(lease)).toMatchObject({ ready: [{ id: 'draft', attempt: 1 }] })
    setMinutes(50)
    expect(JSON.parse(successful(['renew', runId, ...lease]))).toMatchObject({ renewed: true })
    setMinutes(61)
    expect(
      JSON.parse(
        successful(['record', runId, 'draft', ...lease, '--result', '-'], fenced(drafted)),
      ),
    ).toMatchObject(drafted)
    expect(JSON.parse(readRun('state.json'))).toMatchObject({
      steps: { draft: { state: 'ok', executions: 1 } },
    })
  } finally {
    vi.unstubAllEnvs()
  }
})

it('R754-06: starts from a redirected skills target and resolves prefixed names', () => {
  const target = 'team/skills'
  write(
    'pair.config.json',
    JSON.stringify({
      worktreeRoot: 'worktrees',
      asset_registries: {
        skills: { prefix: 'team', targets: [{ path: target, mode: 'canonical' }] },
      },
    }),
  )
  for (const skill of ['team-pair-fixture-draft', 'fixture-discuss'])
    write(`${target}/${skill}/SKILL.md`, `---\nname: ${skill}\ndescription: Fixture skill\n---\n`)
  write(workflowFile, workflow.replace('pair-fixture-discuss', 'team-fixture-discuss'))
  cpSync(join(main, cycle), join(main, target, 'team-workflow-cycle/scripts'), { recursive: true })
  rmSync(join(main, '.claude/skills/pair-fixture-draft'), { recursive: true })
  rmSync(join(main, cycle), { recursive: true })
  expect(JSON.parse(successful(['validate', 'quick']))).toMatchObject({ workflow: 'quick' })
  const lease = openSession(['start', 'quick', '--card', card, '--engine', 'codex'])
  expect(advance(lease)).toMatchObject({ ready: [{ id: 'draft', uses: 'pair-fixture-draft' }] })
})

it.each([
  { options: '{ mode: interactive }', interactive: true },
  { options: '{}', interactive: true },
  { options: '{ mode: autonomous }', interactive: false },
])('R754-07 / AC-2: routes refinement with $options', ({ options, interactive }) => {
  write('.claude/skills/pair-process-refine-story/SKILL.md', 'Refine a story.')
  const lease = startWorkflow(`  refine:
    kind: refine-story
    with: ${options}
`)
  const packet = advance(lease).ready[0]
  expect(packet).toMatchObject({ id: 'refine', interactive })
  expect(packet?.message.includes('Execution mode: unattended.')).toBe(!interactive)
})
