import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService as fs } from '@pair/content-ops'
import { next, record, start } from '@pair/workflows'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import type { SpawnIterationInput } from './spawn'
import { readWorkflowCards } from './workflow-selection'
import type { WorkflowHostDependencies } from './workflow-host'

/**
 * #678 batch and refinement behavior through the command entry point and a temporary project.
 */

const HEAD = 'a'.repeat(40)
const fenced = (value: unknown) => `Done.\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``
const IMPLEMENTED = fenced({
  status: 'ok',
  summary: 'PR opened',
  branch: 'feature/US-627-x',
  pr: 12,
  head: HEAD,
})
const REVIEWED = fenced({
  status: 'ok',
  summary: 'approved',
  verdict: 'approved',
  reviewedHead: HEAD,
  findings: [],
})
const QUICK = `version: 1
name: quick
steps:
  implement:
    kind: implement
    gates: [quality-gate]
  review:
    kind: review
`
const REGISTRY = `### Custom Gate Registry

| Order | Key | Gate | Command |
| --- | --- | --- | --- |
| 1 | quality-gate | Quality Gate | \`true\` |
`

/** A fake skill answers with the agent's final message, `undefined` when the agent dies, or throws on a crash. */
type FakeSkill = () => string | undefined
type Launched = Pick<SpawnIterationInput, 'promptText' | 'cwd' | 'autonomyArgs'>

let project: string
let lines: string[]
let launched: Launched[]

const write = (path: string, content: string) => {
  fs.mkdirSync(join(project, path, '..'), { recursive: true })
  fs.writeFileSync(join(project, path), content)
}
const runDir = (id = 'quick-627') => join(project, '.pair/working/runs', id)
const states = (id?: string) =>
  Object.fromEntries(
    Object.entries(
      (
        JSON.parse(fs.readFileSync(join(runDir(id), 'state.json'))) as {
          steps: Record<string, { state: string }>
        }
      ).steps,
    ).map(([step, record]) => [step, record.state]),
  )

/** The skill a prompt invokes: `/<skill>` on a slash engine, `Run the <skill> skill.` on an instruction one. */
const skillOf = (prompt: string) => /^(?:\/|Run the )(\S+)/.exec(prompt)?.[1] ?? ''

function deps(skills: Record<string, FakeSkill>, over: Partial<WorkflowHostDependencies> = {}) {
  const workflow: WorkflowHostDependencies = {
    runIteration: async input => {
      launched.push({
        promptText: input.promptText,
        cwd: input.cwd,
        autonomyArgs: input.autonomyArgs,
      })
      const text = (skills[skillOf(input.promptText)] as FakeSkill)()
      if (text !== undefined) input.onEvent?.({ type: 'result', subtype: 'success', result: text })
      return text === undefined
        ? { outcome: 'failed', detail: 'timed out (idle): no engine event for 1800s' }
        : { outcome: 'success', detail: 'terminal event: success' }
    },
    readCard: async () => ({ title: 'A card' }),
    readResultFacts: async () => ({ head: HEAD }),
    prepareWorktree: async ({ main, card }) => {
      const dir = join(main, 'worktrees', card)
      fs.mkdirSync(dir, { recursive: true })
      return dir
    },
    engineAvailable: () => true,
    ...over,
  }
  return { workflow }
}

const OK = { 'pair-process-implement': () => IMPLEMENTED, 'pair-process-review': () => REVIEWED }

const run = (
  args: string[],
  skills: Record<string, FakeSkill> = OK,
  options: Record<string, unknown> = {},
  over: Partial<WorkflowHostDependencies> = {},
) =>
  handleRunCommand(
    parseRunCommand({ card: '627', cwd: project, ...options }, args),
    fs,
    deps(skills, over),
  )

beforeEach(() => {
  project = fs.mkdtempSync(join(tmpdir(), 'pair-workflow-'))
  lines = []
  launched = []
  for (const skill of [
    'pair-process-implement',
    'pair-process-review',
    'pair-process-fix',
    'my-skill',
  ])
    write(`.claude/skills/${skill}/SKILL.md`, `# ${skill}\n`)
  write('.pair/adoption/tech/way-of-working.md', REGISTRY)
  write('.pair/adoption/tech/workflows/quick.yaml', QUICK)
  const keep = (...args: unknown[]) => void lines.push(args.join(' '))
  vi.spyOn(console, 'log').mockImplementation(keep)
  vi.spyOn(console, 'error').mockImplementation(keep)
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(project, { recursive: true, force: true })
})

