import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { fileSystemService } from '@pair/content-ops'
import { handleInstallCommand } from './handler'
import { handleRunCommand } from '../run/handler'
import { parseRunCommand } from '../run/parser'
import { resolveContext, takeCardLock } from '../run/run-context'
import type { SpawnIterationInput } from '../run/spawn'
import { handleUpdateCommand } from '../update/handler'

const CLI = join(__dirname, '../../..')
const DATASET = join(CLI, '../../packages/knowledge-hub/dataset')
const roots: string[] = []

const registry = (prefix: string, target: string) => ({
  prefix,
  targets: [{ path: target, mode: 'canonical' }],
})

const defaultTarget = '.claude/skills'
const customTarget = 'team/skills'
const pairRegistry = registry('pair', defaultTarget)
const teamRegistry = registry('team', customTarget)
const vendorSkill = '---\nname: vendor-notes\n---\n'

type FixtureSkills = { prefix: string; targets?: { path: string }[] }
type FixtureWorkingArea = { project?: string; legacy?: string; expected: string }

function write(root: string, path: string, value: string) {
  const file = join(root, path)
  fileSystemService.mkdirSync(dirname(file), { recursive: true })
  fileSystemService.writeFileSync(file, value)
}

function installConfig(root: string, override: ReturnType<typeof registry> | undefined) {
  if (override === undefined) return undefined
  write(root, 'install.config.json', JSON.stringify({ asset_registries: { skills: override } }))
  return join(root, 'install.config.json')
}

function vendorTarget(skills: FixtureSkills | undefined) {
  return skills?.targets?.[0]?.path ?? defaultTarget
}

function writeProjectConfigs(
  root: string,
  skills: FixtureSkills | undefined,
  legacySkills: FixtureSkills | undefined,
  workingArea: FixtureWorkingArea | undefined,
) {
  write(
    root,
    'pair.config.json',
    JSON.stringify({
      worktreeRoot: 'worktrees',
      working_path: workingArea?.project,
      ...(skills !== undefined && { asset_registries: { skills } }),
    }),
  )
  if (workingArea?.legacy !== undefined || legacySkills !== undefined)
    write(
      root,
      'config.json',
      JSON.stringify({
        working_path: workingArea?.legacy,
        ...(legacySkills !== undefined && { asset_registries: { skills: legacySkills } }),
      }),
    )
}

function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
}

function runner(cwd: string, file: string) {
  return (...args: string[]) => {
    const result = spawnSync(process.execPath, [file, ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 5_000,
    })
    expect(result.status, result.error?.message ?? (result.stderr || result.stdout)).toBe(0)
    return JSON.parse(result.stdout)
  }
}

function install(cwd: string, config?: string, command: 'install' | 'update' = 'install') {
  const fs = {
    ...fileSystemService,
    currentWorkingDirectory: () => cwd,
    rootModuleDirectory: () => CLI,
  }
  const source = {
    resolution: 'local',
    path: DATASET,
    offline: true,
    kb: false,
    target: cwd,
  } as const
  const options = config === undefined ? undefined : { config }
  return command === 'install'
    ? handleInstallCommand({ command, ...source }, fs, options)
    : handleUpdateCommand({ command, ...source }, fs, options)
}

async function verifyCardExclusion(
  root: string,
  linked: string,
  workingArea: string,
  stop: () => void,
) {
  const fs = fileSystemService
  const card = '42'
  const lockPath = `${workingArea}/automation/locks/42`
  write(
    root,
    '.pair/adoption/tech/workflows/compete.yaml',
    'version: 1\nname: compete\nsteps:\n  notes: { kind: generic, skill: vendor-notes }\n',
  )
  const bare = (cwd: string) =>
    takeCardLock(resolveContext(parseRunCommand({ card, cwd }, []), fs, cwd, true), {}, card)
  const runIteration = vi.fn(async ({ onEvent }: SpawnIterationInput) => {
    onEvent?.({
      type: 'result',
      subtype: 'success',
      result: '```json\n{"status":"ok","summary":"Notes prepared"}\n```',
    })
    return { outcome: 'success' as const, detail: 'fixture' }
  })
  const named = () =>
    handleRunCommand(parseRunCommand({ card, cwd: linked }, ['compete']), fs, {
      workflow: {
        runIteration,
        readCard: async () => ({ title: 'Prepare release notes' }),
        prepareWorktree: async () => linked,
        engineAvailable: () => true,
      },
    })

  expect.soft(fs.existsSync(join(root, lockPath))).toBe(true)
  for (const cwd of [root, linked]) {
    const lock = bare(cwd)
    expect.soft(lock).toBeUndefined()
    lock?.release()
  }
  expect(await named()).toBe(0)
  expect.soft(runIteration).not.toHaveBeenCalled()
  expect.soft(console.log).toHaveBeenCalledWith(expect.stringContaining('card-locked: '))

  stop()
  expect(fs.existsSync(join(root, lockPath))).toBe(false)
  const released = bare(root)
  expect(released?.path).toContain(lockPath)
  released?.release()
  expect(await named()).toBe(0)
  expect(runIteration).toHaveBeenCalledTimes(1)
}

