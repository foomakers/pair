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

function vendorTarget(skills: { prefix: string; targets?: { path: string }[] } | undefined) {
  return skills?.targets?.[0]?.path ?? defaultTarget
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

async function installFixture(
  root: string,
  config: string | undefined,
  update: boolean | undefined,
  legacySkill: string,
) {
  if (update) expect(await install(root)).toBe(0)
  expect(await install(root, config, update ? 'update' : 'install')).toBe(0)
  if (update) expect(fileSystemService.existsSync(legacySkill)).toBe(true)
}

async function verifyCardExclusion(root: string, linked: string, stop: () => void) {
  const fs = fileSystemService
  const card = '42'
  const lockPath = '.pair/scratch/automation/locks/42'
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
  expect
    .soft(console.log)
    .toHaveBeenCalledWith(
      expect.stringMatching(/card-locked: .*\.pair\/scratch\/automation\/locks\/42/),
    )

  stop()
  expect(fs.existsSync(join(root, lockPath))).toBe(false)
  const released = bare(root)
  expect(released?.path).toContain(lockPath)
  released?.release()
  expect(await named()).toBe(0)
  expect(runIteration).toHaveBeenCalledTimes(1)
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0))
    fileSystemService.rmSync(root, { recursive: true, force: true })
})

it.each([
  {
    name: 'default registry (R754-01 / AC-4)',
    prefix: 'pair',
    target: defaultTarget,
    customWorkingArea: true,
  },
  { name: 'project prefix', prefix: 'team', target: defaultTarget, skills: { prefix: 'team' } },
  {
    name: 'project target and prefix',
    prefix: 'team',
    target: customTarget,
    skills: teamRegistry,
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
  async ({ prefix, target, skills, override, update, customWorkingArea }) => {
    const fixture = fileSystemService.mkdtempSync(join(tmpdir(), 'pair-install-session-'))
    roots.push(fixture)
    const root = join(fixture, 'primary')
    const fs = fileSystemService
    vi.spyOn(console, 'log').mockImplementation(() => {})

    write(
      root,
      'pair.config.json',
      JSON.stringify({
        worktreeRoot: 'worktrees',
        ...(customWorkingArea && { working_path: '.pair/scratch' }),
        ...(skills !== undefined && { asset_registries: { skills } }),
      }),
    )
    const config = installConfig(root, override)
    const skillFile = (directory: string, name: string) => join(directory, target, name, 'SKILL.md')
    await installFixture(root, config, update, skillFile(root, 'pair-process-refine-story'))
    expect(fs.existsSync(skillFile(root, `${prefix}-process-refine-story`))).toBe(true)

    const vendor = `${vendorTarget(skills)}/vendor-notes/SKILL.md`
    const vendorSkill = '---\nname: vendor-notes\n---\n'
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
    const invoke = runner(root, script(root))
    expect(invoke('validate', 'installed')).toMatchObject(preview)
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
    await installFixture(linked, config, update, skillFile(linked, 'pair-process-refine-story'))
    write(linked, vendor, vendorSkill)
    const invokeLinked = runner(linked, script(linked))
    expect(invokeLinked('validate', 'installed')).toMatchObject(preview)
    const resumed = invokeLinked('resume', runId, '--engine', 'codex')
    expect(invokeLinked('next', runId, '--lease', resumed.lease)).toMatchObject(dispatch)
    if (customWorkingArea)
      await verifyCardExclusion(root, linked, () => {
        expect(invokeLinked('stop', runId, '--lease', resumed.lease)).toMatchObject({
          stopped: true,
        })
      })
    expect(facts('board-state', '42', JSON.stringify({ state: 'Ready', adoption }))).toMatchObject({
      confirmed: true,
    })
  },
  20_000,
)