describe('shipped refinement (#678 AC-1, AC-5, AC-6 and AC-9)', () => {
  it.each([
    ['successful transitions', undefined, false, undefined],
    ['a refused Ready write (R744-01)', 'refused', false, undefined],
    ['an applied Ready write with no confirmation (R744-01)', 'unconfirmed', false, undefined],
    ['an unconfirmed Ready write saved by an older version (R744-01)', 'legacy', false, undefined],
    ['canonical board states (R744-01)', undefined, true, undefined],
    ['a stale task count after a refused write (R744-11)', 'refused', false, 'tasks'],
    ['a stale task count after Ready lands (R744-11)', 'unconfirmed', false, 'tasks'],
    ['stale refinement after Ready lands (R744-07)', 'unconfirmed', false, 'Assumptions'],
  ] as const)('completes and skips cards with %s', async (_name, failure, canonical, stale) => {
    const source = '.pair/adoption/tech/workflows/refinement.yaml'
    write(
      source,
      fs.readFileSync(join(__dirname, '../../../../../packages/knowledge-hub/dataset', source)),
    )
    if (!canonical)
      write(
        '.pair/adoption/tech/way-of-working.md',
        '## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Todo | Draft |\n| Refined | Ready |\n',
      )
    for (const skill of ['pair-process-refine-story', 'pair-process-plan-tasks'])
      write(`.claude/skills/${skill}/SKILL.md`, `# ${skill}\n`)
    const ids = ['9', '10', '12']
    const [draft, ready]: [string, string] = canonical ? ['Draft', 'Ready'] : ['Todo', 'Refined']
    const status = new Map(ids.map(id => [id, draft]))
    const bodies = new Map<string, string>()
    const prerequisiteAtLaunch: string[] = []
    let failRead = false
    let failReady = failure !== undefined
    const applied = failure === 'unconfirmed' || failure === 'legacy'
    function prepareCard(id: string, refine: boolean) {
      if (refine) {
        bodies.set(id, '## Acceptance Criteria\n\n## Technical Analysis\n\n## Assumptions')
        return { riskTag: 'risk:green', openQuestions: [] }
      }
      const body = bodies.get(id) ?? ''
      if (body.includes('**T-2**:')) return { tasks: 2 }
      bodies.set(id, `${body}\n\n## Task Breakdown\n\n- [ ] **T-1**: Add a test`)
      return { tasks: 1 }
    }
    const readSelection = async () => ({
      cards: ids.map(id => ({
        id,
        title: `Story ${id}`,
        body: bodies.get(id) ?? '',
        labels: ['risk:green'],
        status: status.get(id) === draft ? 'Draft' : 'Ready',
        boardState: status.get(id) ?? null,
        closed: false,
        prerequisites: id === '12' ? ['9'] : [],
      })),
    })
    const workflow: WorkflowHostDependencies = {
      ...deps({}).workflow,
      readSelection,
      board: {
        getState: async id => status.get(id) ?? null,
        async setState(id, value) {
          if (id === '9' && failReady) {
            if (applied) status.set(id, value)
            throw new Error('Ready write unconfirmed')
          }
          status.set(id, value)
        },
      },
      async readResultFacts(step) {
        const id = String(step.inputs['card'])
        if (id === '9' && failRead) throw new Error('tracker unavailable')
        return {
          card: {
            boardStatus: status.get(id) ?? null,
            labels: ['risk:green'],
            body: bodies.get(id) ?? '',
          },
        }
      },
      async runIteration(input) {
        const id = /- card: (\d+)/.exec(input.promptText)?.[1] ?? ''
        const current = status.get(id)
        launched.push(input)
        if (id === '12') prerequisiteAtLaunch.push(states('refinement-9')['tasks'] ?? '')
        const result = prepareCard(id, skillOf(input.promptText) === 'pair-process-refine-story')
        expect(current).toBe(result.tasks === 2 && applied ? ready : draft)
        input.onEvent?.({
          type: 'result',
          subtype: 'success',
          result: fenced({
            status: 'ok',
            summary: 'Prepared',
            boardStatus: current,
            ...result,
          }),
        })
        return { outcome: 'success', detail: 'terminal event: success' }
      },
    }
    const command = parseRunCommand({ cwd: project, card: ids.join(','), parallel: '2' }, [
      'refinement',
    ])
    async function retryReady() {
      const afterFailure = applied ? ready : draft
      expect(status.get('9')).toBe(afterFailure)
      expect(states('refinement-9')).toEqual({ refine: 'ok', tasks: 'failed' })
      expect(lines.some(line => line.includes('#12: waiting'))).toBe(true)
      expect(lines.some(line => line.includes('Ready write unconfirmed'))).toBe(true)
      if (failure === 'legacy') {
        const path = join(runDir('refinement-9'), 'state.json')
        const snapshot = JSON.parse(fs.readFileSync(path)) as {
          steps: { tasks: { pendingSuccess?: unknown } }
        }
        delete snapshot.steps.tasks.pendingSuccess
        fs.writeFileSync(path, JSON.stringify(snapshot))
      }
      failReady = false
      if (failure === 'refused' && stale === undefined) {
        failRead = true
        expect(await handleRunCommand(command, fs, { workflow })).toBe(1)
        expect(lines.some(line => line.includes('tracker unavailable'))).toBe(true)
        expect(launched).toHaveLength(4)
        failRead = false
      }
      if (stale !== undefined) {
        const original = bodies.get('9')!
        bodies.set(
          '9',
          stale === 'tasks'
            ? `${original}\n- [ ] **T-2**: Add another test`
            : original.replace(`## ${stale}`, '## Removed'),
        )
        expect(await handleRunCommand(command, fs, { workflow })).toBe(1)
        expect(states('refinement-9')).toEqual({ refine: 'ok', tasks: 'failed' })
        expect(status.get('9')).toBe(afterFailure)
        expect(lines.some(line => line.includes(`${stale}: declared`))).toBe(true)
        expect(launched).toHaveLength(4)
        if (stale !== 'tasks') bodies.set('9', original)
      }
      expect(await handleRunCommand(command, fs, { workflow })).toBe(0)
      expect(states('refinement-9')).toEqual({ refine: 'ok', tasks: 'ok' })
      expect(launched).toHaveLength(stale === 'tasks' ? 7 : 6)
    }
    expect(await handleRunCommand(command, fs, { workflow })).toBe(failReady ? 1 : 0)
    if (failReady) await retryReady()
    expect(prerequisiteAtLaunch).toEqual(['ok', 'ok'])
    expect([...status.values()]).toEqual([ready, ready, ready])
    expect(new Set(launched.map(step => step.cwd)).size).toBe(3)
    const executions = launched.length
    expect(await handleRunCommand(command, fs, { workflow })).toBe(0)
    expect(launched).toHaveLength(executions)
    const summaries = fs
      .readdirSync(join(project, '.pair/working/runs'))
      .filter(entry => entry.name.startsWith('refinement-selection-'))
    expect(summaries).toHaveLength(1)
    const summary = JSON.parse(
      fs.readFileSync(join(project, '.pair/working/runs', summaries[0]!.name, 'summary.json')),
    ) as { totals: unknown }
    expect(summary.totals).toEqual({ skipped: 3 })
  })
})

