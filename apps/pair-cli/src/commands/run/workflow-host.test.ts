import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { once } from 'node:events'
import { createServer, type AddressInfo, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { PassThrough } from 'node:stream'
import { basename, join } from 'path'
import {
  hashOf,
  start,
  type RunStateFile,
  type RunTelemetry,
  type StepTelemetry,
} from '@pair/workflows'
import { fileSystemService as disk } from '@pair/content-ops'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
// @ts-expect-error Vite loads the adopted definition as fixture text.
import deliveryDefinition from '../../../../../.pair/adoption/tech/workflows/delivery.yaml?raw'
// @ts-expect-error Vite loads the shipped definition as fixture text.
import quickDefinition from '../../../../../packages/knowledge-hub/dataset/.pair/adoption/tech/workflows/quick.yaml?raw'
// @ts-expect-error Vite loads the portable definition as fixture text.
import portableQuick from '../../../../../packages/knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/automation/workflow-examples/quick.yaml?raw'
// @ts-expect-error Vite loads the recorded engine stream as fixture text.
import piSuccess from './__fixtures__/pi-success.jsonl?raw'
// @ts-expect-error Vite loads the recorded engine stream as fixture text.
import openCodeSuccess from './__fixtures__/opencode-success.jsonl?raw'
// @ts-expect-error Vite loads the recorded engine stream as fixture text.
import openCodeIntermediate from './__fixtures__/opencode-intermediate-steps.jsonl?raw'
import baseConfig from '../../../config.json'
import { acquireRunLock } from './run-lock'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import { buildEngineArgs, spawnIteration, type SpawnIterationInput } from './spawn'
import { runHostProcess } from './host-process'
import type { WorkflowHostDependencies } from './workflow-host'

/**
 * US-652 — `pair run <workflow> --card <id>`, through the command's own entry point, with a fake
 * launcher, fake skills, and in-memory project files.
 */

vi.mock('#config/kb-resolver', () => ({
  getKnowledgeHubDatasetPath: () => '/kb/dataset',
}))
vi.mock('./run-lock', () => ({ acquireRunLock: vi.fn() }))
vi.mock('./host-process', () => ({ runHostProcess: vi.fn() }))
vi.mock('./cycle-wiring', async importOriginal => ({
  ...(await importOriginal<typeof import('./cycle-wiring')>()),
  mainCheckoutOrCwd: (cwd: string) => cwd,
}))

const hostProcess = vi.mocked(runHostProcess)
const success = (stdout = '') => ({ status: 0, stdout, stderr: '' })

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
type FakeSkill = (input: SpawnIterationInput) => string | undefined
type Launched = Pick<SpawnIterationInput, 'promptText' | 'cwd' | 'autonomyArgs'>

const project = '/project'
let fs: InMemoryFileSystemService
const release = vi.fn()
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
      const text = (skills[skillOf(input.promptText)] as FakeSkill)(input)
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
  return {
    workflow,
    acquireLock: () => ({
      kind: 'acquired' as const,
      lock: { path: '/card-lock', release: vi.fn() },
    }),
  }
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
  fs = new InMemoryFileSystemService(
    {
      '/project/config.json': JSON.stringify(baseConfig),
      '/kb/dataset/.pair/adoption/tech/workflows/quick.yaml': quickDefinition as string,
      '/kb/dataset/.pair/knowledge/guidelines/collaboration/automation/workflow-examples/quick.yaml':
        portableQuick as string,
    },
    project,
    project,
  )
  release.mockReset()
  vi.mocked(acquireRunLock).mockReset().mockReturnValue({ kind: 'acquired', release })
  lines = []
  launched = []
  hostProcess.mockReset().mockResolvedValue(success())
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
})

it('reports a missing escalation comment to the console while the run stays parked (#728 AC-8)', async () => {
  write(
    '.pair/adoption/tech/workflows/quick.yaml',
    `${QUICK}    escalate: { needs-decision: { do: stop, comment: 'Decision: {reason}' } }\n`,
  )

  expect(
    await run(['quick'], {
      ...OK,
      'pair-process-review': () =>
        fenced({ status: 'needs-decision', summary: 'waiting', reason: 'pick A or B' }),
    }),
  ).toBe(0)

  expect(states()['review']).toBe('needs-decision')
  expect(lines.join('\n')).toMatch(/comment.*(?:not written|could not be written)/i)
})

const MAPPING = `## State Mapping

| Board State | Macrostate |
| --- | --- |
| Inbox | Draft |
| Planned | Ready |
| Building | In Progress |
| Checking | Review |
| Finished | Done |
`

describe('card state (AC-13)', () => {
  // A fake board that remembers the state it was given; `current` is what the card holds at the start.
  const withBoard = (
    setState: (card: string, state: string) => Promise<void>,
    current: string | null | Error = null,
  ) => {
    let now = current
    return {
      board: {
        getState: async () => {
          if (now instanceof Error) throw now
          return now
        },
        setState: async (card: string, state: string) => {
          await setState(card, state)
          now = state
        },
      },
    }
  }
  beforeEach(() => write('.pair/adoption/tech/way-of-working.md', REGISTRY + MAPPING))

  it('sets Building when implement starts, Checking when review starts, and prints each', async () => {
    const writes: string[] = []
    const board = withBoard(async (card, state) => void writes.push(`${card}:${state}`))
    expect(await run(['quick'], OK, {}, board)).toBe(0)

    expect(writes).toEqual(['627:Building', '627:Checking'])
    expect(lines).toContain('  Card 627: state Building')
  })

  it('a step key overrides the kind: none sets nothing, Done is set when the step ends ok', async () => {
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      QUICK.replace('kind: implement\n', 'kind: implement\n    state: none\n').replace(
        'kind: review\n',
        'kind: review\n    state: Done\n',
      ),
    )
    const writes: string[] = []
    const board = withBoard(async (_card, state) => void writes.push(state))
    expect(await run(['quick'], OK, {}, board)).toBe(0)

    expect(writes).toEqual(['Finished'])
  })

  it('never moves back: a card in Checking (Review) stays there through fix', async () => {
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      `${QUICK.replace('kind: review', 'kind: review\n    on-failed: continue')}  fix:\n    kind: fix\n`,
    )
    const fixed = fenced({ status: 'ok', summary: 'fixed', head: HEAD, resolutions: [] })
    const skills = { ...OK, 'pair-process-fix': () => fixed }
    const writes: string[] = []
    const board = withBoard(async (_card, state) => void writes.push(state), 'Checking')
    expect(await run(['quick'], skills, {}, board)).toBe(0)
    expect(launched).toHaveLength(3)

    expect(writes).toEqual([])
  })

  it('moves forward: a card in Building gets Checking when review starts', async () => {
    const writes: string[] = []
    const board = withBoard(async (_card, state) => void writes.push(state), 'Building')
    expect(await run(['quick'], OK, {}, board)).toBe(0)

    expect(writes).toEqual(['Checking'])
  })

  it('a failed read is a warning, sets nothing, and the run goes on', async () => {
    const writes: string[] = []
    const board = withBoard(async (_c, state) => void writes.push(state), new Error('no read'))
    expect(await run(['quick'], OK, {}, board)).toBe(0)

    expect(writes).toEqual([])
    expect(lines.some(line => line.includes('Warning: card state Building not set: no read'))).toBe(
      true,
    )
  })

  it('a failed write is a warning and the run goes on', async () => {
    const board = withBoard(async () => {
      throw new Error('no board')
    })
    expect(await run(['quick'], OK, {}, board)).toBe(0)

    expect(
      lines.some(line => line.includes('Warning: card state Building not set: no board')),
    ).toBe(true)
    expect(states()).toEqual({ implement: 'ok', review: 'ok' })
  })

  describe('#723 T-5 workflow assignment (AC-6, AC-8)', () => {
    const implementOnly = (assign?: string) => `version: 1
name: quick
${assign === undefined ? '' : `assign: ${assign}\n`}steps:
  implement: { kind: implement }
`

    const assignmentHost = (
      actions: string[],
      response = success(JSON.stringify({ status: 'assigned' })),
    ) => {
      write('.claude/skills/pair-workflow-cycle/SKILL.md', '# Host bridge fixture')
      hostProcess.mockImplementation(async (bin, args) => {
        if (bin === 'sh') {
          expect(args).toEqual(['-c', 'true'])
          actions.push('host:gate')
          return success()
        }
        const [, operation, card, raw] = args
        expect(operation).toBe('assign-card')
        expect(card).toBe('627')
        const { assign } = JSON.parse(raw ?? '{}')
        actions.push(`assign:${assign}`)
        return assign === 'none' ? success(JSON.stringify({ status: 'unchanged' })) : response
      })
    }

    it('applies the workflow default and step overrides before board writes and execution', async () => {
      write(
        '.pair/adoption/tech/workflows/quick.yaml',
        `${implementOnly('me')}  review: { kind: review, assign: alice }
  finish: { kind: gate, gates: [quality-gate], assign: unassign }
`,
      )
      const actions: string[] = []
      assignmentHost(actions)
      const board = withBoard(async (_card, state) => void actions.push(`board:${state}`))
      const skills = {
        'pair-process-implement': () => {
          actions.push('agent:implement')
          return IMPLEMENTED
        },
        'pair-process-review': () => {
          actions.push('agent:review')
          return REVIEWED
        },
      }

      expect(await run(['quick'], skills, {}, board)).toBe(0)

      expect(actions).toEqual([
        'assign:me',
        'board:Building',
        'agent:implement',
        'assign:alice',
        'board:Checking',
        'agent:review',
        'assign:unassign',
        'host:gate',
      ])
      expect(launched[0]?.promptText).toContain('- assignee: none')
      expect(launched[1]?.promptText).not.toContain('- assignee:')
      expect(states()).toEqual({ implement: 'ok', review: 'ok', finish: 'ok' })
    })

    it('#723 F8: claims before applying a start-state override and launching implement', async () => {
      write(
        '.pair/adoption/tech/workflows/quick.yaml',
        implementOnly().replace('kind: implement', 'kind: implement, state: Review'),
      )
      const actions: string[] = []
      assignmentHost(actions)
      const board = withBoard(
        async (_card, state) => void actions.push(`board:${state}`),
        'Planned',
      )
      const skills = {
        'pair-process-implement': () => {
          actions.push('agent:implement')
          return IMPLEMENTED
        },
      }

      expect(await run(['quick'], skills, {}, board)).toBe(0)

      expect(actions).toEqual(['assign:me', 'board:Checking', 'agent:implement'])
      expect(launched[0]?.promptText).toContain('- assignee: none')
      expect(launched[0]?.promptText).toContain('- board-state: managed')
    })

    it('suppresses skill assignment for explicit none without asking the host to change ownership', async () => {
      write('.pair/adoption/tech/workflows/quick.yaml', implementOnly('none'))
      const actions: string[] = []
      assignmentHost(actions)

      expect(
        await run(
          ['quick'],
          OK,
          {},
          withBoard(async () => {}),
        ),
      ).toBe(0)

      expect(actions.every(action => action === 'assign:none')).toBe(true)
      expect(launched[0]?.promptText).toContain('- assignee: none')
    })

    it('reuses the frozen workflow assignment when the authored default changes before resume', async () => {
      const path = '.pair/adoption/tech/workflows/quick.yaml'
      write(path, implementOnly('me'))
      const actions: string[] = []
      assignmentHost(actions)
      const board = withBoard(async () => {})
      const failed = () => fenced({ status: 'failed', summary: 'gate red' })
      expect(await run(['quick'], { 'pair-process-implement': failed }, {}, board)).toBe(1)
      actions.length = 0
      write(path, implementOnly('none'))

      expect(await run(['quick'], OK, {}, board)).toBe(0)

      expect(actions).toEqual(['assign:me'])
      expect(states()).toEqual({ implement: 'ok' })
    })

    it.each([
      ['write denied', success(JSON.stringify({ status: 'warning', reason: 'write denied' }))],
      ['read-back unavailable', { ...success(), status: 1, stderr: 'read-back unavailable' }],
    ])(
      'warns on %s and still runs implement with assignment disabled',
      async (reason, response) => {
        write('.pair/adoption/tech/workflows/quick.yaml', implementOnly('me'))
        const actions: string[] = []
        assignmentHost(actions, response)

        expect(
          await run(
            ['quick'],
            OK,
            {},
            withBoard(async () => {}),
          ),
        ).toBe(0)

        expect(actions).toEqual(['assign:me'])
        expect(lines.some(line => line.includes('Warning:') && line.includes(reason))).toBe(true)
        expect(launched[0]?.promptText).toContain('- assignee: none')
        expect(states()).toEqual({ implement: 'ok' })
      },
    )

    it('skips a held card before the first board write or launch and names its owners', async () => {
      write('.pair/adoption/tech/workflows/quick.yaml', implementOnly('me'))
      const actions: string[] = []
      assignmentHost(actions, success(JSON.stringify({ status: 'held', owners: ['alice', 'bob'] })))
      const board = withBoard(async (_card, state) => void actions.push(`board:${state}`))

      expect(await run(['quick'], OK, {}, board)).toBe(0)

      expect(actions).toEqual(['assign:me'])
      expect(launched).toEqual([])
      expect(
        lines.some(line => /skipp/i.test(line) && line.includes('alice') && line.includes('bob')),
      ).toBe(true)
    })

    it.each(['implement', 'rounds/review'])(
      '#723 F6: a held %s resumes at execution one',
      async step => {
        const inLoop = step === 'rounds/review'
        const definition = inLoop
          ? `${implementOnly('none')}  rounds:
    kind: loop
    until: review
    max: 1
    on-max: escalate
    steps:
      review: { kind: review, assign: me }
`
          : implementOnly('me')
        write('.pair/adoption/tech/workflows/quick.yaml', definition)
        const board = withBoard(async () => {})
        const telemetry = () =>
          fs
            .readFileSync(join(runDir(), 'telemetry.jsonl'))
            .trimEnd()
            .split('\n')
            .map(line => JSON.parse(line) as RunTelemetry | StepTelemetry)
        const executions = () =>
          (JSON.parse(fs.readFileSync(join(runDir(), 'state.json'))) as RunStateFile).steps[step]
            ?.executions ?? 0

        assignmentHost([], success(JSON.stringify({ status: 'held', owners: ['alice'] })))
        expect(await run(['quick'], OK, { telemetry: true }, board)).toBe(0)
        expect.soft(executions()).toBe(0)
        expect(launched).toHaveLength(inLoop ? 1 : 0)
        expect(telemetry().at(-1)).toMatchObject({
          type: 'run',
          status: 'skipped',
          steps: inLoop ? 1 : 0,
        })

        assignmentHost([])
        expect(await run(['quick'], OK, { telemetry: true }, board)).toBe(0)
        expect.soft(executions()).toBe(1)
        expect(launched).toHaveLength(inLoop ? 2 : 1)
        const executionsOfStep = telemetry().flatMap(row =>
          row.type === 'step' && row.step === step ? [row.attempt] : [],
        )
        expect(executionsOfStep).toEqual([1])
        expect(telemetry().at(-1)).toMatchObject({ type: 'run', status: 'done' })
      },
    )
  })
})

