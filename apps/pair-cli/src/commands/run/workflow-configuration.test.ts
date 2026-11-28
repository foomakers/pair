import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'child_process'
import { hostname, tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService as fs } from '@pair/content-ops'
import { runCli } from '../../cli'
import { commandRegistry } from '..'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import { isSafePromptText } from './prompt-safety'
import { assignmentFor, parseConfiguration, validate } from '@pair/workflows'
import type { SpawnIterationInput } from './spawn'
import type { WorkflowHostDependencies } from './workflow-host'
import type { acquireRunLock } from './run-lock'
import * as hostProcess from './host-process'

/**
 * US-672 — configuration per step through `pair run <workflow>`; same harness as US-652.
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
aliases:
  build: { effort: medium }
  judge: { effort: high }
steps:
  implement:
    kind: implement
    alias: build
    gates: [quality-gate]
  review:
    kind: review
    alias: judge
`
const REGISTRY = `### Custom Gate Registry

| Order | Key | Gate | Command |
| --- | --- | --- | --- |
| 1 | quality-gate | Quality Gate | \`true\` |
`

/** A fake skill answers with the agent's final message, `undefined` when the agent dies, or throws on a crash. */
type FakeSkill = () => string | undefined
type Launched = Pick<SpawnIterationInput, 'promptText' | 'cwd' | 'model' | 'effort'>

let project: string
let lines: string[]
let launched: Launched[]

const write = (path: string, content: string) => {
  fs.mkdirSync(join(project, path, '..'), { recursive: true })
  fs.writeFileSync(join(project, path), content)
}
const runDir = (id = 'quick-627') => join(project, '.pair/working/runs', id)

async function sessionRunLock(): Promise<typeof acquireRunLock> {
  const entry = '@pair/workflows/cli'
  const adapter = (await import(entry)) as { acquireRunLock: typeof acquireRunLock }
  return adapter.acquireRunLock
}

/** The skill a prompt invokes: `/<skill>` on a slash engine, `Run the <skill> skill.` on an instruction one. */
const skillOf = (prompt: string) => /^(?:\/|Run the )(\S+)/.exec(prompt)?.[1] ?? ''