it.each([
  { name: 'acyclic dependencies' },
  { name: 'reciprocal dependencies (R744-18)', cycle: true },
  { name: 'a dependency read error (R744-19)', error: 'tracker unavailable' },
  { name: 'a missing dependency result (R744-19)', missing: true },
])('schedules a batch with a completed card and $name', async ({ cycle, error, missing }) => {
  expect(await run(['quick'], OK, { card: '9' })).toBe(0)
  launched.length = 0

  const batch = run(
    ['quick'],
    OK,
    { card: '9,10' },
    {
      readSelection: async () => ({
        cards: ['9', '10'].map(id => ({
          id,
          title: `Story ${id}`,
          body: '',
          labels: [],
          boardState: null,
          closed: false,
          prerequisites: [],
        })),
        readDependencies: async ids =>
          ids
            .filter(id => id !== '9' || !missing)
            .map(id => ({
              id,
              prerequisites: id === '10' ? ['9'] : cycle ? ['10'] : [],
              ...(id === '9' && error !== undefined && { error }),
            })),
      }),
    },
  )
  if (cycle) {
    await expect(batch).rejects.toThrow('dependency-cycle: #9 → #10 → #9')
    expect(launched).toHaveLength(0)
  } else {
    expect(await batch).toBe(0)
    expect(lines.join('\n')).toContain('#9: skipped — workflow already complete')
    if (error || missing) expect(lines.join('\n')).toContain(error ?? 'dependency facts missing')
    expect(launched.map(step => step.cwd)).toEqual([
      join(project, 'worktrees', '10'),
      join(project, 'worktrees', '10'),
    ])
  }
})