async function verifyRedirectedCardPreflight(root: string, skill: string) {
  const runIteration = vi.fn(async (input: SpawnIterationInput) => {
    input.onEvent?.({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: '```json\n{"status":"needs-decision","summary":"Question"}\n```',
      },
    })
    return { outcome: 'success' as const, detail: 'test engine' }
  })
  await handleRunCommand(
    parseRunCommand({ card: '42', cwd: root, engine: 'codex' }, ['native.yaml']),
    fileSystemService,
    {
      workflow: { runIteration, engineAvailable: () => true, prepareWorktree: async () => root },
    },
  )
  expect(runIteration.mock.calls.map(([input]) => input.promptText.split('\n')[0])).toEqual([
    `Run the ${skill} skill.`,
  ])
}

async function verifyUnlocatedLegacyTarget(root: string, bundle: string) {
  const fs = fileSystemService
  const file = join(root, '.pair/.skill-name-map.json')
  const original = fs.readFileSync(file)
  const saved = JSON.parse(original)
  fs.writeFileSync(file, JSON.stringify({ version: 1, skills: saved.skills }))
  try {
    const cli = parseRunCommand({ card: '42', cwd: root, dryRun: true }, ['native.yaml'])
    const messages = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await handleRunCommand(cli, fs)).toBe(1)
    expect.soft(messages).toHaveBeenCalledWith(expect.stringContaining('pair.config.json'))
    const session = spawnSync(process.execPath, [bundle, 'validate', 'native.yaml'], {
      cwd: root,
      encoding: 'utf8',
    })
    expect.soft(session.status).toBe(1)
    expect(session.stderr).toContain('pair.config.json')
    writeProjectConfigs(root, teamRegistry, undefined, undefined)
    expect(await handleRunCommand(cli, fs)).toBe(0)
    expect(runner(root, bundle)('validate', 'native.yaml').steps[0].skill).toBe(
      'team-process-refine-story',
    )
  } finally {
    writeProjectConfigs(root, undefined, undefined, undefined)
    fs.writeFileSync(file, original)
  }
}

it('R754-06: native preflight uses a redirected install and both hosts explain a legacy target gap', async () => {
  const root = fileSystemService.mkdtempSync(join(tmpdir(), 'pair-native-override-'))
  roots.push(root)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  writeProjectConfigs(root, undefined, undefined, undefined)
  expect(await install(root, installConfig(root, teamRegistry))).toBe(0)
  write(root, '.pair/adoption/tech/way-of-working.md', '- `pm-tool`: `filesystem`\n')
  write(
    root,
    '.pair/adoption/product/backlog/03-user-stories/not-started/42.md',
    '# Prepare release notes\n\n**Status**: Todo\n',
  )
  git(root, 'init', '-b', 'main')
  git(
    root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--allow-empty',
    '-m',
    'Fixture',
  )
  write(
    root,
    'native.yaml',
    'version: 1\nname: native\nsteps:\n  refine: { kind: refine-story, with: { mode: autonomous } }\n',
  )
  await verifyUnlocatedLegacyTarget(
    root,
    join(root, customTarget, 'team-capability-workflow/scripts/workflow.mjs'),
  )
  await verifyRedirectedCardPreflight(root, 'team-process-refine-story')
}, 45_000)