function deps(skills: Record<string, FakeSkill>, over: Partial<WorkflowHostDependencies> = {}) {
  const workflow: WorkflowHostDependencies = {
    runIteration: async input => {
      launched.push({
        promptText: input.promptText,
        cwd: input.cwd,
        model: input.model,
        effort: input.effort,
      })
      const text = (skills[skillOf(input.promptText)] as FakeSkill)()
      if (text !== undefined)
        input.onEvent?.(
          input.engine.id === 'codex'
            ? { type: 'item.completed', item: { type: 'agent_message', text } }
            : { type: 'result', subtype: 'success', result: text },
        )
      return text === undefined
        ? { outcome: 'failed', detail: 'timed out (idle): no engine event for 1800s' }
        : { outcome: 'success', detail: 'terminal event: success' }
    },
    readCard: async () => ({ title: 'A card' }),
    readResultFacts: async () => ({ head: HEAD }),
    prepareWorktree: async ({ main, card }) => {
      const dir = join(main, 'worktrees', card)
      fs.mkdirSync(dir, { recursive: true })
      for (const directory of ['.claude', '.agents']) {
        const source = join(main, directory)
        if (fs.existsSync(source)) fs.cpSync(source, join(dir, directory), { recursive: true })
      }
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

const CONFIG = `version: 1
name: mine
defaults: { engine: claude, model: claude-sonnet-5-5, effort: medium }
aliases:
  judge: { model: claude-opus-5-5, effort: high }
`
const writeConfig = (name = 'mine', text = CONFIG) =>
  write(
    `.pair/adoption/tech/configurations/${name}.yaml`,
    text.replace('name: mine', `name: ${name}`),
  )
const argsOf = (index: number) => launched[index]?.model ?? ''

describe('settings per step, printed with their source (AC-1)', () => {
  it('launches each step with its resolved model and prints each value with its source', async () => {
    writeConfig()
    expect(await run(['quick'], OK, { config: 'mine' }, {})).toBe(0)
    expect(launched.map(one => one.model)).toEqual(['claude-sonnet-5-5', 'claude-opus-5-5'])
    expect(launched.map(one => one.effort)).toEqual(['medium', 'high'])
    expect(lines).toContain(
      '    review: engine=claude (defaults) model=claude-opus-5-5 (alias) effort=high (alias)',
    )
  })

  it('with no configuration says none applies and keeps the engine default', async () => {
    expect(await run(['quick'])).toBe(0)
    expect(lines).toContain('  Configuration: none applies — engine claude, its default model')
    expect(argsOf(0)).toBe('')
  })
})

describe('workflow hosts (#696 AC-4/AC-5)', () => {
  it('pair run respects a live lock held through the session entry', async () => {
    fs.mkdirSync(runDir(), { recursive: true })
    const acquire = await sessionRunLock()
    const lock = acquire(runDir())
    expect(lock.kind).toBe('acquired')
    if (lock.kind !== 'acquired') throw new Error('session could not acquire an empty lock')
    try {
      const lockFile = join(runDir(), 'run.lock')
      const before = fs.readFileSync(lockFile)
      expect(await run(['quick'])).toBe(1)
      expect(lines).toContain(
        `  run-locked: pid ${process.pid} on ${hostname()} is driving ${runDir()}; nothing was launched.`,
      )
      expect(launched).toHaveLength(0)
      expect(fs.readFileSync(lockFile)).toBe(before)
    } finally {
      lock.release()
    }
  })

  it('the session entry takes over an orphan lock in the CLI format', async () => {
    const { pid } = spawnSync(process.execPath, ['-e', '0'])
    const lockFile = join(runDir(), 'run.lock')
    fs.mkdirSync(runDir(), { recursive: true })
    fs.writeFileSync(lockFile, JSON.stringify({ pid, host: hostname(), startedAt: new Date(0) }))

    const acquire = await sessionRunLock()
    const lock = acquire(runDir())
    expect(lock).toMatchObject({ kind: 'acquired', takenOver: { pid, host: hostname() } })
    expect(JSON.parse(fs.readFileSync(lockFile))).toMatchObject({ pid: process.pid })
    if (lock.kind === 'acquired') lock.release()
  })

  it('records the host and launched model in state with telemetry off', async () => {
    writeConfig()
    expect(await run(['quick'], OK, { config: 'mine', telemetry: false })).toBe(0)
    expect(fs.existsSync(join(runDir(), 'telemetry.jsonl'))).toBe(false)
    expect(JSON.parse(fs.readFileSync(join(runDir(), 'state.json')))).toMatchObject({
      steps: {
        implement: { host: 'pair-run', model: 'claude-sonnet-5-5' },
        review: { host: 'pair-run', model: 'claude-opus-5-5' },
      },
    })
  })
})

it.each(['darwin', 'linux'] as const)(
  'dry run previews resolved steps on platform %s (darwin, linux; US-677 AC-6)',
  async platform => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { ...original, value: platform })
    try {
      write(
        '.pair/adoption/tech/workflows/quick.yaml',
        `version: 1
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
  approve:
    kind: approval
    when: { has: [risk:red] }
    with: { question: Ship it? }
`,
      )
      writeConfig(
        'mine',
        'version: 1\nname: mine\ndefaults: { engine: codex, model: gpt-5, effort: high }\n',
      )
      expect(await run(['quick'], OK, { config: 'mine', dryRun: true })).toBe(0)
      const output = lines.join('\n')
      expect(output).toContain('rounds: loop host on-max=escalate (human escalation)')
      expect(output).toContain('approve: approval host')
      expect(output.split('\n').find(line => line.includes('approve: approval'))).not.toContain(
        'engine=',
      )
      expect(output).toContain('rounds/review')
      expect(output).toContain('pair-process-review')
      expect(output).toContain('engine=codex')
      expect(output).toContain('model=gpt-5')
      expect(output).toContain('risk:red')
      expect(output).toContain('Ship it?')
      expect(launched).toEqual([])
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  },
)

it.each([
  ['on-max: fail', 'on-max=fail (fails)'],
  ['escalate: { exhausted: continue }', 'exhausted=continue'],
  ['escalate: { exhausted: { do: stop, comment: Stuck } }', 'exhausted=stop'],
])(
  'dry run shows loop exhaustion policy %s (US-677 AC-6, #728 AC-13)',
  async (policy, expected) => {
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      `version: 1
name: quick
steps:
  implement: { kind: implement }
  rounds:
    kind: loop
    until: review
    max: 1
    ${policy}
    steps:
      review: { kind: review }
      fix: { kind: fix }
`,
    )
    expect(await run(['quick'], OK, { dryRun: true })).toBe(0)
    expect(lines.find(line => line.includes('rounds: loop host'))).toContain(expected)
  },
)

describe('loop blocks (#670)', () => {
  it('resolves settings per inner step; the loop has no kind of its own', async () => {
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      `version: 1
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
`,
    )
    writeConfig(
      'mine',
      'version: 1\nname: mine\ndefaults: { engine: claude, model: claude-sonnet-5-5, effort: medium }\nsteps: { rounds/review: { model: claude-haiku-5-5 } }\n',
    )
    await run(['quick'], OK, { config: 'mine' }, {})
    expect(launched[1]?.model).toBe('claude-haiku-5-5')
    expect(lines).toContain(
      '    rounds/review: engine=claude (defaults) model=claude-haiku-5-5 (step) effort=medium (defaults)',
    )
  })
})