describe('#723 T-7 held cards in a batch (AC-4)', () => {
  it.each([
    { source: 'explicit assignment', declaresAssign: true, routing: '' },
    { source: 'implicit assignment', declaresAssign: false, routing: '' },
    {
      source: 'implicit assignment with on-failed: continue',
      declaresAssign: false,
      routing: ', on-failed: continue',
    },
  ])(
    'skips for $source, runs independent work, and retries after release',
    async ({ declaresAssign, routing }) => {
      const definition = `version: 1
name: quick
${declaresAssign ? 'assign: me\n' : ''}steps:
  implement: { kind: implement${routing} }
  finish: { kind: generic, skill: my-skill }
`
      write('.pair/adoption/tech/workflows/quick.yaml', definition)
      write('.claude/skills/pair-workflow-cycle/SKILL.md', '# Host bridge fixture')
      write('.pair/adoption/tech/way-of-working.md', REGISTRY + MAPPING)

      let held = true
      const boardWrites: string[] = []
      const assignmentChecks: string[] = []
      hostProcess.mockImplementation(async (_bin, args) => {
        const [, operation, card] = args
        expect(operation).toBe('assign-card')
        assignmentChecks.push(card!)
        return success(
          JSON.stringify(
            card === '627' && held ? { status: 'held', owners: ['alice'] } : { status: 'assigned' },
          ),
        )
      })
      const workflow: Partial<WorkflowHostDependencies> = {
        board: {
          getState: async () => null,
          setState: async id => void boardWrites.push(id),
        },
        readSelection: async () => ({
          cards: ['627', '628', '629'].map(id => ({
            id,
            title: `Story ${id}`,
            body: '',
            labels: [],
            boardState: null,
            closed: false,
            prerequisites: id === '629' ? ['627'] : [],
          })),
        }),
      }
      const skills = {
        'my-skill': () => fenced({ status: 'ok', summary: 'Finished' }),
        'pair-process-implement': () => IMPLEMENTED,
      }
      const batch = () => run(['quick'], skills, { card: '627,628,629' }, workflow)
      const launches = () =>
        launched.map(({ cwd, promptText }) => `${basename(cwd)}:${skillOf(promptText)}`)
      const summary = (id: string) => lines.find(line => line.trimStart().startsWith(`#${id}:`))

      expect.soft(await batch()).toBe(0)
      expect.soft(launches()).toEqual(['628:pair-process-implement', '628:my-skill'])
      expect.soft(assignmentChecks).toEqual(declaresAssign ? ['627', '628', '628'] : ['627', '628'])
      expect.soft(summary('627')).toMatch(/#627: skipped.*alice.*card-held/)
      expect.soft(boardWrites).not.toContain('627') // #723 AC-4, F1
      expect.soft(boardWrites).toContain('628')
      expect.soft(summary('628')).toContain('#628: done')
      expect.soft(summary('629')).toContain('#629: waiting — waiting for #627')

      held = false
      launched.length = 0
      lines.length = 0
      expect.soft(await batch()).toBe(0)
      expect
        .soft(launches())
        .toEqual([
          '627:pair-process-implement',
          '627:my-skill',
          '629:pair-process-implement',
          '629:my-skill',
        ])
      expect.soft(summary('628')).toContain('#628: skipped — workflow already complete')
    },
  )
})

describe('always autonomous (AC-12)', () => {
  it.each([[{}], [{ autonomous: true }]])(
    'passes the engine bypass arguments with or without --autonomous (%j)',
    async flags => {
      expect(await run(['quick'], OK, { engine: 'claude', ...flags })).toBe(0)

      expect(launched.map(one => one.autonomyArgs)).toEqual(
        Array(2).fill(['--permission-mode', 'bypassPermissions']),
      )
    },
  )
})

describe('a linear run (AC-1)', () => {
  it('runs the steps in file order in the card worktree, prints each outcome, leaves every step ok', async () => {
    expect(await run(['quick'])).toBe(0)

    expect(launched.map(one => skillOf(one.promptText))).toEqual([
      'pair-process-implement',
      'pair-process-review',
    ])
    expect(launched.map(one => one.cwd)).toEqual(Array(2).fill(join(project, 'worktrees/627')))
    expect(lines).toContain('  implement: ok — PR opened')
    expect(lines).toContain('  review: ok — approved')
    expect(lines).toContain('  Run: done — every step is ok.')
    expect(states()).toEqual({ implement: 'ok', review: 'ok' })
  })

  it('stops at the step that fails: exit 1, the reason printed and stored', async () => {
    const failing = () => fenced({ status: 'failed', summary: 'gate red', reason: 'quality-gate' })
    expect(await run(['quick'], { ...OK, 'pair-process-implement': failing })).toBe(1)

    expect(launched).toHaveLength(1)
    expect(lines).toContain('  implement: failed — gate red (quality-gate)')
    expect(lines).toContain(
      '  Run: failed at step implement — gate red (quality-gate). Fix it, then resume with: pair-cli run quick --card 627',
    )
    expect(states()).toEqual({ implement: 'failed', review: 'pending' })
    expect(
      JSON.parse(fs.readFileSync(join(runDir(), 'steps/implement/result.json'))),
    ).toMatchObject({ status: 'failed', reason: 'quality-gate' })
  })

  it('prints the engine with the level of the cascade that chose it', async () => {
    await run(['quick'], OK, { engine: 'codex' })
    expect(lines.find(line => line.startsWith('  Engine: '))).toMatch(
      /^ {2}Engine: codex — .*\(from --engine\)$/,
    )
    expect(launched[0]?.promptText.split('\n')[0]).toBe('Run the pair-process-implement skill.')
  })
})

describe('validation before any launch (AC-2, AC-3)', () => {
  it.each([
    [
      'an unknown kind',
      QUICK.replace('kind: review', 'kind: deploy'),
      'quick.yaml:8: steps.review.kind: unknown value "deploy"',
    ],
    [
      'an unknown gate key',
      QUICK.replace('[quality-gate]', '[e2e]'),
      "quick.yaml:6: steps.implement.gates.0: unknown gate key 'e2e' — fix: use one of quality-gate",
    ],
    [
      'a skill that is not installed',
      QUICK.replace('kind: review', 'kind: review\n    skill: nowhere'),
      "quick.yaml:9: steps.review.skill: skill 'nowhere' is not installed",
    ],
  ])('refuses %s, naming file, line and fix, and launches nothing', async (_name, text, error) => {
    write('.pair/adoption/tech/workflows/quick.yaml', text)
    expect(await run(['quick'])).toBe(1)
    expect(lines.some(line => line.includes(error) && line.includes('— fix: '))).toBe(true)
    expect(lines).toContain('  Refused: 1 error(s); nothing was launched.')
    expect(launched).toEqual([])
    expect(fs.existsSync(runDir())).toBe(false)
  })

  it('--dry-run validates and prints the steps without launching or creating a run', async () => {
    expect(await run(['quick'], OK, { dryRun: true })).toBe(0)
    expect(lines).toContain('  1. implement — implement')
    expect(lines).toContain('  2. review — review')
    expect(lines).toContain('  Dry run: the workflow is valid; nothing was launched.')
    expect(launched).toEqual([])
    expect(fs.existsSync(runDir())).toBe(false)
  })

  it('R754-06: previews and invokes the installed default, keeping explicit names literal', async () => {
    write(
      'pair.config.json',
      JSON.stringify({
        asset_registries: { skills: { prefix: 'team', target_path: 'team/skills' } },
      }),
    )
    const skill = 'team-process-refine-story'
    write(`team/skills/${skill}/SKILL.md`, 'Refine a story.')
    const file = '.pair/adoption/tech/workflows/quick.yaml'
    const definition =
      'version: 1\nname: quick\nsteps:\n  refine: { kind: refine-story, with: { mode: autonomous } }\n'
    write(
      file,
      definition.replace(
        'kind: refine-story',
        'kind: refine-story, skill: pair-process-refine-story',
      ),
    )
    expect(await run(['quick'], {}, { dryRun: true })).toBe(1)
    write(file, definition)
    expect(await run(['quick'], {}, { dryRun: true })).toBe(0)
    expect(lines.some(line => line.includes(`refine: refine-story skill=${skill}`))).toBe(true)
    await run(['quick'], {
      [skill]: () => fenced({ status: 'needs-decision', summary: 'Question' }),
    })
    expect(launched.map(one => skillOf(one.promptText))).toEqual([skill])
  })

  it('--dry-run refuses an invalid workflow', async () => {
    write('.pair/adoption/tech/workflows/quick.yaml', QUICK.replace('version: 1', 'version: 2'))
    expect(await run(['quick'], OK, { dryRun: true })).toBe(1)
    expect(
      lines.some(line => line.includes('quick.yaml:1: version: unknown value 2 — fix: use 1')),
    ).toBe(true)
  })
})

it.each([
  ['    timeout-minutes: 2\n', 120],
  ['', 7],
])(
  '#704 AC-1: uses the step timeout or falls back to the run cap (%s)',
  async (timeout, seconds) => {
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      QUICK.replace('    kind: implement\n', `    kind: implement\n${timeout}`),
    )
    const limits: (number | undefined)[] = []
    const recordLimit = (input: SpawnIterationInput) => {
      limits.push(input.timeoutSeconds)
      return IMPLEMENTED
    }
    expect(
      await run(
        ['quick'],
        { ...OK, 'pair-process-implement': recordLimit },
        { iterationTimeout: '7' },
      ),
    ).toBe(0)
    expect(limits).toEqual([seconds])
  },
)