it.each([
  { constraint: 'label', options: { filter: 'wanted' }, excluded: { labels: [] } },
  { constraint: 'status (R744-21)', options: { status: 'Ready' }, excluded: { status: 'Draft' } },
  {
    constraint: 'assignee',
    options: { assignee: 'maintainer' },
    excluded: { assignees: ['other'] },
  },
  { constraint: 'closure', options: {}, excluded: { closed: true } },
])(
  'R744-20: excludes a completed card by $constraint before reading dependencies',
  async ({ options, excluded }) => {
    expect(await run(['quick'], OK, { card: '9' })).toBe(0)
    launched.length = 0
    const readDependencies = vi.fn(async (ids: readonly string[]) =>
      ids.map(id => ({ id, prerequisites: [id === '9' ? '10' : '9'] })),
    )
    const exit = await run(
      ['quick'],
      OK,
      { card: '9,10', ...options },
      {
        readSelection: async () => ({
          cards: ['9', '10'].map(id => ({
            id,
            title: `Story ${id}`,
            body: '',
            labels: ['wanted'],
            assignees: ['maintainer'],
            status: 'Ready',
            boardState: null,
            closed: false,
            prerequisites: [],
            ...(id === '9' && excluded),
          })),
          readDependencies,
        }),
      },
    )

    expect(exit).toBe(0)
    expect(readDependencies).toHaveBeenCalledExactlyOnceWith(['10'])
    expect(lines).toContain(
      `  #9: not-applicable — ${excluded.closed ? 'card closed' : 'selection filter'}`,
    )
    expect(lines.join('\n')).toMatch(/#10: done[^\n]*outside selection: #9/)
  },
)

it.each([false, true])(
  'R744-08: bare-card retry resumes refinement (another match: %s)',
  async other => {
    const draft = 'Draft'
    const ready = 'Ready'
    let boardState = draft
    const body = '## Task Breakdown\n\n- [ ] **T-1**: Add a test'
    write(
      'pair.config.json',
      JSON.stringify({ workflows: { ...(other && { quick: {} }), refinement: {} } }),
    )
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      QUICK.replace('name: quick', 'name: quick\nselect: { filter: { status: [Ready] } }'),
    )
    write(
      '.pair/adoption/tech/workflows/refinement.yaml',
      `version: 1
name: refinement
select: { filter: { status: [Draft] } }
steps:
  tasks:
    kind: plan-tasks
`,
    )
    write('.claude/skills/pair-process-plan-tasks/SKILL.md', '# Plan tasks\n')
    const workflow = deps(
      {
        ...OK,
        'pair-process-plan-tasks': () =>
          fenced({ status: 'ok', summary: 'Planned', boardStatus: boardState, tasks: 1 }),
      },
      {
        async readSelection() {
          return {
            cards: [
              {
                id: '12',
                title: 'Story 12',
                body,
                labels: [],
                status: boardState,
                boardState,
                closed: false,
                prerequisites: [],
              },
            ],
          }
        },
        readResultFacts: async () => ({ card: { boardStatus: boardState, labels: [], body } }),
        board: {
          getState: async () => boardState,
          async setState(_id, value) {
            boardState = value
            throw new Error('Ready read-back failed')
          },
        },
      },
    )
    const command = parseRunCommand({ cwd: project, card: '12' }, [])
    expect(await handleRunCommand(command, fs, workflow)).toBe(1)
    expect(boardState).toBe(ready)
    expect(await handleRunCommand(command, fs, workflow)).toBe(0)
    expect(states('refinement-12')).toEqual({ tasks: 'ok' })
    expect(launched.map(one => skillOf(one.promptText))).toEqual(['pair-process-plan-tasks'])
  },
)

