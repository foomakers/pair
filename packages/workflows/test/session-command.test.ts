import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
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
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { acquireRunLock } from '../src/cli'
import { next, record, start } from '../src/engine'

const repo = join(__dirname, '../../..')
const script = '.claude/skills/pair-capability-workflow/scripts/workflow.mjs'
const cycle = '.claude/skills/pair-workflow-cycle/scripts'
const workflowFile = '.pair/adoption/tech/workflows/quick.yaml'
const configFile = '.pair/adoption/tech/configurations/mine.yaml'
const card = '42'
const title = 'Prepare release notes'
const runId = `quick-${card}`
const workflow = `version: 1
name: quick
steps:
  draft:
    kind: generic
    skill: pair-fixture-draft
  discuss:
    kind: generic
    skill: pair-fixture-discuss
    interactive: true
`
const configuration = `version: 1
name: mine
defaults: { engine: codex, model: gpt-5, effort: medium }
steps:
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

beforeEach(() => {
  main = realpathSync(mkdtempSync(join(tmpdir(), 'pair-session-command-')))
  runDir = join(main, '.pair/working/runs', runId)
  worktree = join(main, 'worktrees', card)
  git('init', '-b', 'main')
  write('.gitignore', '/worktrees/\n/.pair/working/\n')
  write('pair.config.json', JSON.stringify({ worktreeRoot: 'worktrees' }))
  write('.pair/adoption/tech/way-of-working.md', '- `pm-tool`: `filesystem`\n')
  write(
    `.pair/adoption/product/backlog/03-user-stories/not-started/${card}.md`,
    `# ${title}\n\n**Status**: Ready\n`,
  )
  write(workflowFile, workflow)
  write(configFile, configuration)
  for (const skill of ['pair-fixture-draft', 'pair-fixture-discuss'])
    write(
      `.claude/skills/${skill}/SKILL.md`,
      `---\nname: ${skill}\ndescription: Fixture skill\n---\n`,
    )
  cpSync(join(repo, cycle), join(main, cycle), { recursive: true })
  mkdirSync(dirname(join(main, script)), { recursive: true })
  cpSync(join(repo, script), join(main, script))
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
  git('worktree', 'add', '-b', `feature/US-${card}-prepare-release-notes`, worktree, 'main')
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