function replayEngine(input: SpawnIterationInput, stream: string) {
  const program = `require('node:fs').writeFileSync(1, ${JSON.stringify(stream)})`
  return spawnIteration({
    ...input,
    cwd: tmpdir(),
    engine: { ...input.engine, command: process.execPath, headlessArgs: ['-e', program, '--'] },
  })
}

async function finalizeCodex(
  input: SpawnIterationInput,
  message: string,
  {
    initialText = '',
    streamText,
    exitCode = 0,
    finalizationMs,
  }: {
    initialText?: string
    streamText?: string
    exitCode?: number | null
    finalizationMs?: number
  } = {},
) {
  const server = createServer(socket => socket.on('error', () => socket.destroy())).listen(
    0,
    '127.0.0.1',
  )
  try {
    await once(server, 'listening')
    const { port } = server.address() as AddressInfo
    const connected = once(server, 'connection') as Promise<[Socket]>
    const program = `const fs = require('node:fs')
      const flag = process.argv.indexOf('--output-last-message')
      const output = fs.openSync(process.argv[flag + 1], 'w')
      fs.writeFileSync(output, ${JSON.stringify(initialText)})
      const exitCode = ${exitCode}
      const shutdown = require('node:net').connect(${port}, '127.0.0.1')
      shutdown.once('connect', () => {
        const text = ${JSON.stringify(streamText)}
        if (text !== undefined) {
          fs.writeFileSync(1, JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } }) + '\\n')
        }
        fs.writeFileSync(1, '{"type":"turn.completed"}\\n')
      })
      shutdown.once('end', () => {
        fs.ftruncateSync(output, 0)
        fs.writeSync(output, ${JSON.stringify(message)}, 0, 'utf8')
        fs.closeSync(output)
        if (exitCode === null) setInterval(() => {}, 1000)
        else process.exitCode = exitCode
      })`
    let sawTerminal = false
    const result = await spawnIteration({
      ...input,
      cwd: tmpdir(),
      engine: { ...input.engine, command: process.execPath, headlessArgs: ['-e', program, '--'] },
      onEvent: event => {
        input.onEvent?.(event)
        if ((event as { type: string }).type !== 'turn.completed') return
        sawTerminal = true
        if (finalizationMs !== undefined)
          vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        // Release shutdown after the terminal event has been consumed.
        setImmediate(() => {
          if (finalizationMs !== undefined) {
            vi.advanceTimersByTime(finalizationMs)
            vi.useRealTimers()
          }
          void connected.then(([socket]) => socket.end())
        })
      },
    })
    expect(sawTerminal).toBe(true)
    return result
  } finally {
    server.close()
  }
}

it.each([
  { label: 'a fenced result' },
  {
    label: 'a fenced result after an unmatched brace',
    prose: 'Config contains an unmatched { brace.\n',
  },
  {
    label: 'a fenced result after status in stream prose',
    streamText: 'Earlier step reported {"status":"ok"}. Waiting for approval.',
  },
  {
    label: 'a fenced result after an incomplete stream result',
    streamText: fenced({ status: 'ok' }),
  },
  { label: 'a fenced result after six seconds of finalization', finalizationMs: 6000 },
])(
  '#704 F9: records $label from the Codex file without a retry (AC-2)',
  async ({ prose = '', streamText, finalizationMs }) => {
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      QUICK.replace('    kind: implement', '    kind: implement\n    retries: 1'),
    )
    const result =
      prose + fenced({ status: 'blocked', summary: 'Waiting', reason: 'approval-required' })
    const runIteration = vi.fn((input: SpawnIterationInput) =>
      finalizeCodex(input, result, {
        ...(streamText !== undefined && { streamText }),
        ...(finalizationMs !== undefined && { finalizationMs }),
      }),
    )

    const exit = await run(
      ['quick'],
      OK,
      { engine: 'codex', iterationTimeout: '30' },
      { runIteration },
    )
    expect.soft(exit).toBe(0)
    const state = JSON.parse(fs.readFileSync(join(runDir(), 'state.json'))) as RunStateFile
    expect.soft(state.steps['implement']).toMatchObject({
      state: 'blocked',
      reason: 'approval-required',
    })
    expect(runIteration).toHaveBeenCalledTimes(1)
  },
)

it('#704 F9: retains the valid Codex stream result when the file is malformed (AC-2)', async () => {
  const streamText = fenced({ status: 'blocked', summary: 'Waiting', reason: 'approval-required' })
  const runIteration = vi.fn((input: SpawnIterationInput) =>
    finalizeCodex(input, fenced({ summary: 'Missing status' }), { streamText }),
  )

  expect(await run(['quick'], OK, { engine: 'codex' }, { runIteration })).toBe(0)
  const state = JSON.parse(fs.readFileSync(join(runDir(), 'state.json'))) as RunStateFile
  expect(state.steps['implement']).toMatchObject({ state: 'blocked', reason: 'approval-required' })
  expect(runIteration).toHaveBeenCalledTimes(1)
})

it('#704 F9: rejects a finalized result without status even if the earlier file was valid (AC-3)', async () => {
  write(
    '.pair/adoption/tech/workflows/quick.yaml',
    QUICK.replace('    kind: implement', '    kind: implement\n    retries: 0'),
  )
  const result = fenced({ summary: 'Missing status' })
  const runIteration = (input: SpawnIterationInput) =>
    finalizeCodex(input, result, {
      initialText: fenced({ status: 'blocked', summary: 'Stale', reason: 'stale-result' }),
      streamText: 'Earlier step reported {"status":"ok"}.',
    })

  const exit = await run(['quick'], OK, { engine: 'codex' }, { runIteration })
  const state = JSON.parse(fs.readFileSync(join(runDir(), 'state.json'))) as RunStateFile
  expect.soft(state.steps['implement']).toMatchObject({
    state: 'failed',
    reason: 'invalid-result',
    attempts: [{ kind: 'invalid-result', detail: expect.stringMatching(/status/) }],
  })
  expect(exit).toBe(1)
})

it.each([
  { exitCode: 1, kind: 'crash' },
  { exitCode: null, kind: 'timeout' },
])(
  '#704 F9: records a $kind when Codex writes valid-looking text without a clean exit (AC-2)',
  async ({ exitCode, kind }) => {
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      QUICK.replace('    kind: implement', '    kind: implement\n    retries: 0'),
    )
    const result = fenced({
      status: 'blocked',
      summary: 'Not finalized',
      reason: 'approval-required',
    })
    const runIteration = (input: SpawnIterationInput) =>
      finalizeCodex(input, result, {
        initialText: result,
        streamText: 'Earlier step reported {"status":"ok"}.',
        exitCode,
      })

    const limits = kind === 'timeout' ? { iterationTimeout: '1' } : {}
    expect(await run(['quick'], OK, { engine: 'codex', ...limits }, { runIteration })).toBe(0)
    const state = JSON.parse(fs.readFileSync(join(runDir(), 'state.json'))) as RunStateFile
    expect(state.steps['implement']).toMatchObject({
      state: 'blocked',
      reason: 'fault',
      attempts: [{ kind, exitCode }],
    })
  },
)

it.each([
  [
    'pi with endTurn',
    'pi',
    piSuccess as string,
    'CONTINUE-TOKEN: pair-loop --root 212 --iteration 5',
  ],
  [
    'pi with stop',
    'pi',
    (piSuccess as string).replace('"stopReason":"endTurn"', '"stopReason":"stop"'),
    'CONTINUE-TOKEN: pair-loop --root 212 --iteration 5',
  ],
  ['opencode', 'opencode', openCodeSuccess as string, 'LOOP RUN: stop reason nothing eligible'],
] as const)(
  '#704 F4: records the work result from %s without a retry (AC-2)',
  async (_label, engine, fixture, original) => {
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      QUICK.replace('    kind: implement', '    kind: implement\n    retries: 1'),
    )
    const final = fenced({ status: 'blocked', summary: 'Waiting for the maintainer' })
    const stream = fixture.replace(JSON.stringify(original), () => JSON.stringify(final))
    const runIteration = vi.fn((input: SpawnIterationInput) => replayEngine(input, stream))

    expect(await run(['quick'], OK, { engine, approveProjectTrust: true }, { runIteration })).toBe(
      0,
    )
    expect(runIteration).toHaveBeenCalledTimes(1)
    expect(states()['implement']).toBe('blocked')
    expect(lines).toEqual(
      expect.arrayContaining([expect.stringContaining('Waiting for the maintainer')]),
    )
  },
)