it.each([true, false])('R744-09: a minimal board uses the DoR (design flag: %s)', async design => {
  const path = '.pair/adoption/tech/workflows/refinement.yaml'
  write(
    path,
    fs.readFileSync(join(__dirname, '../../../../../packages/knowledge-hub/dataset', path)),
  )
  write(
    '.pair/adoption/tech/way-of-working.md',
    `## State Mapping

| Board State | Macrostate |
| --- | --- |
| Todo | Draft |
| In Progress | In Progress |
| Done | Done |
`,
  )
  for (const skill of ['pair-process-refine-story', 'pair-process-plan-tasks'])
    write(`.claude/skills/${skill}/SKILL.md`, `# ${skill}\n`)
  const labels = ['risk:green']
  const result = { status: 'ok', summary: 'Prepared', boardStatus: 'Todo' }
  let body = `## Story Statement

As a user
I want to run a workflow
So that I can refine a story

## Acceptance Criteria

## Technical Analysis

${design ? 'Design: not required' : ''}

## Assumptions`
  const setState = vi.fn(async () => {})
  const workflow = deps(
    {
      'pair-process-refine-story': () =>
        fenced({ ...result, riskTag: 'risk:green', openQuestions: [] }),
      'pair-process-plan-tasks': () => {
        body += '\n\n## Task Breakdown\n\n- [ ] **T-1**: Add a test'
        return fenced({ ...result, tasks: 1 })
      },
    },
    {
      readSelection: async () => ({
        cards: [
          {
            id: '12',
            title: 'Story 12',
            body,
            labels,
            status: 'Draft',
            boardState: 'Todo',
            closed: false,
            prerequisites: [],
          },
        ],
      }),
      readResultFacts: async () => ({ card: { boardStatus: 'Todo', labels, body } }),
      board: { getState: async () => 'Todo', setState },
    },
  )
  const command = parseRunCommand({ cwd: project, card: '12' }, ['refinement'])
  expect(await handleRunCommand(command, fs, workflow)).toBe(design ? 0 : 1)
  expect(states('refinement-12')).toEqual({ refine: 'ok', tasks: design ? 'ok' : 'failed' })
  expect(setState).not.toHaveBeenCalled()
  if (design) {
    expect(await handleRunCommand(command, fs, workflow)).toBe(0)
    expect(launched.map(one => skillOf(one.promptText))).toEqual([
      'pair-process-refine-story',
      'pair-process-plan-tasks',
    ])
  } else expect(lines.some(line => line.includes('unmet: Design flag'))).toBe(true)
})

function minimalRefinementBoard() {
  const path = '.pair/adoption/tech/workflows/refinement.yaml'
  write(
    path,
    fs.readFileSync(join(__dirname, '../../../../../packages/knowledge-hub/dataset', path)),
  )
  for (const skill of ['pair-process-refine-story', 'pair-process-plan-tasks'])
    write(`.claude/skills/${skill}/SKILL.md`, `# ${skill}\n`)
  write(
    '.pair/adoption/tech/way-of-working.md',
    `- \`pm-tool\`: \`filesystem\`

## Git Workflow

- \`code-host\`: \`github\`

## State Mapping

| Board State | Macrostate |
| --- | --- |
| Todo | Draft |
| In Progress | In Progress |
| Done | Done |
`,
  )
  const skill = '.claude/skills/pair-workflow-cycle'
  write(`${skill}/SKILL.md`, '# Cycle\n')
  fs.symlinkSync(
    join(__dirname, '../../../../../', skill, 'scripts'),
    join(project, skill, 'scripts'),
  )
  return '.pair/adoption/product/backlog/03-user-stories/not-started'
}

const STORY_BEFORE_TASKS = `# Prepared story

**Status**: Todo

## Story Statement

As a maintainer
I want Draft selection
So that I can refine unfinished stories

## Technical Analysis

Design: not required
`