describe('which configuration runs (AC-2, AC-3, AC-5)', () => {
  it('--config wins over the pair.config.json map', async () => {
    write('pair.config.json', JSON.stringify({ workflows: { quick: { configuration: 'other' } } }))
    writeConfig('other', CONFIG.replace('claude-sonnet-5-5', 'm-other'))
    writeConfig()
    await run(['quick'], OK, { config: 'mine' })
    expect(launched[0]?.model).toBe('claude-sonnet-5-5')
  })

  it('takes the map entry of the engine and the workflow default', async () => {
    write(
      'pair.config.json',
      JSON.stringify({
        workflows: { default: { configuration: { claude: 'mine', codex: 'cx' } } },
      }),
    )
    writeConfig()
    writeConfig(
      'cx',
      CONFIG.replace(/engine: claude/, 'engine: codex').replace('claude-sonnet-5-5', 'gpt-x'),
    )
    await run(['quick'])
    expect(launched[0]?.model).toBe('claude-sonnet-5-5')
    launched = []
    fs.rmSync(runDir(), { recursive: true, force: true })
    await run(['quick'], OK, { engine: 'codex' })
    expect(launched[0]?.model).toBe('gpt-x')
  })

  it('refuses a configuration whose defaults.engine differs from --engine, before any launch', async () => {
    writeConfig()
    expect(await run(['quick'], OK, { config: 'mine', engine: 'codex' })).toBe(1)
    expect(
      lines.some(line => line.includes("defaults.engine is 'claude' but --engine is 'codex'")),
    ).toBe(true)
    expect(launched).toEqual([])
  })

  it('a project file replaces the knowledge-base file of the same name entirely', async () => {
    writeConfig(
      'claude-medium',
      'version: 1\nname: mine\ndefaults: { engine: claude, model: only-mine }\n',
    )
    await run(['quick'], OK, { config: 'claude-medium' })
    expect(launched.map(one => one.model)).toEqual(['only-mine', 'only-mine'])
  })

  it('refuses a name that is not a file anywhere', async () => {
    expect(await run(['quick'], OK, { config: 'nope' })).toBe(1)
    expect(lines.some(line => line.includes('configuration-not-found'))).toBe(true)
  })
})

describe('validation of the configuration (AC-4)', () => {
  it('refuses an unknown key before any launch, with file and line', async () => {
    writeConfig('mine', `${CONFIG}extra: 1\n`)
    expect(await run(['quick'], OK, { config: 'mine' })).toBe(1)
    expect(lines.some(line => line.includes('mine.yaml:6: extra: unknown key'))).toBe(true)
    expect(launched).toEqual([])
  })

  it('refuses an engine that is not installed', async () => {
    writeConfig()
    expect(await run(['quick'], OK, { config: 'mine' }, { engineAvailable: () => false })).toBe(1)
    expect(lines.some(line => line.includes("engine 'claude' is not installed"))).toBe(true)
  })

  it('warns about an unknown step id and goes on', async () => {
    writeConfig('mine', `${CONFIG}steps:\n  ghost: { effort: low }\n`)
    expect(await run(['quick'], OK, { config: 'mine' })).toBe(0)
    expect(lines.some(line => line.includes('Warning:') && line.includes("no step 'ghost'"))).toBe(
      true,
    )
  })
})

describe('#674 AC-5 skill configuration per step', () => {
  beforeEach(() => {
    write(
      '.pair/adoption/tech/workflows/quick.yaml',
      QUICK.replace('    gates: [quality-gate]\n', '').replace(
        '    alias: judge',
        '    alias: judge\n    skill: old-review-skill',
      ),
    )
    writeConfig(
      'mine',
      `version: 1
name: mine
defaults: { engine: claude }
steps:
  review: { engine: codex, skill: Presentations }
`,
    )
    vi.stubEnv('HOME', join(project, 'home'))
    vi.stubEnv('PATH', join(project, 'bin'))
  })

  afterEach(() => vi.unstubAllEnvs())

  it('launches the configured name on the step engine when the workflow name is unavailable', async () => {
    write('.agents/skills/Presentations/SKILL.md', '# Presentations')

    const skills = { ...OK, Presentations: () => REVIEWED }
    expect(await run(['quick'], skills, { config: 'mine' }), lines.join('\n')).toBe(0)
    expect(launched.map(step => step.promptText.split('\n')[0])).toEqual([
      '/pair-process-implement',
      'Run the Presentations skill.',
    ])
  })

  it('names the step and configured skill before any launch when only the run engine has it', async () => {
    write('.claude/skills/old-review-skill/SKILL.md', '# Old review skill')
    write('.agents/skills/old-review-skill/SKILL.md', '# Old review skill')
    write('.claude/skills/Presentations/SKILL.md', '# Presentations')

    expect(await run(['quick'], OK, { config: 'mine' }), lines.join('\n')).toBe(1)
    expect(launched).toEqual([])
    expect(lines.join('\n')).toMatch(
      /^(?=.*\breview\b)(?=.*\bPresentations\b).*(?:not installed|not available|unavailable|not found)/m,
    )
  })

  it('R764-10 (#674 AC-2/5): checks reopened skills in the prepared worktree with the frozen configuration', async () => {
    const worktree = 'worktrees/627'
    const implement = `${worktree}/.claude/skills/pair-process-implement/SKILL.md`
    const review = `${worktree}/.agents/skills/Presentations/SKILL.md`
    write(implement, '# Implement')
    write(review, '# Review')
    const options = { config: 'mine' }
    const host = { prepareWorktree: async () => join(project, worktree) }
    const skills = { ...OK, Presentations: () => REVIEWED }
    const failing = {
      ...skills,
      Presentations: () => fenced({ status: 'failed', summary: 'review stopped' }),
    }
    expect(await run(['quick'], failing, options, host), lines.join('\n')).toBe(1)
    expect(launched.map(step => step.cwd)).toEqual([
      join(project, worktree),
      join(project, worktree),
    ])
    const state = join(runDir(), 'state.json')
    const before = fs.readFileSync(state)

    fs.rmSync(join(project, implement))
    fs.rmSync(join(project, review))
    write(`${worktree}/.claude/skills/replacement/SKILL.md`, '# Replacement')
    writeConfig('mine', `${CONFIG}steps:\n  review: { skill: replacement }\n`)
    launched = []
    expect(await run(['quick'], skills, options, host)).toBe(1)
    expect(lines.join('\n')).toContain(
      "steps.review.skill: skill 'Presentations' is not installed for engine 'codex'",
    )
    expect(launched).toEqual([])
    expect(fs.readFileSync(state)).toBe(before)

    write(review, '# Review')
    expect(await run(['quick'], skills, options, host), lines.join('\n')).toBe(0)
    expect(launched.map(step => skillOf(step.promptText))).toEqual(['Presentations'])
  })
})