it('#704 F7: OpenCode faults when only a tool-call step has text (AC-2, AC-3)', async () => {
  write(
    '.pair/adoption/tech/workflows/quick.yaml',
    QUICK.replace('    kind: implement', '    kind: implement\n    retries: 0'),
  )
  const events = (openCodeIntermediate as string).split('\n')
  const text = fenced({ status: 'blocked', summary: 'Intermediate', reason: 'intermediate-only' })
  events.splice(1, 0, JSON.stringify({ type: 'text', part: { type: 'text', text } }))
  const runIteration = (input: SpawnIterationInput) => replayEngine(input, events.join('\n'))

  expect(await run(['quick'], OK, { engine: 'opencode' }, { runIteration })).toBe(0)
  const state = JSON.parse(fs.readFileSync(join(runDir(), 'state.json'))) as RunStateFile
  expect(state.steps['implement']).toMatchObject({
    state: 'blocked',
    reason: 'fault',
    attempts: [{ attempt: 1, kind: 'no-result' }],
  })
})

it.each([
  { subtype: 'success', attempts: 1, reason: 'approval-required' },
  { subtype: 'error_during_execution', attempts: 2, reason: 'fault' },
])('#704 F5: a $subtype terminal event uses the correct retry path (AC-2)', async row => {
  write(
    '.pair/adoption/tech/workflows/quick.yaml',
    QUICK.replace('    kind: implement', '    kind: implement\n    retries: 1'),
  )
  const result = fenced({
    status: 'blocked',
    summary: 'pair-loop: HALT — approval required',
    reason: 'approval-required',
  })
  const stream = JSON.stringify({ type: 'result', subtype: row.subtype, result }) + '\n'
  const runIteration = vi.fn((input: SpawnIterationInput) => replayEngine(input, stream))

  expect(await run(['quick'], OK, {}, { runIteration })).toBe(0)
  expect(runIteration).toHaveBeenCalledTimes(row.attempts)
  const state = JSON.parse(fs.readFileSync(join(runDir(), 'state.json'))) as RunStateFile
  expect(state.steps['implement']).toMatchObject({ state: 'blocked', reason: row.reason })
})

it('#704 F6: the default live terminal prints the final stderr tail (AC-4)', async () => {
  write(
    '.pair/adoption/tech/workflows/quick.yaml',
    QUICK.replace('    kind: implement', '    kind: implement\n    retries: 0'),
  )
  const tty = Object.assign(new PassThrough(), { isTTY: true, columns: 80, rows: 24 })
  let output = ''
  tty.on('data', text => {
    output += String(text)
  })
  vi.spyOn(process, 'stdout', 'get').mockReturnValue(tty as unknown as typeof process.stdout)

  expect(
    await run(
      ['quick'],
      OK,
      {},
      {
        runIteration: async () => ({
          outcome: 'failed',
          detail: 'engine exited',
          process: { exitCode: 1, signal: null, elapsedMs: 42, stderrTail: ['Connection refused'] },
        }),
      },
    ),
  ).toBe(0)
  expect(output).toContain('Process fault — implement attempt 1')
  expect(output).toContain('  stderr: Connection refused\n')
})

it('#704 F8: telemetry keeps the watchdog limit and redacts stderr (AC-4)', async () => {
  write(
    '.pair/adoption/tech/workflows/quick.yaml',
    QUICK.replace('    kind: implement', '    kind: implement\n    retries: 0'),
  )
  const program = `require('node:fs').writeSync(2, 'synthetic-secret\\n'); setInterval(() => {}, 1000)`
  const runIteration = (input: SpawnIterationInput) =>
    spawnIteration({
      ...input,
      cwd: tmpdir(),
      engine: { ...input.engine, command: process.execPath, headlessArgs: ['-e', program, '--'] },
    })

  expect(
    await run(['quick'], OK, { telemetry: true, iterationTimeout: '1' }, { runIteration }),
  ).toBe(0)
  const [step] = fs.readFileSync(join(runDir(), 'telemetry.jsonl')).trim().split('\n')
  expect(JSON.parse(step!)).toMatchObject({
    step: 'implement',
    attempt: 1,
    diagnosis: {
      kind: 'timeout',
      detail: 'stalled: no terminal event within 1s — the engine was stopped',
      stderrTail: ['[redacted]'],
    },
  })
})

it.each(['complete', 'parked', 'failed'])(
  '#704 F17: headless %s opens recover a terminal fault before returning',
  async disposition => {
    const draft =
      '{ kind: generic, skill: pair-process-implement, retries: 0, escalate: { blocked: continue } }'
    const steps =
      disposition === 'complete'
        ? `  draft: ${draft}`
        : `  rounds:\n    kind: loop\n    max: 1\n    until: draft\n    on-max: ${disposition === 'parked' ? 'escalate' : 'fail'}\n    steps:\n      draft: ${draft}`
    write('.pair/adoption/tech/workflows/quick.yaml', `version: 1\nname: quick\nsteps:\n${steps}\n`)
    const options = { telemetry: true }
    await run(['quick'], { 'pair-process-implement': () => undefined }, options)
    const ledger = join(runDir(), 'telemetry.jsonl')
    expect(fs.readFileSync(ledger)).toContain('"diagnosis"')
    await fs.unlink(ledger)
    lines.length = 0
    const count = launched.length
    await run(['quick'], { 'pair-process-implement': () => undefined }, options)
    expect(launched).toHaveLength(count)
    expect(lines.join('\n')).toContain(
      `Process fault — ${disposition === 'complete' ? 'draft' : 'rounds/draft round 1'} attempt 1 (crash)`,
    )
    const rows = fs
      .readFileSync(ledger)
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(rows[0]).toMatchObject({
      type: 'step',
      host: 'pair-run',
      attempt: 1,
      diagnosis: { kind: 'crash' },
    })
    expect(rows.at(-1)).toMatchObject({
      type: 'run',
      status: disposition === 'complete' ? 'done' : disposition,
    })
  },
)

it.each(['saved origin', 'legacy origin', 'telemetry originally off', 'existing row'])(
  '#704 F18: recovers original settings for %s after project defaults change',
  async variant => {
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      'version: 1\nname: quick\nsteps:\n  draft: { kind: generic, skill: pair-process-implement, retries: 0, escalate: { blocked: continue } }\n',
    )
    const skills = { 'pair-process-implement': () => undefined }
    const ledger = join(runDir(), 'telemetry.jsonl')
    const path = join(runDir(), 'state.json')
    const read = () => JSON.parse(fs.readFileSync(ledger).split('\n')[0]!)
    expect(
      await run(['quick'], skills, {
        telemetry: variant !== 'telemetry originally off',
        engine: 'codex',
      }),
    ).toBe(0)
    if (variant !== 'telemetry originally off') {
      expect(read()).not.toHaveProperty('model')
      if (variant !== 'existing row') await fs.unlink(ledger)
    }
    if (variant === 'legacy origin') {
      const state = JSON.parse(fs.readFileSync(path))
      delete state.steps.draft.attempts[0].origin
      fs.writeFileSync(path, JSON.stringify(state))
    }
    write('pair.config.json', JSON.stringify({ run: { defaults: { model: 'later-model' } } }))
    const count = launched.length
    expect(await run(['quick'], skills, { telemetry: true, engine: 'pi' })).toBe(0)
    expect(launched).toHaveLength(count)
    expect(read().engine).toBe(variant === 'legacy origin' ? 'unknown' : 'codex')
    expect(read()).not.toHaveProperty('model')
    expect(read()).not.toHaveProperty('effort')
  },
)

it.each([
  ['opencode', undefined],
  ['pi', undefined],
  ['claude', 'high'],
  ['codex', 'high'],
] as const)(
  '#704 F19: %s records only the effort its launcher can send',
  async (engine, effort) => {
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      'version: 1\nname: quick\nsteps:\n  draft: { kind: generic, skill: pair-process-implement, retries: 0, escalate: { blocked: continue } }\n',
    )
    write(
      '.pair/adoption/tech/configurations/quick.yaml',
      `version: 1\nname: quick\ndefaults: { engine: ${engine}, effort: high }\n`,
    )
    const options = { telemetry: true, config: 'quick', approveProjectTrust: true }
    const skills = { 'pair-process-implement': () => undefined }
    const ledger = join(runDir(), 'telemetry.jsonl')
    const read = () => JSON.parse(fs.readFileSync(ledger).split('\n')[0]!)
    expect(await run(['quick'], skills, options)).toBe(0)
    const live = read()
    await fs.unlink(ledger)
    const launches = launched.length
    expect(await run(['quick'], skills, options)).toBe(0)
    expect(launched).toHaveLength(launches)
    expect([live.effort, read().effort]).toEqual([effort, effort])
  },
)

it('#704 F17: rechecks a completed run under lock before repairing its final telemetry', async () => {
  write(
    '.pair/adoption/tech/workflows/quick.yaml',
    `version: 1\nname: quick\nsteps:\n  draft: { kind: generic, skill: pair-process-implement, retries: 0, escalate: { blocked: continue } }\n`,
  )
  const options = { telemetry: true }
  const skills = { 'pair-process-implement': () => undefined }
  await run(['quick'], skills, options)
  const ledger = join(runDir(), 'telemetry.jsonl')
  await fs.unlink(ledger)
  vi.mocked(acquireRunLock).mockImplementationOnce(() => {
    const path = join(runDir(), 'state.json')
    const saved = JSON.parse(fs.readFileSync(path))
    saved.steps.draft.state = 'running'
    fs.writeFileSync(path, JSON.stringify(saved))
    return { kind: 'acquired', release }
  })
  await run(['quick'], skills, options)
  expect(fs.existsSync(ledger)).toBe(false)
})

it('#704 F17: an overlapping restart can archive state before the telemetry lock is acquired', async () => {
  const options = { telemetry: true }
  await run(['quick'], OK, options)
  const ledger = join(runDir(), 'telemetry.jsonl')
  const state = join(runDir(), 'state.json')
  const exists = fs.existsSync.bind(fs)
  let locked = false
  vi.mocked(acquireRunLock).mockImplementationOnce(() => {
    locked = true
    return { kind: 'acquired', release }
  })
  vi.spyOn(fs, 'existsSync').mockImplementation(path => {
    if (path === ledger && !locked && exists(state)) fs.rmSync(state)
    return exists(path)
  })
  await expect(run(['quick'], OK, options)).resolves.toBe(0)
})

it('#704 F17: a refused backfill preserves the delivery outcome without an incomplete summary and retries on reopen', async () => {
  write(
    '.pair/adoption/tech/workflows/quick.yaml',
    'version: 1\nname: quick\nsteps:\n  draft: { kind: generic, skill: pair-process-implement, retries: 0, escalate: { blocked: continue } }\n',
  )
  const options = { telemetry: true }
  const skills = { 'pair-process-implement': () => undefined }
  await run(['quick'], skills, options)
  const ledger = join(runDir(), 'telemetry.jsonl')
  await fs.unlink(ledger)
  const rename = fs.rename.bind(fs)
  let failed = false
  vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (!failed && to === ledger) {
      failed = true
      throw new Error('disk unavailable')
    }
    await rename(from, to)
  })
  expect(await run(['quick'], skills, options)).toBe(0)
  expect(failed).toBe(true)
  expect(fs.existsSync(ledger)).toBe(false)
  expect(lines.join('\n')).toContain('disk unavailable')
  expect(await run(['quick'], skills, options)).toBe(0)
  expect(
    fs
      .readFileSync(ledger)
      .trim()
      .split('\n')
      .map(line => JSON.parse(line)),
  ).toEqual([
    expect.objectContaining({ attempt: 1, diagnosis: expect.objectContaining({ kind: 'crash' }) }),
    expect.objectContaining({ type: 'run', status: 'done', steps: 1 }),
  ])
})