const STORY_TASKS = '\n## Task Breakdown\n\n- [ ] **T-1**: Verify workflow selection\n'

it('R744-12 (#678 AC-2): Draft selection excludes cards that meet the DoR on a minimal board', async () => {
  const backlog = minimalRefinementBoard()
  write(`${backlog}/12.md`, STORY_BEFORE_TASKS + STORY_TASKS)
  write(`${backlog}/13.md`, '# Draft story\n\n**Status**: Todo\n')

  const command = parseRunCommand({ cwd: project, card: '12,13', dryRun: true }, ['refinement'])
  expect(await handleRunCommand(command, fs), lines.join('\n')).toBe(0)
  expect(lines, lines.join('\n')).toContain('  Dry run: 13; parallel 1. Nothing was launched.')
  expect(lines).toContain('  #12: not-applicable — selection filter')
})

it.each(['refine', 'tasks'])(
  'R744-13 (#678 AC-6): timed-out %s stays eligible on a minimal board',
  async step => {
    const backlog = minimalRefinementBoard()
    const card = `${backlog}/12.md`
    const body =
      STORY_BEFORE_TASKS + '\n**Labels**: risk:green\n\n## Acceptance Criteria\n\n## Assumptions\n'
    const ready = body + STORY_TASKS
    write(card, step === 'refine' ? ready.replace('Design: not required', '') : body)
    const facts = { boardStatus: 'Todo', labels: ['risk:green'] }
    const result = { status: 'ok', summary: 'Prepared', boardStatus: facts.boardStatus }
    const refine = vi.fn<FakeSkill>(() =>
      fenced({ ...result, riskTag: 'risk:green', openQuestions: [] }),
    )
    const plan = vi.fn<FakeSkill>(() => fenced({ ...result, tasks: 1 }))
    const interrupted = step === 'refine' ? refine : plan
    interrupted.mockImplementationOnce(() => {
      write(card, ready)
      return undefined
    })
    const workflow = deps(
      {
        'pair-process-refine-story': refine,
        'pair-process-plan-tasks': plan,
      },
      {
        readResultFacts: async () => ({
          card: { ...facts, body: fs.readFileSync(join(project, card)) },
        }),
        board: { getState: async () => facts.boardStatus, setState: async () => {} },
      },
    )
    const options = { cwd: project, card: '12,13', filter: 'risk:green' }
    write(`${backlog}/13.md`, STORY_BEFORE_TASKS + STORY_TASKS)
    const command = parseRunCommand(options, ['refinement'])
    expect(await handleRunCommand(command, fs, workflow), lines.join('\n')).toBe(1)
    expect(states('refinement-12')).toEqual(
      step === 'refine'
        ? { refine: 'failed', tasks: 'pending' }
        : { refine: 'ok', tasks: 'failed' },
    )

    write(card, ready.replace('risk:green', 'risk:yellow'))
    expect(await handleRunCommand(command, fs, workflow), lines.join('\n')).toBe(0)
    expect(lines).toContain('  #12: not-applicable — selection filter')
    expect(interrupted).toHaveBeenCalledTimes(1)

    write(card, ready)
    expect(await handleRunCommand(command, fs, workflow), lines.join('\n')).toBe(0)
    expect(states('refinement-12')).toEqual({ refine: 'ok', tasks: 'ok' })
    expect(interrupted).toHaveBeenCalledTimes(2)
  },
)