describe('#707 AC-5 workflow tier validation', () => {
  const withTiers = (tiers: Record<string, string | Record<string, string>>) => {
    write(
      'pair.config.json',
      JSON.stringify({ workflows: { quick: { configuration: 'mine', tiers } } }),
    )
    writeConfig()
  }

  it.each([
    ['an unmatched label', { 'risk:red': 'missing-tier-config' }, /risk:red.*missing-tier-config/],
    [
      'another engine arm',
      { 'risk:green': { claude: 'mine', codex: 'missing-tier-config' } },
      /risk:green.*missing-tier-config/,
    ],
    ['a malformed label', { ' risk:red ': 'mine' }, /label/i],
  ] as const)('refuses %s before any launch', async (_case, tiers, diagnostic) => {
    withTiers(tiers)
    const code = await run(
      ['quick'],
      OK,
      {},
      {
        readCard: async () => ({ title: 'A card', labels: ['risk:green'] }),
      },
    )
    expect(code, lines.join('\n')).toBe(1)
    expect(lines.join('\n')).toContain('workflows.quick.tiers')
    expect(lines.join('\n')).toMatch(diagnostic)
    expect(launched).toEqual([])
  })

  it('runs with a valid name and engine map when no label matches', async () => {
    withTiers({ 'risk:green': 'mine', 'risk:red': { claude: 'mine', codex: 'cx' } })
    writeConfig('cx', CONFIG.replace('engine: claude', 'engine: codex'))
    expect(await run(['quick'])).toBe(0)
    expect(launched[0]?.model).toBe('claude-sonnet-5-5')
  })
})

