import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hostname, tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService as fs } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import type { SpawnIterationInput } from './spawn'
import type { WorkflowHostDependencies } from './workflow-host'

/**
 * US-652 — `pair run <workflow> --card <id>`, through the command's own entry point, with a fake
 * launcher and fake skills: no real agent, tracker or git. The disk is real (a temp project).
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
    fs.mkdirSync(runDir(), { recursive: true })
    fs.writeFileSync(
      join(runDir(), 'run.lock'),
      JSON.stringify({ pid: process.pid, host: hostname(), startedAt: new Date().toISOString() }),
    )
    expect(await run(['quick'])).toBe(1)
    expect(
      lines.some(line =>
        line.startsWith(`  run-locked: pid ${String(process.pid)} on ${hostname()}`),
      ),
    ).toBe(true)
    expect(launched).toEqual([])
    expect(fs.existsSync(join(runDir(), 'state.json'))).toBe(false)
  })

  it('releases the lock when the run ends', async () => {
    await run(['quick'])
    expect(fs.existsSync(join(runDir(), 'run.lock'))).toBe(false)
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