it.each(['batch', 'single card'])(
  'R744-16 (#678 AC-6): %s resumes after successful refinement on a minimal board',
  async route => {
    const backlog = minimalRefinementBoard()
    const card = `${backlog}/12.md`
    const ready =
      STORY_BEFORE_TASKS +
      '\n**Labels**: risk:green\n\n## Acceptance Criteria\n\n## Assumptions\n' +
      STORY_TASKS
    write(card, ready.replace('Design: not required', ''))
    write(`${backlog}/13.md`, STORY_BEFORE_TASKS + STORY_TASKS)
    const file = join(project, '.pair/adoption/tech/workflows/refinement.yaml')
    const snapshot = { files: fs, dir: runDir('refinement-12') }
    const withCheck = route === 'single card'
    let text = fs.readFileSync(file)
    if (withCheck) {
      text = text.replace('  tasks:', '  check: { kind: generic, skill: my-skill }\n  tasks:')
      fs.writeFileSync(file, text)
    }
    const result = { status: 'ok', summary: 'Prepared', boardStatus: 'Todo' }
    await start(snapshot, { file, text }, { card: '12' })
    await next(snapshot)
    write(card, ready)
    await record(snapshot, 'refine', { ...result, riskTag: 'risk:green', openQuestions: [] })
    if (withCheck) {
      await next(snapshot)
      await record(snapshot, 'check', {
        status: 'failed',
        summary: 'No result',
        reason: 'engine-error',
      })
    }
    expect(states('refinement-12')).toEqual({
      refine: 'ok',
      ...(withCheck && { check: 'failed' }),
      tasks: 'pending',
    })

    let assignees = ['maintainer']
    const workflow = deps(
      {
        'my-skill': () => fenced({ status: 'ok', summary: 'Checked' }),
        'pair-process-plan-tasks': () => fenced({ ...result, tasks: 1 }),
      },
      {
        async readSelection(at, scope) {
          const selection = await readWorkflowCards(at, scope)
          return { ...selection, cards: selection.cards.map(card => ({ ...card, assignees })) }
        },
        readResultFacts: async () => ({
          card: { boardStatus: 'Todo', labels: ['risk:green'], body: ready },
        }),
        board: { getState: async () => 'Todo', setState: async () => {} },
      },
    )
    const command = parseRunCommand(
      {
        cwd: project,
        card: withCheck ? '12' : '12,13',
        ...(withCheck ? {} : { filter: 'risk:green', assignee: 'maintainer' }),
      },
      ['refinement'],
    )
    if (!withCheck) {
      write(card, ready.replace('risk:green', 'risk:yellow'))
      expect(await handleRunCommand(command, fs, workflow)).toBe(0)
      expect(launched).toHaveLength(0)

      write(card, ready)
      assignees = ['other']
      expect(await handleRunCommand(command, fs, workflow)).toBe(0)
      expect(launched).toHaveLength(0)
      assignees = ['maintainer']
    }
    expect(await handleRunCommand(command, fs, workflow), lines.join('\n')).toBe(0)
    expect(states('refinement-12'), lines.join('\n')).toEqual({
      refine: 'ok',
      ...(withCheck && { check: 'ok' }),
      tasks: 'ok',
    })
    expect(launched.map(one => skillOf(one.promptText))).toEqual([
      ...(withCheck ? ['my-skill'] : []),
      'pair-process-plan-tasks',
    ])
  },
)

function fakeWorkflowBoard(boardFailure?: string, failSelected = false) {
  write(
    '.pair/adoption/tech/way-of-working.md',
    REGISTRY + '\n- `pm-tool`: `github`\n- `pm-project`: `Pair`\n',
  )
  const skill = '.claude/skills/pair-workflow-cycle'
  write(`${skill}/SKILL.md`, '# Cycle\n')
  fs.symlinkSync(
    join(__dirname, '../../../../../', skill, 'scripts'),
    join(project, skill, 'scripts'),
  )
  const reads = join(project, 'dependencies.log')
  const gh = join(project, 'gh')
  write(
    'gh',
    `#!/usr/bin/env node
const fs = require('node:fs')
const [command, action, id] = process.argv.slice(2)
const out = value => process.stdout.write(JSON.stringify(value))
if (command === 'repo') process.stdout.write('acme/pair')
else if (command === 'project') out({ projects: ${JSON.stringify(boardFailure ? [{ id: 'P1', title: 'Pair' }] : [])} })
else if (command === 'issue' && action === 'view') {
  if (!process.argv.includes('-q')) out({ title: 'Story ' + id, body: '', labels: id === '9' ? [{ name: 'wanted' }] : [], state: 'OPEN' })
} else if (command === 'api' && action === 'graphql') {
  if (process.argv.includes('n=' + process.env.PAIR_TEST_BOARD_OUTAGE)) {
    process.stderr.write('HTTP 503\\nRetry-After: 0\\n')
    process.exitCode = 1
  } else out({ data: { repository: { issue: { projectItems: { nodes: [
    { project: { id: 'P1' }, fieldValueByName: { name: 'Draft' } },
  ] } } } } })
} else if (command === 'api' && action.includes('/dependencies/blocked_by?')) {
  const card = action.split('/').at(-3)
  fs.appendFileSync(${JSON.stringify(reads)}, card + '\\n')
  if (card === '10' || ${failSelected}) { process.stderr.write('dependency unavailable'); process.exitCode = 1 }
  else out([])
} else process.exitCode = 3
`,
  )
  fs.chmodSync(gh, 0o755)
  vi.stubEnv('PAIR_GH_BIN', gh)
  vi.stubEnv('PAIR_TEST_BOARD_OUTAGE', boardFailure)
  return reads
}