async function verifyConfiguredSkill(
  root: string,
  script: string,
  legacySkills: FixtureSkills,
  projectSkills: FixtureSkills | undefined,
) {
  const fs = fileSystemService
  const invoke = runner(root, script)
  const skill = 'vendor-notes'
  const effective = projectSkills ?? legacySkills
  const target = vendorTarget(effective)
  const exact = `${target}/${skill}/SKILL.md`
  write(root, `${target}/${effective.prefix}-${skill}/SKILL.md`, vendorSkill)
  write(
    root,
    '.pair/adoption/tech/workflows/explicit.yaml',
    `version: 1\nname: explicit\nsteps:\n  notes: { kind: generic, skill: ${skill} }\n`,
  )
  const cli = parseRunCommand({ card: '42', cwd: root, dryRun: true }, ['explicit'])
  expect(
    await handleRunCommand(cli, fs, {
      workflow: { readCard: async () => ({ title: 'Prepare release notes' }) },
    }),
  ).toBe(0)
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`skill=${skill}`))
  const explicit = { steps: [{ id: 'notes', skill }] }
  expect(invoke('validate', 'explicit')).toMatchObject(explicit)
  const opened = invoke('start', 'explicit', '--card', '42', '--engine', 'codex')
  expect(opened).toMatchObject(explicit)
  expect(invoke('next', opened.runId, '--lease', opened.lease)).toMatchObject({
    ready: [{ uses: skill, message: expect.stringContaining(`Run the ${skill} skill.`) }],
  })
  invoke('stop', opened.runId, '--lease', opened.lease)

  fs.rmSync(join(root, exact))
  if (projectSkills !== undefined)
    write(root, `${vendorTarget(legacySkills)}/${skill}/SKILL.md`, vendorSkill)
  const absent = spawnSync(process.execPath, [script, 'validate', 'explicit'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5_000,
  })
  expect(absent.stderr).toContain(`skill '${skill}' is not installed`)
  expect(absent.status).toBe(1)
  expect(
    await handleRunCommand(cli, fs, {
      workflow: { readCard: async () => ({ title: 'Prepare release notes' }) },
    }),
  ).toBe(1)
  write(root, exact, vendorSkill)
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0))
    fileSystemService.rmSync(root, { recursive: true, force: true })
})

it.each([
  ['legacy dataset_registries', { dataset_registries: { skills: teamRegistry } }, customTarget, 0],
  [
    'legacy target_path',
    { asset_registries: { skills: { target_path: customTarget } } },
    customTarget,
    0,
  ],
  ['old bundle target', { asset_registries: { skills: teamRegistry } }, defaultTarget, 1],
  ['unconfigured OpenCode target', {}, '.opencode/skills', 1],
] as const)(
  'R754-06: both hosts probe the effective registry with %s',
  async (_, legacy, target, status) => {
    const fs = fileSystemService
    const root = fs.mkdtempSync(join(tmpdir(), 'pair-skill-registry-'))
    roots.push(root)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    write(root, 'pair.config.json', JSON.stringify({ worktreeRoot: 'worktrees' }))
    write(root, 'config.json', JSON.stringify(legacy))
    write(root, `${target}/vendor-notes/SKILL.md`, vendorSkill)
    write(
      root,
      'explicit.yaml',
      'version: 1\nname: explicit\nsteps:\n  notes: { kind: generic, skill: vendor-notes }\n',
    )
    const script = `${defaultTarget}/pair-capability-workflow/scripts/workflow.mjs`
    write(
      root,
      script,
      fs.readFileSync(join(DATASET, '.skills/capability/workflow/scripts/workflow.mjs')),
    )

    const cli = parseRunCommand({ card: '42', cwd: root, dryRun: true }, ['explicit.yaml'])
    expect
      .soft(
        await handleRunCommand(cli, fs, {
          workflow: { readCard: async () => ({ title: 'Prepare release notes' }) },
        }),
      )
      .toBe(status)
    const session = spawnSync(process.execPath, [script, 'validate', 'explicit.yaml'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5_000,
    })
    expect(session.status, session.error?.message ?? session.stderr).toBe(status)
  },
)