describe('#707 T-3 workflow tier selection (AC-1, AC-2)', () => {
  const tierSource = 'pair.config.json workflows.quick.tiers.risk:red'
  const fallbackSource = '(pair.config.json workflows.quick)'
  const cardWithLabels = (labels: string[]) => ({
    id: '627',
    title: 'A card',
    body: '',
    labels,
    boardState: null,
    closed: false,
    prerequisites: [],
  })
  const readCardFacts = (labels: string[]) =>
    vi
      .fn<NonNullable<WorkflowHostDependencies['readSelection']>>()
      .mockResolvedValue({ cards: [cardWithLabels(labels)] })

  function writeMapping(tiers?: Record<string, string>) {
    write(
      'pair.config.json',
      JSON.stringify({ workflows: { quick: { configuration: 'mine', tiers } } }),
    )
    writeConfig()
  }

  beforeEach(() => {
    writeMapping({ 'risk:red': 'tier' })
    writeConfig(
      'tier',
      CONFIG.replace('claude-sonnet-5-5', 'tier-build').replace('claude-opus-5-5', 'tier-judge'),
    )
  })

  it.each([
    { entry: 'named', argv: ['quick'] },
    { entry: 'mapped', argv: [] },
  ])('launches the $entry run with its tier and prints the label source', async ({ argv }) => {
    const readSelection = readCardFacts(['risk:red'])

    expect(await run(argv, OK, {}, { readSelection }), lines.join('\n')).toBe(0)

    expect(launched.map(one => one.model)).toEqual(['tier-build', 'tier-judge'])
    expect(lines.join('\n')).toContain(tierSource)
    expect(readSelection).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expect.objectContaining({ cards: ['627'] }),
    )
  })

  it('previews the selected tier and its source without launching', async () => {
    const readSelection = readCardFacts(['risk:red'])

    expect(await run(['quick'], OK, { dryRun: true }, { readSelection })).toBe(0)

    expect(lines.join('\n')).toContain(tierSource)
    expect(lines.join('\n')).toContain('model=tier-build')
    expect(launched).toEqual([])
  })

  it('707-F1: applies the tier filter before loading batch dependencies', async () => {
    writeConfig('tier', `${CONFIG}select: { filter: { has: [release-approved] } }\n`)
    const readDependencies = vi.fn(async (ids: readonly string[]) =>
      ids.map(id => ({ id, prerequisites: [] })),
    )
    const readSelection = async () => ({
      cards: [
        cardWithLabels(['risk:red', 'release-approved']),
        { ...cardWithLabels(['risk:red']), id: '628' },
        { ...cardWithLabels([]), id: '629' },
      ],
      readDependencies,
    })

    expect(await run(['quick'], OK, { card: '627,628,629', dryRun: true }, { readSelection })).toBe(
      0,
    )

    expect(lines.join('\n')).toContain('#628: not-applicable — selection filter')
    expect(readDependencies).toHaveBeenCalledExactlyOnceWith(['627', '629'])
  })

  it.each([
    { name: '707-F2: all tiered', labels: ['risk:red'], exit: 0, eligible: '627, 628' },
    { name: '707-F2: included fallback', labels: [], exit: 1, eligible: '627' },
    {
      name: '707-F3: fallback excluded by label',
      labels: [],
      filter: 'risk:red',
      exit: 0,
      eligible: '627',
    },
  ])('$name when the fallback lacks the engine', async row => {
    write(
      'pair.config.json',
      JSON.stringify({
        workflows: { quick: { configuration: { claude: 'mine' }, tiers: { 'risk:red': 'tier' } } },
      }),
    )
    writeConfig('tier', CONFIG.replace('engine: claude', 'engine: codex'))
    const readSelection = async () => ({
      cards: [cardWithLabels(['risk:red']), { ...cardWithLabels(row.labels), id: '628' }],
    })

    const exit = await run(
      ['quick'],
      OK,
      { card: '627,628', engine: 'codex', filter: row.filter, dryRun: true },
      { readSelection },
    )

    const output = lines.join('\n')
    expect(output).toContain(`Dry run: ${row.eligible};`)
    expect(exit).toBe(row.exit)
    const diagnostic =
      "pair.config.json workflows.quick.configuration has no entry for engine 'codex'"
    if (row.exit === 1)
      expect(output).toContain(`#628: failed — configuration-not-found: ${diagnostic}`)
    else expect(output).not.toContain(diagnostic)
    if (row.filter) expect(output).toContain('#628: not-applicable — selection filter')
  })

  it.each(['tracker request', 'card lookup'])(
    'warns and uses the fallback after a failed %s',
    async failure => {
      const readSelection = readCardFacts([])
      const message = 'card facts unavailable'
      if (failure === 'tracker request') readSelection.mockRejectedValue(new Error(message))
      else readSelection.mockResolvedValue({ cards: [{ ...cardWithLabels([]), error: message }] })

      expect(await run(['quick'], OK, {}, { readSelection }), lines.join('\n')).toBe(0)

      expect(launched[0]?.model).toBe('claude-sonnet-5-5')
      expect(lines.join('\n')).toContain(fallbackSource)
      expect(lines.find(line => line.includes('Warning:') && line.includes(message))).toBeDefined()
    },
  )

  it('records the start labels and retains the chosen tier when resuming', async () => {
    const readSelection = readCardFacts(['risk:red', 'team:cli'])
    const failedReview = () => fenced({ status: 'failed', summary: 'red', reason: 'quality-gate' })
    expect(
      await run(['quick'], { ...OK, 'pair-process-review': failedReview }, {}, { readSelection }),
    ).toBe(1)
    const state = fs.readFileSync(join(runDir(), 'state.json'))
    readSelection.mockResolvedValue({ cards: [cardWithLabels(['risk:green'])] })
    launched = []
    lines.length = 0

    expect(await run(['quick'], OK, {}, { readSelection }), lines.join('\n')).toBe(0)

    expect(launched.map(one => one.model)).toEqual(['tier-judge'])
    expect(lines.join('\n')).toContain(tierSource)
    expect(readSelection).toHaveBeenCalledOnce()
    expect(state).toContain('"risk:red"')
    expect(state).toContain('"team:cli"')
  })

  it.each([
    { context: 'no tiers', tiers: undefined, options: {} },
    { context: '--config', tiers: { 'risk:red': 'tier' }, options: { config: 'mine' } },
  ])(
    'launches with the usual configuration and skips the label read with $context',
    async ({ tiers, options }) => {
      writeMapping(tiers)
      const readSelection = readCardFacts(['risk:red'])

      expect(await run(['quick'], OK, options, { readSelection }), lines.join('\n')).toBe(0)

      expect(launched[0]?.model).toBe('claude-sonnet-5-5')
      expect(readSelection).not.toHaveBeenCalled()
    },
  )

  it('regression #707: previews the tier on a fresh install with no State Mapping table', async () => {
    write(
      '.pair/adoption/tech/way-of-working.md',
      `${REGISTRY}\n## State Mapping\n\nOptional. Add a table if the board uses different names.\n`,
    )
    write('.claude/skills/pair-workflow-cycle/SKILL.md', '# Host bridge fixture')
    write(
      'pair.config.json',
      JSON.stringify({
        run: { agents: { claude: { command: process.execPath } } },
        workflows: { quick: { configuration: 'mine', tiers: { 'risk:red': 'tier' } } },
      }),
    )
    const card = { ...cardWithLabels(['risk:red']), boardState: 'In Progress' }
    vi.spyOn(hostProcess, 'runHostProcess').mockImplementation(async (bin, [script, ...args]) => {
      const available: Record<string, unknown> = {
        'workflow-cards --cards 627': { cards: [card] },
        'workflow-card --story 627': card,
      }
      const command = args.join(' ')
      const result =
        bin === process.execPath && script?.endsWith('cycle-state.mjs')
          ? available[command]
          : undefined
      return result === undefined
        ? { status: 1, stdout: '', stderr: `Unexpected host process: ${bin} ${command}` }
        : { status: 0, stdout: JSON.stringify(result), stderr: '' }
    })

    const exitCode = process.exitCode
    try {
      await runCli([
        process.execPath,
        'pair-cli',
        'run',
        'quick',
        '--card',
        '627',
        '--engine',
        'claude',
        '--dry-run',
        '--cwd',
        project,
      ])
    } finally {
      process.exitCode = exitCode
    }

    const output = lines.join('\n')
    expect(output).toContain(tierSource)
    expect(output).toContain('model=tier-build')
    expect(output).toContain('Dry run:')
  })
})