it('#704 AC-4: quick retries a killed agent and records both diagnoses', async () => {
  write(
    '.pair/adoption/tech/workflows/quick.yaml',
    QUICK.replace('    kind: implement', '    kind: implement\n    retries: 1'),
  )
  const killAgent = `const {writeSync} = require('node:fs')
    for (let i = 1; i <= 25; i++) writeSync(2, 'line ' + i + '\\n')
    process.kill(process.pid, 'SIGKILL')`
  const prompts: string[] = []
  const runIteration = async (input: SpawnIterationInput) => {
    prompts.push(input.promptText)
    return spawnIteration({
      ...input,
      cwd: tmpdir(),
      engine: { ...input.engine, command: process.execPath, headlessArgs: ['-e', killAgent, '--'] },
    })
  }

  expect(await run(['quick'], OK, { telemetry: true }, { runIteration })).toBe(0)
  expect(prompts).toEqual([prompts[0], prompts[0]])
  const state = JSON.parse(fs.readFileSync(join(runDir(), 'state.json'))) as RunStateFile
  const diagnosis = {
    kind: 'crash',
    detail: expect.stringContaining('no terminal event'),
    exitCode: null,
    signal: 'SIGKILL',
    elapsedMs: expect.any(Number),
    stderrTail: Array.from({ length: 20 }, (_, i) => `line ${i + 6}`),
  }
  expect(state.steps['implement']).toMatchObject({
    state: 'blocked',
    reason: 'fault',
    attempts: [
      { attempt: 1, ...diagnosis },
      { attempt: 2, ...diagnosis },
    ],
  })
  const telemetry = fs.readFileSync(join(runDir(), 'telemetry.jsonl')).trim().split('\n')
  const safeDiagnosis = { ...diagnosis, stderrTail: Array.from({ length: 20 }, () => '[redacted]') }
  expect(telemetry.slice(0, 2).map(line => JSON.parse(line))).toEqual([
    expect.objectContaining({ step: 'implement', attempt: 1, diagnosis: safeDiagnosis }),
    expect.objectContaining({ step: 'implement', attempt: 2, diagnosis: safeDiagnosis }),
  ])
  expect(lines).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/Process fault — implement attempt 1 .*signal=SIGKILL/),
      expect.stringMatching(/Process fault — implement attempt 2 .*signal=SIGKILL/),
      '  stderr: line 25',
      expect.stringContaining('Run: parked at step implement'),
    ]),
  )
  expect(lines).not.toContain('  stderr: line 5')
})

describe('skill and options of a step (AC-4, AC-5)', () => {
  it('runs the skill named by `skill` with the options of `with`, then asks for the result of the kind', async () => {
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      QUICK.replace(
        'kind: review',
        'kind: generic\n    skill: my-skill\n    with:\n      depth: 2',
      ),
    )
    const mine = () => fenced({ status: 'ok', summary: 'noted' })
    expect(await run(['quick'], { ...OK, 'my-skill': mine })).toBe(0)

    const prompt = launched[1]?.promptText ?? ''
    expect(prompt.split('\n').slice(0, 2)).toEqual(['/my-skill', ''])
    expect(prompt).toContain('Options:\n- depth: 2')
    expect(prompt).toContain('Inputs:\n- card: 627\n- branch: feature/US-627-x\n- pr: 12')
    expect(prompt).toContain('End your turn with one JSON object in a fenced `json` block')
  })

  it.each([
    ['a final message with no JSON result', () => 'All done, PR #12 is open.', 'invalid-result'],
    ['an agent that died or timed out', () => undefined, 'no-result'],
  ])('fails the step on %s', async (_name, skill, reason) => {
    expect(await run(['quick'], { ...OK, 'pair-process-implement': skill })).toBe(1)
    expect(
      lines.some(line => line.startsWith('  implement: failed — ') && line.includes(`(${reason}`)),
    ).toBe(true)
    expect(states()).toEqual({ implement: 'failed', review: 'pending' })
  })
})

describe('headless interactive steps (#696 AC-2)', () => {
  it.each([
    {
      scenario: 'after an ordinary step',
      before: '  implement: { kind: implement }\n',
      after: '  after: { kind: generic, skill: my-skill }\n',
      available: true,
      expectedLaunches: ['pair-process-implement'],
      expectedStates: { implement: 'ok', decision: 'needs-decision', after: 'pending' },
    },
    {
      scenario: 'without an agent executable',
      before: '',
      after: '',
      available: false,
      expectedLaunches: [],
      expectedStates: { decision: 'needs-decision' },
    },
  ])('parks $scenario and prints how to resume in a session', async test => {
    write(
      '.pair/adoption/tech/workflows/interactive-check.yaml',
      `version: 1
name: interactive-check
steps:
${test.before}  decision: { kind: generic, skill: my-skill, interactive: true }
${test.after}`,
    )
    const runId = 'session-check'
    const skills = { ...OK, 'my-skill': () => fenced({ status: 'ok', summary: 'finished' }) }
    const exit = await run(
      ['interactive-check'],
      skills,
      { runId },
      { engineAvailable: () => test.available },
    )
    const output = lines.join('\n')

    expect(exit, output).toBe(0)
    expect(launched.map(one => skillOf(one.promptText))).toEqual(test.expectedLaunches)
    expect(states(runId)).toEqual(test.expectedStates)
    expect(output).toMatch(/parked at step decision/)
    expect(output).toMatch(/resume[^\n]*pair-workflow-run[^\n]*\bsession-check\b/i)
  })
})

describe('engine session continuation (#698 AC-4)', () => {
  const priorSession = '7b673a11-e1f9-4614-ac03-37a02193cf1a'
  const handoff = 'The migration keeps the original column through the next release.'
  const first = fenced({
    status: 'ok',
    summary: 'PR opened',
    branch: 'feature/US-627-x',
    pr: 12,
    head: HEAD,
    handoff,
  })
  const state = (): RunStateFile => JSON.parse(fs.readFileSync(join(runDir(), 'state.json')))
  const resumeOf = (input: SpawnIterationInput) => {
    const args = buildEngineArgs(input)
    const index = args.indexOf('--resume')
    return index === -1 ? undefined : args[index + 1]
  }

  beforeEach(() => {
    write('.pair/adoption/tech/workflows/quick.yaml', `${QUICK}    context: resume\n`)
  })

  const resumeFailureTurns = new Map([
    ['lost session', null],
    ['lost session event', 0],
    ['execution error', 1],
  ])

  function failedResume(input: SpawnIterationInput, turns: number | null) {
    const diagnostic = `No conversation found with session ID: ${priorSession}`
    if (turns !== null) {
      input.onEvent?.({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        num_turns: turns,
        session_id: priorSession,
        errors: [diagnostic],
      })
    }
    return {
      outcome: 'failed' as const,
      detail: turns === null ? 'no terminal event' : 'error_during_execution',
      process: { exitCode: 1, signal: null, elapsedMs: 1, stderrTail: [diagnostic] },
    }
  }

  function transport(
    scenario:
      | 'available'
      | 'other engine'
      | 'unreported session'
      | 'lost session'
      | 'lost session event'
      | 'execution error',
  ) {
    return vi.fn<NonNullable<WorkflowHostDependencies['runIteration']>>(async input => {
      const turns = resumeFailureTurns.get(scenario)
      if (skillOf(input.promptText) === 'pair-process-implement') {
        if (scenario !== 'unreported session')
          input.onEvent?.({ type: 'system', subtype: 'init', session_id: priorSession })
        input.onEvent?.({ type: 'result', subtype: 'success', result: first })
      } else if (turns !== undefined && resumeOf(input) === priorSession) {
        return failedResume(input, turns)
      } else if (input.engine.id === 'codex') {
        input.onEvent?.({
          type: 'item.completed',
          item: { type: 'agent_message', text: REVIEWED },
        })
      } else {
        input.onEvent?.({ type: 'result', subtype: 'success', result: REVIEWED })
      }
      return { outcome: 'success', detail: 'terminal event: success' }
    })
  }

  function expectFallback() {
    expect(state().steps['review']).toMatchObject({
      state: 'ok',
      contextFallback: expect.stringMatching(/\S/),
    })
    expect(
      lines.filter(line => !line.includes('use context: handoff or accept the fallback')),
    ).toEqual(
      expect.arrayContaining([expect.stringMatching(/^(?=.*\breview\b)(?=.*\bhandoff\b)/i)]),
    )
  }

  it('uses the preceding Claude session, keeps structured inputs and omits the handoff', async () => {
    const runIteration = transport('available')
    expect(await run(['quick'], OK, { engine: 'claude' }, { runIteration })).toBe(0)

    const inputs = runIteration.mock.calls.map(([input]) => input)
    expect(inputs.map(resumeOf)).toEqual([undefined, priorSession])
    expect(inputs[1]?.promptText).toContain('- pr: 12')
    expect(inputs[1]?.promptText).not.toContain(handoff)
    expect(state().steps['implement']).toMatchObject({ engine: 'claude', sessionId: priorSession })
    expect(state().steps['review']).not.toHaveProperty('contextFallback')
  })

  it.each(['other engine', 'unreported session', 'lost session', 'lost session event'] as const)(
    'prints and records the handoff fallback for %s',
    async scenario => {
      const options = scenario === 'other engine' ? { config: 'quick' } : { engine: 'claude' }
      if (scenario === 'other engine') {
        write(
          '.pair/adoption/tech/configurations/quick.yaml',
          'version: 1\nname: quick\ndefaults: { engine: claude }\nsteps: { review: { engine: codex } }\n',
        )
      }
      const runIteration = transport(scenario)
      expect(await run(['quick'], OK, options, { runIteration })).toBe(0)

      const inputs = runIteration.mock.calls.map(([input]) => input).slice(1)
      const attemptedResume = scenario === 'lost session' || scenario === 'lost session event'
      expect(inputs.map(resumeOf)).toEqual(
        attemptedResume ? [priorSession, undefined] : [undefined],
      )
      if (attemptedResume) expect(inputs[0]?.promptText).not.toContain(handoff)
      expect(inputs.at(-1)?.engine.id).toBe(scenario === 'other engine' ? 'codex' : 'claude')
      expect(inputs.at(-1)?.promptText).toContain(handoff)
      expectFallback()
    },
  )

  it('preserves a resume failure after Claude has started working', async () => {
    const runIteration = transport('execution error')
    expect(await run(['quick'], OK, { engine: 'claude' }, { runIteration })).toBe(1)

    expect(runIteration.mock.calls.map(([input]) => resumeOf(input))).toEqual([
      undefined,
      priorSession,
    ])
    expect(state().steps['review']).toMatchObject({ state: 'failed' })
    expect(state().steps['review']).not.toHaveProperty('contextFallback')
  })

  it('uses the handoff when a resume step interrupted during launch is run again', async () => {
    const runIteration = transport('available')
    await expect(
      run(
        ['quick'],
        OK,
        { engine: 'claude' },
        {
          runIteration: input => {
            if (skillOf(input.promptText) === 'pair-process-review') throw new Error('interrupted')
            return runIteration(input)
          },
        },
      ),
    ).rejects.toThrow('interrupted')
    expect(states()).toEqual({ implement: 'ok', review: 'running' })

    expect(await run(['quick'], OK, { engine: 'claude' }, { runIteration })).toBe(0)
    const inputs = runIteration.mock.calls.map(([input]) => input)
    expect(inputs.map(resumeOf)).toEqual([undefined, undefined])
    expect(inputs[1]?.promptText).toContain(handoff)
    expectFallback()
  })
})