it.each([
  {
    name: 'working area in pair.config.json (R754-01 / AC-4)',
    prefix: 'pair',
    target: defaultTarget,
    workingArea: { project: '.pair/scratch', expected: '.pair/scratch' },
  },
  {
    name: 'working area inherited from config.json (R754-01 / AC-4)',
    prefix: 'pair',
    target: defaultTarget,
    workingArea: { legacy: '.pair/scratch', expected: '.pair/scratch' },
  },
  {
    name: 'working area overridden by pair.config.json (R754-01 / AC-4)',
    prefix: 'pair',
    target: defaultTarget,
    workingArea: { legacy: '.pair/legacy', project: '.pair/scratch', expected: '.pair/scratch' },
  },
  { name: 'project prefix', prefix: 'team', target: defaultTarget, skills: { prefix: 'team' } },
  {
    name: 'project target and prefix',
    prefix: 'team',
    target: customTarget,
    skills: teamRegistry,
    legacySkills: registry('legacy', 'legacy/skills'),
    workingArea: { legacy: '.pair/legacy', expected: '.pair/working' },
  },
  {
    name: 'registry inherited from config.json',
    prefix: 'pair',
    target: defaultTarget,
    legacySkills: teamRegistry,
  },
  {
    name: 'overridden target',
    prefix: 'team',
    target: customTarget,
    skills: registry('team', defaultTarget),
    override: teamRegistry,
  },
  {
    name: 'overridden target and prefix',
    prefix: 'team',
    target: customTarget,
    skills: pairRegistry,
    override: teamRegistry,
  },
  {
    name: 'override without a project registry',
    prefix: 'team',
    target: customTarget,
    override: teamRegistry,
  },
  {
    name: 'overridden prefix with the old skills still installed',
    prefix: 'team',
    target: defaultTarget,
    skills: pairRegistry,
    override: registry('team', defaultTarget),
    update: true,
  },
])(
  'R754-06 / AC-1, AC-4, AC-8: resolves skills with $name',
  async ({ prefix, target, skills, legacySkills, override, update, workingArea }) => {
    const fixture = fileSystemService.mkdtempSync(join(tmpdir(), 'pair-install-session-'))
    roots.push(fixture)
    const root = join(fixture, 'primary')
    const fs = fileSystemService
    vi.spyOn(console, 'log').mockImplementation(() => {})

    writeProjectConfigs(root, skills, legacySkills, workingArea)
    const config = installConfig(root, override)
    const skillFile = (directory: string, name: string) => join(directory, target, name, 'SKILL.md')
    if (update) expect(await install(root)).toBe(0)
    expect(await install(root, config, update ? 'update' : 'install')).toBe(0)
    if (update) expect(fs.existsSync(skillFile(root, 'pair-process-refine-story'))).toBe(true)
    expect(fs.existsSync(skillFile(root, `${prefix}-process-refine-story`))).toBe(true)

    const configuredTarget = vendorTarget(skills ?? legacySkills)
    const vendor = `${configuredTarget}/vendor-notes/SKILL.md`
    const estimate = `${prefix}-capability-estimate`
    const configuredEstimate = `${configuredTarget}/${estimate}/SKILL.md`
    // A one-off installer override can move the bundle without configuring workflow lookup.
    if (target !== configuredTarget)
      write(root, configuredEstimate, fs.readFileSync(skillFile(root, estimate)))
    write(root, vendor, vendorSkill)
    const adoption =
      '- `pm-tool`: `filesystem`\n\n## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Todo | Draft |\n| Ready | Ready |\n'
    write(root, '.pair/adoption/tech/way-of-working.md', adoption)
    write(
      root,
      '.pair/adoption/product/backlog/03-user-stories/not-started/42.md',
      `
# Prepare release notes

**Status**: Todo

## Story Statement

As a maintainer
I want release notes
So that I can announce the release

## Task Breakdown

- [ ] Draft the notes

## Technical Analysis

Design: not required
`,
    )
    write(
      root,
      '.pair/adoption/tech/workflows/installed.yaml',
      `version: 1
name: installed
select: { filter: { status: [Draft] } }
steps:
  refine: { kind: refine-story }
  estimate: { kind: generic, skill: ${prefix}-capability-estimate }
  notes: { kind: generic, skill: vendor-notes }
`,
    )
    const script = (cwd: string) =>
      join(cwd, target, `${prefix}-capability-workflow/scripts/workflow.mjs`)
    const runSkill = skillFile(root, `${prefix}-workflow-run`)
    const link = /\[workflow script\]\(([^)]+)\)/.exec(fs.readFileSync(runSkill))?.[1]
    expect(link && resolve(dirname(runSkill), link)).toBe(script(root))
    const facts = runner(
      root,
      join(root, target, `${prefix}-workflow-cycle/scripts/workflow-facts.mjs`),
    )
    const preview = {
      steps: [
        { id: 'refine', skill: `${prefix}-process-refine-story` },
        { id: 'estimate', skill: `${prefix}-capability-estimate` },
        { id: 'notes', skill: 'vendor-notes' },
      ],
    }
    const dispatch = {
      ready: [
        {
          uses: `${prefix}-process-refine-story`,
          message: expect.stringContaining(`Run the ${prefix}-process-refine-story skill.`),
        },
      ],
    }
    const cliPreview = parseRunCommand({ card: '42', cwd: root, dryRun: true }, ['installed'])
    expect(
      await handleRunCommand(cliPreview, fs, {
        workflow: { readCard: async () => ({ title: 'Prepare release notes' }) },
      }),
    ).toBe(0)
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(`refine: refine-story skill=${prefix}-process-refine-story`),
    )
    const invoke = runner(root, script(root))
    git(root, 'init', '-b', 'main')
    // A linked checkout of the updated installation must resolve the same retained aliases.
    if (update) git(root, 'add', '-f', '--', target, '.pair/.skill-name-map.json')
    git(
      root,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--allow-empty',
      '-m',
      'Fixture',
    )
    if (legacySkills !== undefined)
      await verifyConfiguredSkill(root, script(root), legacySkills, skills)
    expect(invoke('validate', 'installed')).toMatchObject(preview)
    const { runId, lease } = invoke('start', 'installed', '--card', '42', '--engine', 'codex')
    invoke('stop', runId, '--lease', lease)

    if (update) {
      const skill = 'pair-process-refine-story'
      write(
        root,
        '.pair/adoption/tech/workflows/explicit.yaml',
        `version: 1
name: explicit
steps:
  refine: { kind: generic, skill: ${skill} }
`,
      )
      const explicit = { steps: [{ id: 'refine', skill }] }
      expect.soft(invoke('validate', 'explicit')).toMatchObject(explicit)
      const opened = invoke('start', 'explicit', '--card', '42', '--engine', 'codex')
      expect.soft(opened).toMatchObject(explicit)
      expect.soft(invoke('next', opened.runId, '--lease', opened.lease)).toMatchObject({
        ready: [{ uses: skill, message: expect.stringContaining(`Run the ${skill} skill.`) }],
      })
      invoke('stop', opened.runId, '--lease', opened.lease)

      fs.rmSync(dirname(skillFile(root, skill)), { recursive: true })
      const absent = spawnSync(process.execPath, [script(root), 'validate', 'explicit'], {
        cwd: root,
        encoding: 'utf8',
        timeout: 5_000,
      })
      expect(absent.stderr).toContain(`skill '${skill}' is not installed`)
      expect(absent.status).toBe(1)
    }

    const linked = join(fixture, 'linked')
    git(root, 'worktree', 'add', '--detach', linked)
    write(linked, 'pair.config.json', fs.readFileSync(join(root, 'pair.config.json')))
    if (legacySkills !== undefined)
      write(linked, 'config.json', fs.readFileSync(join(root, 'config.json')))
    if (update) expect(fs.existsSync(skillFile(linked, 'pair-process-refine-story'))).toBe(true)
    else expect(await install(linked, config)).toBe(0)
    if (target !== configuredTarget)
      write(linked, configuredEstimate, fs.readFileSync(skillFile(linked, estimate)))
    write(linked, vendor, vendorSkill)
    const invokeLinked = runner(linked, script(linked))
    expect(invokeLinked('validate', 'installed')).toMatchObject(preview)
    const resumed = invokeLinked('resume', runId, '--engine', 'codex')
    expect(invokeLinked('next', runId, '--lease', resumed.lease)).toMatchObject(dispatch)
    if (workingArea !== undefined)
      await verifyCardExclusion(root, linked, workingArea.expected, () => {
        expect(invokeLinked('stop', runId, '--lease', resumed.lease)).toMatchObject({
          stopped: true,
        })
      })
    expect(facts('board-state', '42', JSON.stringify({ state: 'Ready', adoption }))).toMatchObject({
      confirmed: true,
    })
  },
  // This matrix installs the full dataset in both the main and linked worktrees.
  45_000,
)