describe('override (AC-6)', () => {
  it('deep-merges over the file, runs with it and records it in state.json', async () => {
    writeConfig()
    const override = '{"aliases":{"judge":{"model":"claude-haiku-5-5"}}}'
    await run(['quick'], OK, { config: 'mine', configOverride: override })
    expect(launched.map(one => one.model)).toEqual(['claude-sonnet-5-5', 'claude-haiku-5-5'])
    const state = JSON.parse(fs.readFileSync(join(runDir(), 'state.json'))) as {
      configuration: { override: unknown }
    }
    expect(state.configuration.override).toEqual({
      aliases: { judge: { model: 'claude-haiku-5-5' } },
    })
  })

  it('refuses an invalid merge, and an override with no base and no defaults', async () => {
    writeConfig()
    expect(
      await run(['quick'], OK, { config: 'mine', configOverride: '{"aliases":{"ghost":{}}}' }),
    ).toBe(1)
    expect(
      await run(['quick'], OK, { configOverride: '{"aliases":{"judge":{"model":"m"}}}' }),
    ).toBe(1)
    expect(launched).toEqual([])
  })
})

describe('#723 T-6 assignment configuration (AC-7, AC-9)', () => {
  const workflowPath = '.pair/adoption/tech/workflows/quick.yaml'
  let assignments: string[]

  beforeEach(() => {
    assignments = []
    write(
      workflowPath,
      QUICK.replace('name: quick', 'name: quick\nassign: me').replace(
        'alias: judge',
        'alias: judge\n    assign: unassign',
      ),
    )
    write('.claude/skills/pair-workflow-cycle/SKILL.md', '# Host bridge fixture')
    vi.spyOn(hostProcess, 'runHostProcess').mockImplementation(async (bin, args) => {
      if (bin === 'sh') return { status: 0, stdout: '', stderr: '' }
      const [, operation, , raw] = args
      expect(operation).toBe('assign-card')
      const { assign } = JSON.parse(raw ?? '{}') as { assign: string }
      assignments.push(assign)
      return { status: 0, stdout: '{"status":"assigned"}', stderr: '' }
    })
  })

  const printsAssignment = (step: string, value: string, source: string) => {
    const output = lines.filter(line => line.trimStart().startsWith(`${step}:`)).join('\n')
    expect(output).toContain(`assign=${value} (${source})`)
  }

  it('applies the configured step before the configured default, then prints both sources', async () => {
    writeConfig('mine', `${CONFIG}assign: bot-pair\nsteps:\n  implement: { assign: alice }\n`)

    expect(await run(['quick'], OK, { config: 'mine' }), lines.join('\n')).toBe(0)

    expect(assignments).toEqual(['alice', 'bot-pair'])
    expect(launched[0]?.promptText).toContain('- assignee: none')
    expect(launched.map(one => [one.model, one.effort])).toEqual([
      ['claude-sonnet-5-5', 'medium'],
      ['claude-opus-5-5', 'high'],
    ])
    printsAssignment('implement', 'alice', 'configuration.steps.implement.assign')
    printsAssignment('review', 'bot-pair', 'configuration.assign')
  })

  it.each(['mine', undefined])('reports workflow fallback sources with config=%s', async config => {
    writeConfig()

    expect(await run(['quick'], OK, { config }), lines.join('\n')).toBe(0)

    expect(assignments).toEqual(['me', 'unassign'])
    printsAssignment('implement', 'me', 'workflow.assign')
    printsAssignment('review', 'unassign', 'steps.review.assign')
  })

  it('claims for the runner when neither source configures an assignment', async () => {
    write(workflowPath, QUICK)
    writeConfig()

    expect(await run(['quick'], OK, { config: 'mine' })).toBe(0)

    expect(assignments).toEqual(['me'])
    expect(launched[0]?.promptText).toContain('- assignee: none')
    printsAssignment('implement', 'me', 'default')
    expect(lines.filter(line => line.includes('assign='))).toHaveLength(1)
  })

  it('previews implicit me alongside a configured review assignee', async () => {
    write(workflowPath, QUICK)
    writeConfig('mine', `${CONFIG}steps:\n  review: { assign: alice }\n`)

    expect(await run(['quick'], OK, { config: 'mine', dryRun: true })).toBe(0)

    printsAssignment('implement', 'me', 'default')
    printsAssignment('review', 'alice', 'configuration.steps.review.assign')
    expect(assignments).toEqual([])
    expect(launched).toEqual([])
  })

  it('runs quick --card 123 --config-override with explicit none and no named configuration', async () => {
    expect(
      await run(['quick'], OK, { card: '123', configOverride: '{"assign":"none"}' }),
      lines.join('\n'),
    ).toBe(0)

    expect(assignments).toEqual([])
    expect(launched[0]?.promptText).toContain('- assignee: none')
    expect(launched.map(one => one.model)).toEqual([undefined, undefined])
    printsAssignment('implement', 'none', 'configuration.assign')
    printsAssignment('review', 'none', 'configuration.assign')
  })

  describe('published card assignment examples (#723 AC-9)', () => {
    const grammar = join(
      __dirname,
      '../../../../../packages/knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/automation/workflow-grammar.md',
    )
    const examples = () =>
      fs
        .readFileSync(grammar)
        .replace(/\r\n/g, '\n')
        .split('\n## Card assignment\n')[1]
        ?.split('\n## ')[0] ?? ''
    const commands = () =>
      Array.from(
        examples().matchAll(/^```(?:bash|sh|shell|text)?\n([\s\S]*?)^```$/gm),
        ([, block]) => block ?? '',
      ).flatMap(block =>
        block
          .trim()
          .split('\n')
          .map(line => line.split(/\s+#/)[0]?.trim()),
      )

    it.each(['', ' $assignee=alice', ' $assignee=none'])(
      'shows /pair-process-implement $story=123%s',
      override => {
        expect(commands(), 'skill commands in the Card assignment section').toContain(
          `/pair-process-implement $story=123${override}`,
        )
      },
    )

    it('resolves the quick.yaml example to me, alice on review and unassign on the final step', () => {
      const yaml = Array.from(
        examples().matchAll(/^```yaml\n([\s\S]*?)^```$/gm),
        ([, block]) => block,
      ).find(block => /^name: quick$/m.test(block ?? ''))
      expect(yaml, 'quick.yaml in the Card assignment section').toBeDefined()
      const { workflow, errors } = validate(yaml ?? '', 'quick.yaml', {
        skillExists: () => true,
        gateKeys: ['quality-gate'],
        launchInputs: ['card'],
        isSafeText: isSafePromptText,
      })
      expect(errors).toEqual([])
      expect(workflow?.assign).toBe('me')
      const steps = workflow?.steps.map(step => ({ id: step.id, ...assignmentFor(workflow, step) }))
      expect(steps?.find(step => step.id === 'implement')).toMatchObject({
        value: 'me',
        source: 'workflow.assign',
      })
      expect(steps?.find(step => step.id === 'review')).toMatchObject({
        value: 'alice',
        source: 'steps.review.assign',
      })
      expect(steps?.at(-1)?.value).toBe('unassign')
    })

    it('runs the documented config override that leaves the card assignment unchanged', async () => {
      const command = commands().find(line =>
        /^pair run quick --card 123 --config-override '\{"assign":"none"\}'$/.test(line ?? ''),
      )
      expect(command, 'config override command in the Card assignment section').toBeDefined()
      const argv = command?.match(/'[^']*'|\S+/g)?.map(arg => arg.replace(/^'|'$/g, '')) ?? []
      const handle = vi
        .spyOn(commandRegistry.run, 'handle')
        .mockImplementation(async (config, files) => {
          const code = await handleRunCommand(config, files, deps(OK))
          expect(code, lines.join('\n')).toBe(0)
          return code
        })

      await runCli([process.execPath, ...argv, '--cwd', project])
      expect(handle).toHaveBeenCalledOnce()
      expect(assignments).toEqual([])
      printsAssignment('implement', 'none', 'configuration.assign')
      printsAssignment('review', 'none', 'configuration.assign')
    })
  })

  it('overrides only the addressed step through JSON with no named configuration', async () => {
    expect(
      await run(['quick'], OK, {
        card: '123',
        configOverride: '{"steps":{"review":{"assign":"alice"}}}',
      }),
      lines.join('\n'),
    ).toBe(0)

    expect(assignments).toEqual(['me', 'alice'])
    printsAssignment('implement', 'me', 'workflow.assign')
    printsAssignment('review', 'alice', 'configuration.steps.review.assign')
  })

  it('resumes with the assignment from the frozen configuration after the source changes', async () => {
    const withReviewer = (login: string) => `${CONFIG}steps:\n  review: { assign: ${login} }\n`
    const failedReview = () => fenced({ status: 'failed', summary: 'red', reason: 'quality-gate' })
    writeConfig('mine', withReviewer('alice'))
    const config = { config: 'mine' }
    expect(await run(['quick'], { ...OK, 'pair-process-review': failedReview }, config)).toBe(1)
    writeConfig('mine', withReviewer('mallory'))
    assignments.length = 0
    launched.length = 0
    lines.length = 0

    expect(await run(['quick'], OK, config), lines.join('\n')).toBe(0)

    expect(assignments).toEqual(['alice'])
    expect(launched.map(one => skillOf(one.promptText))).toEqual(['pair-process-review'])
    printsAssignment('review', 'alice', 'configuration.steps.review.assign')
  })

  it.each([
    ['assign: "@me"', 'mine.yaml:6: assign', 'does not match'],
    ['steps:\n  review: { assign: false }', 'mine.yaml:7: steps.review.assign', 'expected string'],
  ])('reports a positioned fix for invalid configuration %s', async (input, position, problem) => {
    writeConfig('mine', `${CONFIG}${input}\n`)

    expect(await run(['quick'], OK, { config: 'mine' })).toBe(1)

    const diagnostic = lines.find(line => line.includes(position)) ?? ''
    expect(diagnostic).toContain(problem)
    expect(diagnostic).toContain('fix:')
    expect(diagnostic).not.toContain('unknown key')
    expect(launched).toEqual([])
  })
})

describe('frozen copy and resume (AC-7)', () => {
  const FAIL = () => fenced({ status: 'failed', summary: 'red', reason: 'quality-gate' })

  it('a resume uses the frozen copy and reports a changed source; --reconfigure replaces it without re-running ok steps', async () => {
    writeConfig()
    await run(['quick'], { ...OK, 'pair-process-review': FAIL }, { config: 'mine' })
    writeConfig('mine', CONFIG.replace('claude-opus-5-5', 'claude-haiku-5-5'))
    launched = []
    lines.length = 0
    await run(['quick'], OK, { config: 'mine' })
    expect(launched.map(one => one.model)).toEqual(['claude-opus-5-5'])
    expect(
      lines.some(line => line.includes('the configuration changed after this run started')),
    ).toBe(true)

    fs.rmSync(join(runDir(), 'state.json'))
    await run(['quick'], { ...OK, 'pair-process-review': FAIL }, { config: 'mine' })
    launched = []
    await run(['quick'], OK, { config: 'mine', reconfigure: true })
    expect(launched.map(one => one.model)).toEqual(['claude-haiku-5-5'])
  })

  it('a run started with no configuration says so on resume when one now resolves, and checks its engine', async () => {
    await run(['quick'], { ...OK, 'pair-process-review': FAIL })
    writeConfig(
      'mine',
      CONFIG.replace(
        'engine: claude, model: claude-sonnet-5-5',
        'engine: codex, model: gpt-6-sol',
      ).replace('claude-opus-5-5', 'gpt-6-astra'),
    )
    lines.length = 0
    launched = []
    const codexOnly = { engineAvailable: (engine: string) => engine === 'codex' }
    await expect(run(['quick'], OK, { config: 'mine' }, codexOnly)).rejects.toThrow(
      "Engine 'claude' is not installed",
    )
    expect(lines.some(line => line.includes('started with no configuration'))).toBe(true)
    expect(launched).toEqual([])
  })

  it("a resume on a frozen copy no configuration resolves now checks the copy's engines", async () => {
    writeConfig(
      'mine',
      CONFIG.replace(
        'engine: claude, model: claude-sonnet-5-5',
        'engine: codex, model: gpt-6-sol',
      ).replace('claude-opus-5-5', 'gpt-6-astra'),
    )
    await run(['quick'], { ...OK, 'pair-process-review': FAIL }, { config: 'mine' })
    launched = []
    const claudeOnly = { engineAvailable: (engine: string) => engine === 'claude' }
    await expect(run(['quick'], OK, {}, claudeOnly)).rejects.toThrow(
      "engine 'codex' is not installed",
    )
    expect(launched).toEqual([])
  })
})

describe('the key telemetry and its flag (AC-9)', () => {
  const telemetry = () => fs.existsSync(join(runDir(), 'telemetry.jsonl'))
  it.each([
    ['on by the key', 'telemetry: true\n', {}, true],
    ['off by the key', 'telemetry: false\n', {}, false],
    ['the flag over the key', 'telemetry: false\n', { telemetry: true }, true],
    ['--no-telemetry over the key', 'telemetry: true\n', { telemetry: false }, false],
  ])('%s', async (_name, key, options, expected) => {
    writeConfig('mine', CONFIG + key)
    await run(['quick'], OK, { config: 'mine', ...options })
    expect(telemetry()).toBe(expected)
  })
})

describe('the shipped configurations (AC-8)', () => {
  it.each(['claude', 'codex'])(
    '%s base, cheap, medium and high parse and name themselves',
    async family => {
      const dir = join(
        __dirname,
        '../../../../../packages/knowledge-hub/dataset/.pair/adoption/tech/configurations',
      )
      for (const level of ['', '-cheap', '-medium', '-high']) {
        const file = join(dir, `${family}${level}.yaml`)
        const parsed = parseConfiguration(fs.readFileSync(file), file)
        expect(parsed.errors).toEqual([])
        expect(parsed.configuration?.defaults.engine).toBe(family)
      }
    },
  )
})