describe('resume (AC-6)', () => {
  it('resumes at a failed step and skips the ok ones', async () => {
    const answers = [fenced({ status: 'failed', summary: 'one blocking finding' }), REVIEWED]
    const skills = { ...OK, 'pair-process-review': () => answers.shift() }
    expect(await run(['quick'], skills)).toBe(1)
    expect(await run(['quick'], skills)).toBe(0)
    expect(launched.map(one => skillOf(one.promptText))).toEqual([
      'pair-process-implement',
      'pair-process-review',
      'pair-process-review',
    ])
    expect(states()).toEqual({ implement: 'ok', review: 'ok' })
  })

  it('parks on needs-decision: exit 0, what is needed and the command that resumes', async () => {
    const parked = () => fenced({ status: 'needs-decision', summary: 'pick the migration order' })
    expect(await run(['quick'], { ...OK, 'pair-process-review': parked }, { runId: 'mine' })).toBe(
      0,
    )
    expect(lines).toContain(
      '  Run: parked at step review — it needs a person: pick the migration order. Resume with: pair-cli run quick --card 627 --run-id mine',
    )
    expect(states('mine')).toEqual({ implement: 'ok', review: 'needs-decision' })
  })

  it('runs again a step an interrupted launch left running', async () => {
    const crash = () => {
      throw new Error('the process died')
    }
    await expect(run(['quick'], { ...OK, 'pair-process-implement': crash })).rejects.toThrow(
      'the process died',
    )
    expect(states()).toEqual({ implement: 'running', review: 'pending' })

    expect(await run(['quick'])).toBe(0)
    expect(states()).toEqual({ implement: 'ok', review: 'ok' })
  })

  it('leaves a complete run as it is, and starts it over with --restart', async () => {
    await run(['quick'])
    launched = []
    hostProcess.mockReset().mockResolvedValue(success())
    expect(await run(['quick'])).toBe(0)
    expect(launched).toEqual([])
    expect(lines).toContain(
      '  Run: already complete — nothing to do. Pass --restart to start over.',
    )

    expect(await run(['quick'], OK, { restart: true })).toBe(0)
    expect(launched).toHaveLength(2)
    expect(fs.existsSync(join(runDir(), 'archive'))).toBe(true)
  })
})

describe('workflow loops (#670)', () => {
  const loop = `version: 1
name: quick
steps:
  implement: { kind: implement }
  rounds:
    kind: loop
    until: review
    max: 1
    on-max: escalate
    steps:
      review: { kind: review }
      fix: { kind: fix }
`
  const findings = [{ id: 'f', severity: 'Major', title: 'gap', blocking: true, origin: 'new' }]
  const failedReview = fenced({
    status: 'failed',
    summary: 'gap',
    verdict: 'changes-requested',
    reviewedHead: HEAD,
    findings,
  })
  const fixed = fenced({
    status: 'ok',
    summary: 'fixed',
    head: HEAD,
    resolutions: [{ id: 'f', status: 'resolved', reason: 'fixed' }],
  })

  it('parks at max, requires more rounds, then finishes', async () => {
    write('.pair/adoption/tech/workflows/quick.yaml', loop)
    let reviews = 0
    const skills = {
      ...OK,
      'pair-process-review': () => (++reviews === 1 ? failedReview : REVIEWED),
      'pair-process-fix': () => fixed,
    }
    expect(await run(['quick'], skills)).toBe(0)
    expect(states()).toMatchObject({
      rounds: 'exhausted',
      'rounds/review': 'failed',
      'rounds/fix': 'ok',
    })
    launched = []
    hostProcess.mockReset().mockResolvedValue(success())
    expect(await run(['quick'], skills)).toBe(0)
    expect(launched).toHaveLength(0)
    expect(await run(['quick'], skills, { moreRounds: '1' })).toBe(0)
    expect(states()).toMatchObject({ rounds: 'ok', 'rounds/review': 'ok' })
    expect(
      JSON.parse(fs.readFileSync(join(runDir(), 'state.json'))).loops.rounds.grants[0],
    ).toMatchObject({ rounds: 1 })
  })

  it.each(['escalate', 'fail'])(
    'reports exhaustion and the last until outcome on %s (#670-exhaustion-message)',
    async action => {
      write(
        '.pair/adoption/tech/workflows/quick.yaml',
        loop.replace('on-max: escalate', `on-max: ${action}`),
      )
      await run(['quick'], {
        ...OK,
        'pair-process-review': () => failedReview,
        'pair-process-fix': () => fixed,
      })
      const output = lines.join('\n')
      expect(output).toContain('loop rounds reached 1 rounds')
      expect(output).toContain('gap')
      expect(output).toContain(action === 'escalate' ? '--more-rounds <n>' : '--restart')
    },
  )

  it('reports a later blocked step after a loop continues past exhaustion (#728 AC-6, AC-13)', async () => {
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      loop.replace('on-max: escalate', 'escalate: { exhausted: continue }') +
        `  fallback:
    kind: implement
    escalate: { blocked: stop }
  later: { kind: review }
`,
    )
    let implementations = 0
    const skills = {
      ...OK,
      'pair-process-implement': () =>
        ++implementations === 2
          ? fenced({ status: 'blocked', summary: 'registry unavailable', reason: 'expired token' })
          : IMPLEMENTED,
      'pair-process-review': () => (implementations === 1 ? failedReview : REVIEWED),
      'pair-process-fix': () => fixed,
    }
    const exit = await run(['quick'], skills)
    expect(exit, lines.join('\n')).toBe(0)
    expect(states()).toMatchObject({ rounds: 'exhausted', fallback: 'blocked', later: 'pending' })
    const ending = lines.find(line => line.startsWith('  Run: '))
    expect(ending).toContain('parked at step fallback')
    expect(ending).toContain('registry unavailable (expired token)')
    expect(ending).not.toContain('--more-rounds')

    launched = []
    expect(await run(['quick'], skills)).toBe(0)
    expect(launched.map(one => skillOf(one.promptText))).toEqual([
      'pair-process-implement',
      'pair-process-review',
    ])
    expect(states()).toMatchObject({ rounds: 'exhausted', fallback: 'ok', later: 'ok' })
  })

  it('applies a configuration max override to the loop id', async () => {
    write('.pair/adoption/tech/workflows/quick.yaml', loop)
    write(
      '.pair/adoption/tech/configurations/loop.yaml',
      'version: 1\nname: loop\ndefaults: { engine: claude }\nsteps: { rounds: { max: 1 } }\n',
    )
    let reviews = 0
    const skills = {
      ...OK,
      'pair-process-review': () => (++reviews === 1 ? failedReview : REVIEWED),
      'pair-process-fix': () => fixed,
    }
    expect(
      await run(['quick'], skills, {
        config: 'loop',
        configOverride: '{"steps":{"rounds":{"max":2}}}',
      }),
    ).toBe(0)
    const state = JSON.parse(fs.readFileSync(join(runDir(), 'state.json')))
    expect(state.loops.rounds).toMatchObject({ max: 2, round: 2 })
    expect(state.steps.rounds.state).toBe('ok')
  })
})

describe('the run directory (AC-7)', () => {
  it('holds the frozen workflow and the state, and keeps using the frozen copy when the file changes', async () => {
    const failing = () => fenced({ status: 'failed', summary: 'gate red' })
    await run(['quick'], { ...OK, 'pair-process-implement': failing })
    expect(fs.readFileSync(join(runDir(), 'workflow.yaml'))).toBe(QUICK)
    expect(fs.existsSync(join(runDir(), 'state.json'))).toBe(true)

    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      QUICK.replace('  review:\n    kind: review\n', ''),
    )
    expect(await run(['quick'])).toBe(0)
    expect(
      lines.some(
        line => line.startsWith('  Warning: ') && line.includes('changed after this run started'),
      ),
    ).toBe(true)
    expect(states()).toEqual({ implement: 'ok', review: 'ok' })
  })

  it('exits at once when another live process holds the run', async () => {
    vi.mocked(acquireRunLock).mockReturnValue({ kind: 'run-locked', pid: 42, host: 'worker' })
    expect(await run(['quick'])).toBe(1)
    expect(lines.some(line => line.startsWith('  run-locked: pid 42 on worker'))).toBe(true)
    expect(launched).toEqual([])
    expect(fs.existsSync(join(runDir(), 'state.json'))).toBe(false)
  })

  it('releases the lock when the run ends', async () => {
    await run(['quick'])
    expect(release).toHaveBeenCalled()
  })
})