it.each<{
  failSelected?: boolean
  status?: 'Draft'
  configuredStatus?: 'Ready'
  boardFailure?: '9' | '10'
  error?: RegExp
}>([
  {},
  { failSelected: true, error: /#9: failed — dependency unavailable/ },
  { status: 'Draft', error: /#9: failed — board-unresolved/ },
  { status: 'Draft', configuredStatus: 'Ready' },
  { boardFailure: '10' },
  {
    status: 'Draft',
    boardFailure: '9',
    error: /#9: failed — board-unreadable: .* after 4 attempts: HTTP 503/,
  },
])(
  'R744-05/R744-10/R744-14: filter before failures ($failSelected, $status, $configuredStatus, $boardFailure)',
  async ({ failSelected = false, status, configuredStatus, boardFailure, error }) => {
    if (configuredStatus)
      write(
        '.pair/adoption/tech/workflows/quick.yaml',
        `${QUICK}select: { filter: { status: [${configuredStatus}] } }\n`,
      )
    const reads = fakeWorkflowBoard(boardFailure, failSelected)
    try {
      const command = parseRunCommand(
        {
          cwd: project,
          card: '9,10',
          filter: 'wanted',
          dryRun: true,
          ...(status !== undefined && { status }),
        },
        ['quick'],
      )
      expect(await handleRunCommand(command, fs), lines.join('\n')).toBe(error ? 1 : 0)
      expect(lines.some(line => line.includes('#10: not-applicable'))).toBe(true)
      if (error) expect(lines.join('\n')).toMatch(error)
      if (configuredStatus)
        expect(lines.some(line => line.includes('#9: not-applicable'))).toBe(true)
      if (status) expect(fs.existsSync(reads)).toBe(false)
      else expect(fs.readFileSync(reads)).toBe('9\n')
    } finally {
      vi.unstubAllEnvs()
    }
  },
)

it('R744-15: resumes a status-conditioned step after a board outage', async () => {
  fakeWorkflowBoard('9')
  try {
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      `version: 1
name: quick
steps:
  label: { kind: generic, skill: my-skill, when: { has: [wanted] } }
  excluded: { kind: generic, skill: my-skill, when: { has: [missing], status: [Draft] } }
  check: { kind: generic, skill: my-skill, when: { status: [Draft] } }
  ready: { kind: generic, skill: my-skill, when: { status: [Ready] } }
`,
    )
    const skills = { 'my-skill': () => fenced({ status: 'ok', summary: 'Checked' }) }
    const options = { card: '9' }
    expect(await run(['quick'], skills, options), lines.join('\n')).toBe(1)
    expect(lines.join('\n')).toMatch(
      /check: failed.*board-unreadable: .* after 4 attempts: HTTP 503/,
    )
    expect(states('quick-9')).toEqual({
      label: 'ok',
      excluded: 'skipped',
      check: 'pending',
      ready: 'pending',
    })
    expect(launched).toHaveLength(1)

    vi.stubEnv('PAIR_TEST_BOARD_OUTAGE', undefined)
    expect(await run(['quick'], skills, options), lines.join('\n')).toBe(0)
    expect(states('quick-9')).toEqual({
      label: 'ok',
      excluded: 'skipped',
      check: 'ok',
      ready: 'skipped',
    })
    expect(launched).toHaveLength(2)
  } finally {
    vi.unstubAllEnvs()
  }
})
