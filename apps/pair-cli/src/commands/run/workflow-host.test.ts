import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { basename, join } from 'path'
import { start } from '@pair/workflows'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
// @ts-expect-error Vite loads the adopted definition as fixture text.
import deliveryDefinition from '../../../../../.pair/adoption/tech/workflows/delivery.yaml?raw'
// @ts-expect-error Vite loads the shipped definition as fixture text.
import quickDefinition from '../../../../../packages/knowledge-hub/dataset/.pair/adoption/tech/workflows/quick.yaml?raw'
import baseConfig from '../../../config.json'
import { acquireRunLock } from './run-lock'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import type { SpawnIterationInput } from './spawn'
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

describe('card state (AC-13)', () => {
  const MAPPING = `## State Mapping

| Board State | Macrostate |
| --- | --- |
| Inbox | Draft |
| Planned | Ready |
| Building | In Progress |
| Checking | Review |
| Finished | Done |
`
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

    it('leaves implement dispatch unchanged when the workflow omits assign', async () => {
      write('.pair/adoption/tech/workflows/quick.yaml', implementOnly())
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

      expect(actions).toEqual([])
      expect(launched[0]?.promptText).not.toContain('- assignee:')
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
  })
})

describe('#723 T-7 held cards in a batch (AC-4)', () => {
  it.each([
    { source: 'host assignment', hostManaged: true, routing: '' },
    { source: 'implement skill', hostManaged: false, routing: '' },
    {
      source: 'implement skill with on-failed: continue',
      hostManaged: false,
      routing: ', on-failed: continue',
    },
  ])(
    'skips for $source, runs independent work, and retries after release',
    async ({ hostManaged, routing }) => {
      const definition = `version: 1
name: quick
${hostManaged ? 'assign: me\n' : ''}steps:
  implement: { kind: implement${routing} }
  finish: { kind: generic, skill: my-skill }
`
      write('.pair/adoption/tech/workflows/quick.yaml', definition)
      write('.claude/skills/pair-workflow-cycle/SKILL.md', '# Host bridge fixture')

      let held = true
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
        board: { getState: async () => null, setState: async () => {} },
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
        'pair-process-implement': ({ cwd }: SpawnIterationInput) =>
          !hostManaged && held && cwd === join(project, 'worktrees', '627')
            ? fenced({ status: 'failed', reason: 'card-held', summary: 'Card held by alice' })
            : IMPLEMENTED,
      }
      const batch = () => run(['quick'], skills, { card: '627,628,629' }, workflow)
      const launches = () =>
        launched.map(({ cwd, promptText }) => `${basename(cwd)}:${skillOf(promptText)}`)
      const summary = (id: string) => lines.find(line => line.trimStart().startsWith(`#${id}:`))

      expect.soft(await batch()).toBe(0)
      expect
        .soft(launches())
        .toEqual([
          ...(hostManaged ? [] : ['627:pair-process-implement']),
          '628:pair-process-implement',
          '628:my-skill',
        ])
      expect.soft(assignmentChecks).toEqual(hostManaged ? ['627', '628', '628'] : [])
      expect.soft(summary('627')).toMatch(/#627: skipped.*alice.*card-held/)
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

  it('--dry-run refuses an invalid workflow', async () => {
    write('.pair/adoption/tech/workflows/quick.yaml', QUICK.replace('version: 1', 'version: 2'))
    expect(await run(['quick'], OK, { dryRun: true })).toBe(1)
    expect(
      lines.some(line => line.includes('quick.yaml:1: version: unknown value 2 — fix: use 1')),
    ).toBe(true)
  })
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

  it('parks on needs-human: exit 0, what is needed and the command that resumes', async () => {
    const parked = () => fenced({ status: 'needs-human', summary: 'pick the migration order' })
    expect(await run(['quick'], { ...OK, 'pair-process-review': parked }, { runId: 'mine' })).toBe(
      0,
    )
    expect(lines).toContain(
      '  Run: parked at step review — it needs a person: pick the migration order. Resume with: pair-cli run quick --card 627 --run-id mine',
    )
    expect(states('mine')).toEqual({ implement: 'ok', review: 'needs-human' })
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
  const findings = [{ id: 'f', severity: 'Major', title: 'gap', blocking: true }]
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
      rounds: 'needs-human',
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

  it('falls back to the knowledge-base default of that name', async () => {
    fs.rmSync(join(project, '.pair/adoption/tech/workflows'), { recursive: true, force: true })
    expect(await run(['quick'], OK, { dryRun: true })).toBe(0)
    expect(
      lines.some(line => line.includes('dataset/.pair/adoption/tech/workflows/quick.yaml')),
    ).toBe(true)
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
    findings: [{ id: 'F1', severity: 'Major', title: 't', blocking: true }],
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
          approval: 'needs-human',
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
                findings: [{ id: 'F1', severity: 'Major', title: 'Regression', blocking: true }],
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
        approval: 'needs-human',
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
  implement: { kind: implement }
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
      implement: { state: 'ok', outputs: { pr: 12, head: HEAD } },
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
    const resumed = run(['closure'], {}, {}, { readCard: async () => 'closed' })
    if (matches) {
      expect(await resumed).toBe(0)
      expect(states('closure-627')).toMatchObject({ late: 'skipped', merge: 'ok' })
      expect(actions.filter(action => action === 'merge')).toHaveLength(1)
    } else {
      await expect(resumed).rejects.toThrow('card-closed')
      expect(actions).not.toContain('merge')
    }
    expect(launched).toEqual([])
  },
)