describe('telemetry, switched by flag (US-697 AC-5)', () => {
  const telemetryFile = () => join(runDir(), 'telemetry.jsonl')

  it('--telemetry records every step and the closing record in the run directory', async () => {
    expect(await run(['quick'], OK, { telemetry: true })).toBe(0)
    const records = fs
      .readFileSync(telemetryFile())
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line) as unknown)
    expect(records).toMatchObject([
      { type: 'step', step: 'implement', host: 'pair-run', engine: 'claude', status: 'ok' },
      { type: 'step', step: 'review', host: 'pair-run', engine: 'claude', status: 'ok' },
      { type: 'run', run: 'quick-627', workflow: 'quick', card: '627', status: 'done', steps: 2 },
    ])
  })

  it('records the usage the engine stream reports, as measured (AC-1, AC-3)', async () => {
    // Claude's usage: fresh input is `input_tokens` plus the tokens written to the cache.
    const usage = {
      input_tokens: 100,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 1000,
      output_tokens: 10,
    }
    const runIteration: WorkflowHostDependencies['runIteration'] = async input => {
      const result = skillOf(input.promptText) === 'pair-process-review' ? REVIEWED : IMPLEMENTED
      input.onEvent?.({ type: 'result', subtype: 'success', result, usage })
      return { outcome: 'success', detail: 'terminal event: success' }
    }
    expect(await run(['quick'], OK, { telemetry: true }, { runIteration })).toBe(0)
    const [implement] = fs
      .readFileSync(telemetryFile())
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line) as { tokens: unknown })
    expect(implement?.tokens).toEqual({
      read: { value: 120, source: 'measured' },
      cached: { value: 1000, source: 'measured' },
      written: { value: 10, source: 'measured' },
    })
  })

  // The run is named after its directory, whatever the platform (darwin, linux) reports.
  it.each(['darwin', 'linux'] as const)(
    'names the run after its directory on platform %s',
    async platform => {
      const real = Object.getOwnPropertyDescriptor(process, 'platform') as PropertyDescriptor
      Object.defineProperty(process, 'platform', { ...real, value: platform })
      try {
        expect(await run(['quick'], OK, { telemetry: true, runId: 'second' })).toBe(0)
      } finally {
        Object.defineProperty(process, 'platform', real)
      }
      const [first] = fs.readFileSync(join(runDir('second'), 'telemetry.jsonl')).split('\n')
      expect(JSON.parse(first as string)).toMatchObject({ run: 'second', card: '627' })
    },
  )

  it.each([
    ['no flag', {}],
    ['--no-telemetry', { telemetry: false }],
  ])('writes no file with %s', async (_name, options) => {
    expect(await run(['quick'], OK, options)).toBe(0)
    expect(states()).toEqual({ implement: 'ok', review: 'ok' })
    expect(fs.existsSync(telemetryFile())).toBe(false)
  })

  it('goes on when the file cannot be written, and says so once', async () => {
    fs.mkdirSync(telemetryFile(), { recursive: true })
    expect(await run(['quick'], OK, { telemetry: true })).toBe(0)
    expect(states()).toEqual({ implement: 'ok', review: 'ok' })
    expect(lines.filter(line => line.includes('telemetry was not written'))).toHaveLength(1)
  })

  it('#728 AC-3 F8: migrates a completed closed card only when its run lock is available', async () => {
    const parked = () => fenced({ status: 'needs-decision', summary: 'waiting for a decision' })
    await run(['quick'], { ...OK, 'pair-process-review': parked }, { telemetry: true })
    await run(['quick'], OK, { telemetry: true })
    const file = telemetryFile()
    const current = fs.readFileSync(file)
    const legacy = current.replace('"status":"needs-decision"', '"status":"needs-human"')
    expect(legacy).not.toBe(current)
    fs.writeFileSync(file, legacy)
    const stateFile = join(runDir(), 'state.json')
    const state = fs.readFileSync(stateFile)
    const readCard = vi.fn(async () => 'closed' as const)
    launched.length = 0

    vi.mocked(acquireRunLock).mockReturnValueOnce({ kind: 'run-locked' })
    expect(await run(['quick'], OK, {}, { readCard })).toBe(0)
    expect(fs.readFileSync(file)).toBe(legacy)

    release.mockClear()
    vi.mocked(acquireRunLock).mockClear()
    const rename = vi.spyOn(fs, 'rename')
    expect(await run(['quick'], OK, {}, { readCard })).toBe(0)
    expect(rename).toHaveBeenCalledExactlyOnceWith(`${file}.tmp`, file)
    expect(vi.mocked(acquireRunLock)).toHaveBeenCalledExactlyOnceWith(runDir())
    expect(vi.mocked(acquireRunLock)).toHaveBeenCalledBefore(rename)
    expect(rename).toHaveBeenCalledBefore(release)
    expect(fs.readFileSync(file)).toBe(current)
    expect(fs.readFileSync(stateFile)).toBe(state)
    expect(readCard).not.toHaveBeenCalled()
    expect(launched).toHaveLength(0)
  })

  it('#728 AC-3 F3: resumes with unwritable legacy telemetry and warns once', async () => {
    const parked = () => fenced({ status: 'needs-decision', summary: 'waiting for a decision' })
    const options = { telemetry: true }
    expect(await run(['quick'], { ...OK, 'pair-process-review': parked }, options)).toBe(0)
    const file = telemetryFile()
    const current = fs.readFileSync(file)
    const legacy = current.replace('"status":"needs-decision"', '"status":"needs-human"')
    fs.writeFileSync(file, legacy)
    const writeFile = fs.writeFile.bind(fs)
    const deny = vi.spyOn(fs, 'writeFile').mockImplementation(async (path, content) => {
      if (path === `${file}.tmp`) throw new Error('EACCES: telemetry replacement')
      await writeFile(path, content)
    })

    expect(await run(['quick'], OK, options)).toBe(0)
    expect(states()).toEqual({ implement: 'ok', review: 'ok' })
    expect(lines.filter(line => line.includes('EACCES: telemetry replacement'))).toHaveLength(1)
    expect(fs.readFileSync(file)).toBe(legacy)

    deny.mockRestore()
    expect(await run(['quick'], OK, options, { readCard: async () => 'closed' })).toBe(0)
    expect(fs.readFileSync(file)).toBe(current)
  })

  it('#728 AC-3 F5: preserves state and telemetry modes under umask 077', async () => {
    const dir = disk.mkdtempSync(join(tmpdir(), 'pair-legacy-run-'))
    const text = `version: 1
name: quick
steps:
  implement: { kind: implement }
  rounds:
    kind: loop
    until: review
    max: 2
    on-max: escalate
    steps:
      review: { kind: review }
      fix: { kind: fix }
`
    const statePath = join(dir, 'state.json')
    const telemetryPath = join(dir, 'telemetry.jsonl')
    const state = {
      schemaVersion: 1,
      workflow: { name: 'quick', hash: hashOf(text) },
      card: '627',
      steps: { implement: { state: 'ok' }, rounds: { state: 'needs-human' } },
      loops: { rounds: { round: 2, max: 2, exhausted: true } },
    }
    const telemetry = { schema: 2, type: 'step', step: 'review', status: 'needs-human' }
    const previousUmask = process.umask(0o077)
    try {
      disk.writeFileSync(join(dir, 'workflow.yaml'), text)
      disk.writeFileSync(statePath, JSON.stringify(state))
      disk.writeFileSync(telemetryPath, `${JSON.stringify(telemetry)}\n`)
      for (const path of [statePath, telemetryPath]) disk.chmodSync(path, 0o640)

      const started = await start(
        { dir, files: disk },
        { text, file: 'quick.yaml' },
        { card: '627' },
      )
      expect(started).toEqual({ status: 'parked', warnings: [] })
      expect(JSON.parse(disk.readFileSync(statePath))).toMatchObject({
        steps: { rounds: { state: 'needs-decision' } },
      })
      expect(JSON.parse(disk.readFileSync(telemetryPath))).toEqual({
        ...telemetry,
        status: 'needs-decision',
      })
      expect([statePath, telemetryPath].map(path => disk.statSync(path).mode & 0o777)).toEqual([
        0o640, 0o640,
      ])
    } finally {
      process.umask(previousUmask)
      disk.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('refusals before any launch (design §8)', () => {
  it.each([
    ['a card the tracker does not have', 'missing', 'card-not-found: card 627'],
    ['a closed card', 'closed', 'card-closed: card 627 is closed'],
  ] as const)('refuses %s', async (_name, card, message) => {
    await expect(run(['quick'], OK, {}, { readCard: async () => card })).rejects.toThrow(message)
    expect(launched).toEqual([])
    expect(fs.existsSync(runDir())).toBe(false)
  })

  it('refuses when the engine is not installed', async () => {
    await expect(run(['quick'], OK, {}, { engineAvailable: () => false })).rejects.toThrow(
      "Engine 'claude' is not installed or not on PATH",
    )
    expect(launched).toEqual([])
  })

  it('refuses a workflow that is neither a file nor a known name', async () => {
    await expect(run(['nowhere'])).rejects.toThrow(
      "workflow-not-found: 'nowhere' is neither a workflow file nor a workflow name",
    )
  })
})

describe('workflow resolution (design §7)', () => {
  it('takes the argument as a path when it is an existing file', async () => {
    write('flows/quick.yaml', QUICK.replace('  review:\n    kind: review\n', ''))
    expect(await run(['flows/quick.yaml'])).toBe(0)
    expect(launched).toHaveLength(1)
    expect(states()).toEqual({ implement: 'ok' })
  })

  it('falls back to the portable Quick when there is no adopted copy', async () => {
    fs.rmSync(join(project, '.pair/adoption/tech/workflows'), { recursive: true, force: true })
    expect(await run(['quick'], OK, { dryRun: true })).toBe(0)
    expect(lines.some(line => line.includes('/workflow-examples/quick.yaml'))).toBe(true)
    expect(lines.join('\n')).not.toContain('target:pr')
  })
})

describe('quick: implement, review, fix (#708 AC-8)', () => {
  const FIXED = fenced({ status: 'ok', summary: 'fixed', head: HEAD, resolutions: [] })
  const CHANGES = fenced({
    status: 'failed',
    summary: '1 blocking',
    reason: 'blocking-findings',
    verdict: 'changes-requested',
    reviewedHead: HEAD,
    findings: [{ id: 'F1', severity: 'Major', title: 't', blocking: true, origin: 'new' }],
  })
  const quick = () =>
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      `${QUICK.replace('kind: review', 'kind: review\n    on-failed: continue')}  fix:\n    kind: fix\n`,
    )

  it.each([
    ['approves', REVIEWED],
    ['finds a blocking finding', CHANGES],
  ])('runs the three steps in order when the review %s', async (_name, review) => {
    quick()
    const skills = { ...OK, 'pair-process-review': () => review, 'pair-process-fix': () => FIXED }
    expect(await run(['quick'], skills)).toBe(0)
    expect(launched.map(one => skillOf(one.promptText))).toEqual([
      'pair-process-implement',
      'pair-process-review',
      'pair-process-fix',
    ])
  })
})

it.each(['top-level', 'loop'] as const)(
  'answers the stopped %s approval after continuing an earlier one (R747-04)',
  async placement => {
    const prefix = `version: 1
name: approvals
steps:
  advisory: { kind: approval, escalate: { needs-decision: { do: continue, comment: Advisory } } }
`
    const blocking =
      placement === 'loop'
        ? `  round:
    kind: loop
    until: required
    max: 1
    on-max: fail
    steps:
      required: { kind: approval }
`
        : '  required: { kind: approval }\n'
    const file = '.pair/adoption/tech/workflows/approvals.yaml'
    write(file, prefix + blocking)
    write('.claude/skills/pair-workflow-cycle/SKILL.md', '# Cycle')
    write('.claude/skills/pair-workflow-cycle/scripts/workflow-facts.mjs', '')
    const answer = vi.fn((data: Record<string, unknown>) =>
      data['flag'] ? [{ ...(data['flag'] as object), login: 'maintainer', channel: 'flag' }] : [],
    )
    hostProcess.mockImplementation(async (_bin, args) => {
      const [, action, , raw] = args
      if (action === 'approval-target') return success(JSON.stringify({ pr: 12, head: HEAD }))
      if (action === 'approval-answers')
        return success(JSON.stringify(answer(JSON.parse(raw ?? '{}'))))
      return success('{}')
    })
    const required = placement === 'loop' ? 'round/required' : 'required'
    const id = 'approvals-627'
    expect(await run(['approvals'])).toBe(0)
    expect(states(id)).toMatchObject({ advisory: 'needs-decision', [required]: 'needs-decision' })

    // Resuming uses the frozen policy from the first invocation.
    write(file, prefix.replace(/advisory: .*/, 'advisory: { kind: approval }') + blocking)
    expect(await run(['approvals'], OK, { approve: '627' }), lines.join('\n')).toBe(0)
    expect(states(id)).toMatchObject({ advisory: 'needs-decision', [required]: 'ok' })
    expect(answer).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        flag: expect.objectContaining({ verdict: 'approved' }),
      }),
    )
  },
)

it.each([
  'unchanged',
  'moved',
  'returned',
  'gate',
  'parked',
  'answer-race',
  'dirty',
  'divergent',
  'fix',
  'no-route',
] as const)(
  'replays only a changed review boundary (%s, 726-ac4-head-move-resume)',
  async scenario => {
    const moved = scenario !== 'unchanged'
    const newHead = scenario === 'returned' ? HEAD : 'b'.repeat(40)
    const fixedHead = 'c'.repeat(40)
    let currentHead = HEAD
    let localHead = HEAD
    let obstacle: string | undefined
    let moveAt = scenario === 'gate' ? 'head' : undefined
    let notices = 0
    let gates = 0
    const delivery = '.pair/adoption/tech/workflows/delivery.yaml'
    const definition = deliveryDefinition as string
    write(
      delivery,
      scenario === 'no-route' ? definition.replace(/^ {4}on-resume:.*\n/gm, '') : definition,
    )
    write(
      '.pair/adoption/tech/way-of-working.md',
      `### Custom Gate Registry

| Order | Key | Gate | Command | Scope Key | Target | Required | Description |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | adopted | PR gate | \`check-pr\` | quality | pr | Yes | Project gate |
`,
    )
    write('.claude/skills/pair-workflow-cycle/SKILL.md', '# Fixture host bridge\n')
    write('.claude/skills/pair-workflow-cycle/scripts/workflow-facts.mjs', '')
    const moveFailure = { status: 'failed', reason: 'head-moved', summary: 'PR head moved' }
    const respond = (action: string | undefined, data: { flag?: object; head?: string }) => {
      switch (action) {
        case 'ci':
          return 'green'
        case 'head':
          return currentHead
        case 'approval-target':
          return { pr: 12, head: currentHead }
        case 'approval-notice':
          notices++
          return {}
        case 'approval-answers':
          return data.flag ? [{ ...data.flag, login: 'maintainer', channel: 'flag' }] : []
        case 'merge':
          if (data.head !== currentHead) return moveFailure
          expect(data).toMatchObject({ head: currentHead, approvedBy: 'maintainer', pr: 12 })
          return { status: 'ok', summary: 'Merged and closed', merged: true, mergeCommit: HEAD }
        default:
          throw new Error('Unknown action ' + action)
      }
    }
    const git = (args: readonly string[]) => {
      if (args[0] === 'status') return success(obstacle === 'dirty' ? '?? local-work' : '')
      if (args[0] === 'rev-parse')
        return success(args.includes('FETCH_HEAD') ? currentHead : localHead)
      if (args[0] === 'symbolic-ref') return success('refs/heads/feature/US-627-x')
      if (args[0] === 'merge-base')
        return { ...success(), status: obstacle === 'divergent' ? 1 : 0 }
      if (args[0] === 'merge') {
        expect(args).toEqual(['merge', '--ff-only', currentHead])
        expect(obstacle).toBeUndefined()
        localHead = currentHead
      }
      return success()
    }
    hostProcess.mockImplementation(async (bin, args, cwd) => {
      if (bin === 'sh') {
        expect(args).toEqual(['-c', 'check-pr'])
        expect(cwd).toBe(join(project, 'worktrees/627'))
        gates++
        return success()
      }
      if (bin === 'git') return git(args)
      expect(bin).toBe(process.execPath)
      const [, action, card, raw] = args
      expect(card).toBe('627')
      if (action === moveAt) {
        currentHead = newHead
        moveAt = undefined
        if (action === 'merge') return success(JSON.stringify(moveFailure))
        if (action === 'approval-answers') return success(JSON.stringify({ reason: 'head-moved' }))
      }
      return success(JSON.stringify(respond(action, JSON.parse(raw ?? '{}'))))
    })

    const runUntilHeadChanges = async () => {
      expect(await run(['delivery'])).toBe(scenario === 'gate' ? 1 : 0)
      if (scenario === 'gate') {
        expect(states('delivery-627')).toMatchObject({ gate: 'failed', approval: 'pending' })
        expect(notices).toBe(0)
      } else {
        expect(gates).toBe(1)
        expect(states('delivery-627')).toMatchObject({
          gate: 'ok',
          approval: 'needs-decision',
          merge: 'pending',
        })
        expect(await run(['delivery'])).toBe(0)
        expect(notices).toBe(1)
        if (moved) {
          moveAt =
            new Map([
              ['parked', 'approval-target'],
              ['answer-race', 'approval-answers'],
            ]).get(scenario) ?? 'merge'
          expect(await run(['delivery'], OK, { approve: '627' })).toBe(1)
          expect(notices).toBe(1)
          if (scenario === 'dirty' || scenario === 'divergent') obstacle = scenario
        }
      }
    }
    await runUntilHeadChanges()
    if (scenario === 'no-route') {
      expect(await run(['delivery'])).toBe(1)
      expect(launched.map(one => skillOf(one.promptText))).toEqual([
        'pair-process-implement',
        'pair-process-review',
      ])
      return
    }
    const replayReview = async () => {
      const reviewInputs: string[] = []
      const fixInputs: string[] = []
      const recheck = {
        ...OK,
        'pair-process-review': (input: SpawnIterationInput) => {
          reviewInputs.push(input.promptText)
          return scenario === 'fix' && currentHead === newHead
            ? fenced({
                status: 'failed',
                summary: 'Replacement needs a fix',
                reason: 'blocking-findings',
                verdict: 'changes-requested',
                reviewedHead: newHead,
                reportPath: `.pair/working/reviews/12/${newHead}.md`,
                findings: [
                  {
                    id: 'F1',
                    severity: 'Major',
                    title: 'Regression',
                    blocking: true,
                    origin: 'new',
                  },
                ],
              })
            : REVIEWED.replaceAll(HEAD, currentHead)
        },
        'pair-process-fix': (input: SpawnIterationInput) => {
          fixInputs.push(input.promptText)
          localHead = fixedHead
          currentHead = fixedHead
          return fenced({ status: 'ok', summary: 'Fixed', head: fixedHead, resolutions: [] })
        },
      }
      if (obstacle !== undefined) {
        await expect(run(['delivery'], recheck)).rejects.toThrow('replay-worktree')
        expect(reviewInputs).toHaveLength(0)
        expect(localHead).toBe(HEAD)
        obstacle = undefined
      }
      expect(await run(['delivery'], recheck), lines.join('\n')).toBe(0)
      expect(reviewInputs).toHaveLength(scenario === 'fix' ? 2 : 1)
      expect(reviewInputs[0]).toContain(newHead)
      if (scenario === 'fix') {
        expect(fixInputs).toHaveLength(1)
        expect(fixInputs[0]).toContain(`- head: ${newHead}`)
        expect(fixInputs[0]).toContain('F1')
        expect(fixInputs[0]).toContain(`.pair/working/reviews/12/${newHead}.md`)
        expect(reviewInputs[1]).toContain(fixedHead)
      }
      expect(states('delivery-627')).toMatchObject({
        gate: 'ok',
        approval: 'needs-decision',
        merge: 'pending',
      })
      expect(notices).toBe(scenario === 'gate' ? 1 : 2)
    }
    if (moved) await replayReview()
    expect(await run(['delivery'], OK, { approve: '627' })).toBe(0)
    expect(states('delivery-627')).toMatchObject({ gate: 'ok', approval: 'ok', merge: 'ok' })
    for (const review of launched.filter(one => skillOf(one.promptText) === 'pair-process-review'))
      expect(review.promptText).toContain('- publication: first-and-approved')
    expect(launched.map(one => skillOf(one.promptText))).toEqual([
      'pair-process-implement',
      'pair-process-review',
      ...(moved ? ['pair-process-review'] : []),
      ...(scenario === 'fix' ? ['pair-process-fix', 'pair-process-review'] : []),
    ])
  },
)

it.each([true, false])(
  'resumes only unfinished closure on its already-merged PR (matching=%s, #726 AC-4)',
  async matches => {
    const file = '.pair/adoption/tech/workflows/closure.yaml'
    const text = `version: 1
name: closure
steps:
  implement: { kind: implement, retries: 1 }
  late: { kind: generic, skill: my-skill, when: { status: [Done] } }
  review: { kind: review }
  gate: { kind: gate, with: { checks: [head-unchanged] } }
  approval: { kind: approval }
  merge: { kind: merge, when: { status: [Review] } }
`
    write(file, text)
    write('.claude/skills/pair-workflow-cycle/SKILL.md', '# Cycle')
    write('.claude/skills/pair-workflow-cycle/scripts/workflow-facts.mjs', '')
    const dir = runDir('closure-627')
    await start({ files: fs, dir }, { file, text }, { card: '627' })
    const path = join(dir, 'state.json')
    const state = JSON.parse(fs.readFileSync(path))
    state.steps = {
      implement: {
        state: 'ok',
        executions: 2,
        attempts: [
          {
            attempt: 1,
            kind: 'crash',
            detail: 'Connection refused',
            elapsedMs: 12,
            exitCode: 1,
            signal: null,
            stderrTail: [],
            origin: { host: 'pair-run', engine: 'codex' },
          },
        ],
        outputs: { pr: 12, head: HEAD },
      },
      late: { state: 'skipped' },
      review: { state: 'ok', outputs: { reviewedHead: HEAD } },
      gate: { state: 'ok', outputs: { gatedHead: HEAD } },
      approval: {
        state: 'ok',
        outputs: { approvedPr: 12, approvedHead: HEAD, approvedBy: 'maintainer' },
      },
      merge: {
        state: 'failed',
        reason: 'cascade-incomplete',
        outputs: { merged: true, mergeCommit: HEAD },
      },
    }
    fs.writeFileSync(path, JSON.stringify(state))
    const actions: string[] = []
    hostProcess.mockImplementation(async (_, args) => {
      const [, action, , raw] = args
      actions.push(String(action))
      const data = JSON.parse(raw ?? '{}')
      if (action === 'merge-resume')
        return success(
          JSON.stringify(matches && (raw === undefined || (data.pr === 12 && data.head === HEAD))),
        )
      expect(action).toBe('merge')
      expect(data).toMatchObject({ pr: 12, head: HEAD, closureOnly: true })
      return success(
        JSON.stringify({ status: 'ok', summary: 'Closed', merged: true, mergeCommit: HEAD }),
      )
    })
    const resumed = run(['closure'], {}, { telemetry: true }, { readCard: async () => 'closed' })
    if (matches) {
      expect(await resumed).toBe(0)
      expect(states('closure-627')).toMatchObject({ late: 'skipped', merge: 'ok' })
      expect(actions.filter(action => action === 'merge')).toHaveLength(1)
      expect(lines.join('\n')).toContain('Process fault — implement attempt 1 (crash)')
      expect(fs.readFileSync(join(dir, 'telemetry.jsonl'))).toContain('"diagnosis"')
    } else {
      await expect(resumed).rejects.toThrow('card-closed')
      expect(actions).not.toContain('merge')
    }
    expect(launched).toEqual([])
  },
)
