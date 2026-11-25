import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  resolveWorkflowProfile,
  resolveProfileStage,
  stageSettings,
  stageEngineIds,
  workflowProfileRequested,
  validateProfileRun,
} from './workflow-profile'

/**
 * US-488 — the TypeScript side of the ONE shared resolver: `pair-cli` calls the installed
 * `workflow-profile.mjs` (never a second implementation) and reads its answer. Every scenario runs
 * the REAL script over a real temporary project.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const SCRIPTS = join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts')

describe('resolveWorkflowProfile — the shared resolver, through the real script (US-488)', () => {
  let root: string
  const write = (rel: string, body: unknown) => {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), typeof body === 'string' ? body : JSON.stringify(body))
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-wfp-')))
    write('pair.config.json', {
      workflowProfiles: { default: 'claude-cheap', files: 'profiles/*.json' },
    })
    write('profiles/claude-cheap.json', {
      name: 'claude-cheap',
      defaults: { engine: 'pi', effort: 'medium' },
      modelClasses: { cheap: 'm-cheap', frontier: 'm-front' },
      stages: {
        prepare: { model: 'cheap', context: 'reuse' },
        green: { model: 'cheap', context: 'reuse' },
        validate: { model: 'frontier', engine: 'claude' },
        verify: { model: 'frontier', effort: 'high' },
      },
    })
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('resolves the configured default, printing-ready: name, source, hash, table', () => {
    const p = resolveWorkflowProfile(SCRIPTS, { root, tier: 'risk:yellow' })

    expect(p.name).toBe('claude-cheap')
    expect(p.source).toBe('pair.config.json')
    expect(p.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(p.table[0]).toMatch(/^Profile: claude-cheap \(source: pair\.config\.json/)
    expect(p.table.join('\n')).toContain('m-cheap')
  })

  it('--profile is reported as `argument`; --workflow-config wins over it', () => {
    write('ext.json', { name: 'ext' })

    expect(resolveWorkflowProfile(SCRIPTS, { root, profile: 'claude-cheap' }).source).toBe(
      'argument',
    )
    const external = resolveWorkflowProfile(SCRIPTS, {
      root,
      profile: 'claude-cheap',
      workflowConfig: 'ext.json',
    })
    expect([external.name, external.source]).toEqual(['ext', '--workflow-config'])
  })

  it('an unresolvable name throws profile-unresolved naming what was searched — never the KB default', () => {
    expect(() => resolveWorkflowProfile(SCRIPTS, { root, profile: 'nope' })).toThrow(
      /profile-unresolved: .*nope.*profiles\/\*\.json/,
    )
  })

  it('an invalid profile throws profile-invalid before anything can dispatch', () => {
    write('bad.json', { name: 'bad', stages: { verify: { context: 'reuse' } } })

    expect(() => resolveWorkflowProfile(SCRIPTS, { root, workflowConfig: 'bad.json' })).toThrow(
      /profile-invalid: .*stages\.verify\.context/,
    )
  })

  it('stageSettings: the stage engine, resolved model id and effort — `default` means the run’s own', () => {
    const p = resolveWorkflowProfile(SCRIPTS, { root })

    expect(stageSettings(p, 'validate')).toEqual({
      engine: 'claude',
      model: 'm-front',
      effort: 'medium',
    })
    expect(stageSettings(p, 'verify')).toEqual({ engine: 'pi', model: 'm-front', effort: 'high' })
    expect(stageSettings(p, 'defaults')).toEqual({ engine: 'pi', effort: 'medium' })
    const kb = resolveWorkflowProfile(SCRIPTS, {
      root: mkdtempSync(join(tmpdir(), 'pair-wfp-kb-')),
    })
    expect(stageSettings(kb, 'implement')).toEqual({})
  })

  it('stageEngineIds: every distinct non-default engine the profile uses; an unknown id is profile-invalid', () => {
    const p = resolveWorkflowProfile(SCRIPTS, { root })
    expect(stageEngineIds(p, ['pi', 'claude'])).toEqual(['pi', 'claude'])
    expect(() => stageEngineIds(p, ['pi'])).toThrow(
      /profile-invalid: stages\.validate\.engine: unknown engine 'claude' \(supported: pi\)/,
    )
  })

  it('AC-5: a command-line profile needs an engine when every stage leaves it open', () => {
    write('engine-less.json', {
      name: 'engine-less',
      stages: { implement: { model: 'claude-sonnet-4-5' } },
    })
    const p = resolveWorkflowProfile(SCRIPTS, { root, workflowConfig: 'engine-less.json' })
    expect(() => validateProfileRun(p, { commandLine: true })).toThrow(
      /stages\.prepare\.engine.*--engine/,
    )
    expect(() => validateProfileRun(p, { commandLine: true, engineFlag: 'claude' })).not.toThrow()
    expect(() => validateProfileRun(p, { commandLine: false })).not.toThrow()
    write('partial-engine.json', {
      name: 'partial-engine',
      stages: { implement: { engine: 'claude' } },
    })
    const partial = resolveWorkflowProfile(SCRIPTS, { root, workflowConfig: 'partial-engine.json' })
    expect(() => validateProfileRun(partial, { commandLine: true })).toThrow(
      /stages\.prepare\.engine.*--engine/,
    )
  })

  it('AC-5: --engine contradicting a selected stage is refused with its field and remedy', () => {
    const p = resolveWorkflowProfile(SCRIPTS, { root })
    expect(() => validateProfileRun(p, { commandLine: true, engineFlag: 'claude' })).toThrow(
      /stages\.prepare\.engine.*pi.*--engine.*claude/,
    )
  })

  it('AC-8: a model cannot be sent to an engine that cannot run it', () => {
    write('wrong-model.json', {
      name: 'wrong-model',
      stages: { implement: { engine: 'codex', model: 'claude-sonnet-4-5' } },
    })
    const p = resolveWorkflowProfile(SCRIPTS, { root, workflowConfig: 'wrong-model.json' })
    expect(() => validateProfileRun(p, { commandLine: true, engineFlag: 'codex' })).toThrow(
      /stages\.implement\.model.*claude-sonnet-4-5.*codex/,
    )
  })

  it('#617 AC-2: --engine selects its agent model above run defaults without a false contradiction', () => {
    write('pair.config.json', {
      run: {
        defaults: { engine: 'claude', model: 'claude-run' },
        agents: { codex: { model: 'gpt-6-sol' } },
      },
    })
    const p = resolveWorkflowProfile(SCRIPTS, { root, engine: 'codex' })
    expect(p.stages['implement']?.model.resolved.id).toBe('gpt-6-sol')
    expect(() => validateProfileRun(p, { commandLine: false, engineFlag: 'codex' })).not.toThrow()
  })

  it('#617 r0-7: explicit engine-less selection cannot borrow run defaults.engine', () => {
    write('pair.config.json', { run: { defaults: { engine: 'claude' } } })
    write('engine-less.json', { name: 'engine-less', defaults: { model: 'sonnet' } })
    const p = resolveWorkflowProfile(SCRIPTS, { root, workflowConfig: 'engine-less.json' })
    expect(() => validateProfileRun(p, { commandLine: true, runEngine: 'claude' })).toThrow(
      /engine.*--engine/,
    )
    expect(() => validateProfileRun(p, { commandLine: false, runEngine: 'claude' })).not.toThrow()
  })

  it('#617 r0-2: off-cycle defaults are validated against the concrete fallback engine', () => {
    write('pair.config.json', {
      workflowProfiles: {
        default: 'p',
        inline: {
          p: {
            name: 'p',
            defaults: { model: 'gpt-6-sol' },
            stages: Object.fromEntries(
              [
                'prepare',
                'validate',
                'implement',
                'green',
                'verify',
                'contract',
                'merge',
                'refine-story',
                'plan-tasks',
                'triage',
                'classify',
              ].map(id => [id, { model: 'sonnet' }]),
            ),
          },
        },
      },
    })
    const p = resolveWorkflowProfile(SCRIPTS, { root })
    expect(() => validateProfileRun(p, { commandLine: false, runEngine: 'claude' })).toThrow(
      /defaults.model.*gpt-6-sol.*claude/,
    )
  })

  it('#617 r0-13: disabled process stages cannot contradict enabled dispatch', () => {
    write(
      '.pair/adoption/tech/way-of-working.md',
      '## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: `implement`, `review`\n',
    )
    write('disabled.json', {
      name: 'disabled',
      defaults: { engine: 'claude' },
      stages: { 'refine-story': { engine: 'codex' } },
    })
    const p = resolveWorkflowProfile(SCRIPTS, { root, workflowConfig: 'disabled.json' })
    expect(() => validateProfileRun(p, { commandLine: true, engineFlag: 'claude' })).not.toThrow()
    expect(p.notes.join(' ')).toMatch(
      /refine-story.*(?:disabled|ignored)|(?:disabled|ignored).*refine-story/,
    )
  })

  it('globs resolve identically on every platform (darwin and linux differ in filesystem case-sensitivity): matching is by the listed name, exactly, in a root with spaces', () => {
    const spaced = join(root, 'my project')
    write('my project/profiles/claude-cheap.json', { name: 'claude-cheap' })
    const declare = (files: string) =>
      write('my project/pair.config.json', { workflowProfiles: { files } })

    declare('profiles/*.json')
    expect(resolveWorkflowProfile(SCRIPTS, { root: spaced, profile: 'claude-cheap' }).name).toBe(
      'claude-cheap',
    )
    // A differently-cased glob must not match here either: a case-insensitive volume would otherwise
    // find the profile on macOS and lose it on Linux CI.
    declare('Profiles/*.json')
    expect(() =>
      resolveWorkflowProfile(SCRIPTS, { root: spaced, profile: 'claude-cheap' }),
    ).toThrow(/profile-unresolved/)
  })

  it('workflowProfileRequested: only a flag or a declared workflowProfiles block asks for a profile (AC9)', () => {
    expect(workflowProfileRequested({}, {})).toBe(false)
    expect(workflowProfileRequested({}, { engine: { id: 'pi' } })).toBe(false)
    expect(workflowProfileRequested({}, { run: { defaults: { engine: 'pi' } } })).toBe(true)
    expect(
      workflowProfileRequested({}, { run: { agents: { pi: { model: 'provider/model' } } } }),
    ).toBe(true)
    expect(workflowProfileRequested({ profile: 'x' }, {})).toBe(true)
    expect(workflowProfileRequested({ workflowConfig: 'x' }, {})).toBe(true)
    expect(workflowProfileRequested({}, { workflowProfiles: { default: 'x' } })).toBe(true)
  })

  it('maps a process-step marker and batch mode to the selected stage (AC-3)', async () => {
    const { stageFor } = await import(join(SCRIPTS, 'workflow-profile.mjs'))
    expect(stageFor({ skillText: '<!-- process-step: id=refine-story -->' })).toBe('refine-story')
    expect(stageFor({ batchMode: 'triage' })).toBe('triage')
    expect(stageFor({ skillText: '# Unmapped skill' })).toBe('defaults')
    expect(resolveProfileStage(SCRIPTS, '<!-- process-step: id=plan-tasks -->')).toBe('plan-tasks')
  })

  it('conditional sharing applies at the named risk tier, while verify stays fresh (AC-14)', () => {
    write('conditional.json', {
      name: 'conditional',
      stages: {
        implement: { context: { 'shared-with': 'prepare', when: { risk: 'yellow' } } },
        verify: { context: 'fresh' },
      },
    })
    const yellow = resolveWorkflowProfile(SCRIPTS, {
      root,
      workflowConfig: 'conditional.json',
      tier: 'risk:yellow',
    })
    const red = resolveWorkflowProfile(SCRIPTS, {
      root,
      workflowConfig: 'conditional.json',
      tier: 'risk:red',
    })
    expect(yellow.contextPolicy['prepare->implement']).toBe('reuse')
    expect(red.contextPolicy['prepare->implement']).toBeUndefined()
    expect(yellow.stages['verify']?.context.value).toBe('fresh')
  })

  it('rejects a validate sharing rule that includes red risk (AC-14)', () => {
    write('unsafe.json', {
      name: 'unsafe',
      stages: {
        validate: { context: { 'shared-with': 'prepare', when: { risk: ['yellow', 'red'] } } },
      },
    })
    expect(() => resolveWorkflowProfile(SCRIPTS, { root, workflowConfig: 'unsafe.json' })).toThrow(
      /stages\.validate\.context.*risk:red.*fresh/,
    )
  })
})

it('#617 r0-11: external engine-less host remedy survives CLI parser and predispatch validation', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-host-remedy-')))
  try {
    writeFileSync(
      join(root, 'p.json'),
      JSON.stringify({ name: 'p', defaults: { model: 'claude-sonnet-5-5' } }),
    )
    const p = resolveWorkflowProfile(SCRIPTS, { root, workflowConfig: 'p.json' })
    const { gapsForHost } = await import(join(SCRIPTS, 'workflow-profile.mjs'))
    const gap = gapsForHost(p, 'codex', '617').find(
      (g: { stage: string }) => g.stage === 'implement',
    )
    const tokens = gap.command
      .match(/"(?:\\.|[^"\\])*"|[^\s]+/g)
      .map((token: string) => (token.startsWith('"') ? JSON.parse(token) : token))
    expect(tokens.slice(0, 2)).toEqual(['pair-cli', 'run'])
    const flags = Object.fromEntries(
      Array.from({ length: (tokens.length - 2) / 2 }, (_, index) => [
        tokens[2 + index * 2],
        tokens[3 + index * 2],
      ]),
    )
    const { parseRunCommand } = await import('./parser.js')
    const parsed = parseRunCommand({
      card: flags['--card'],
      workflowConfig: flags['--workflow-config'],
      engine: flags['--engine'],
    })
    expect(parsed.dispatch?.card).toBe('617')
    const routed = resolveWorkflowProfile(SCRIPTS, {
      root,
      workflowConfig: parsed.workflowConfig,
      engine: parsed.engine,
    })
    expect(() =>
      validateProfileRun(routed, {
        commandLine: true,
        ...(parsed.engine && { engineFlag: parsed.engine }),
      }),
    ).not.toThrow()
    expect(routed.stages['implement']?.model.resolved.id).toBe('claude-sonnet-5-5')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it.each([
  { title: 'named plain reuse', entry: { stages: { validate: { context: 'reuse' } } } },
  {
    title: 'conditional defaults',
    entry: {
      defaults: {
        context: { 'shared-with': 'prepare', when: { risk: ['green', 'yellow', 'red'] } },
      },
    },
  },
])('#617 AC-14: cached red view refuses $title before dispatch', async ({ entry }) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-context-snapshot-')))
  try {
    writeFileSync(
      join(root, 'pair.config.json'),
      JSON.stringify({
        workflowProfiles: {
          default: 'p',
          inline: { p: { name: 'p', ...entry } },
        },
      }),
    )
    const snapshot = resolveWorkflowProfile(SCRIPTS, { root })
    const { profileForTier } = await import('./workflow-profile.js')
    for (const tier of ['risk:green', 'risk:yellow']) {
      expect(() =>
        validateProfileRun(profileForTier(snapshot, tier), { commandLine: false }),
      ).not.toThrow()
    }
    expect(() =>
      validateProfileRun(profileForTier(snapshot, 'risk:red'), { commandLine: false }),
    ).toThrow(/profile-invalid.*validate.context.*risk:red.*fresh/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it.each([
  { selection: 'external', host: 'claude' },
  { selection: 'external', host: 'unknown' },
  { selection: 'config default', host: 'claude' },
  { selection: 'config default', host: 'unknown' },
])(
  '#617 r0-11: $selection mixed-engine remedy on $host preserves the whole runnable profile',
  async ({ selection, host }) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-mixed-remedy-')))
    try {
      const profile = {
        name: 'mixed',
        ...(selection === 'external'
          ? {
              defaults: { engine: 'claude', model: 'sonnet' },
            }
          : {}),
        stages: { implement: { engine: 'codex', model: 'gpt-6-sol' } },
      }
      writeFileSync(join(root, 'mixed.json'), JSON.stringify(profile))
      if (selection === 'config default')
        writeFileSync(
          join(root, 'pair.config.json'),
          JSON.stringify({
            workflowProfiles: { default: 'mixed', inline: { mixed: profile } },
          }),
        )
      const initial = resolveWorkflowProfile(SCRIPTS, {
        root,
        ...(selection === 'external' && { workflowConfig: 'mixed.json' }),
      })
      expect(() =>
        validateProfileRun(initial, { commandLine: selection === 'external' }),
      ).not.toThrow()
      const { gapsForHost } = await import(join(SCRIPTS, 'workflow-profile.mjs'))
      const gap = gapsForHost(initial, host, '617').find(
        (g: { stage: string }) => g.stage === 'implement',
      )
      const tokens = gap.command
        .match(/"(?:\\.|[^"\\])*"|[^\s]+/g)
        .map((token: string) => (token.startsWith('"') ? JSON.parse(token) : token))
      expect(tokens.slice(0, 2)).toEqual(['pair-cli', 'run'])
      const flags = Object.fromEntries(
        Array.from({ length: (tokens.length - 2) / 2 }, (_, i) => [
          tokens[2 + i * 2],
          tokens[3 + i * 2],
        ]),
      )
      const { parseRunCommand } = await import('./parser.js')
      const parsed = parseRunCommand({
        card: flags['--card'],
        profile: flags['--profile'],
        workflowConfig: flags['--workflow-config'],
        engine: flags['--engine'],
      })
      expect(parsed.dispatch?.card).toBe('617')
      const routed = resolveWorkflowProfile(SCRIPTS, {
        root,
        profile: parsed.profile,
        workflowConfig: parsed.workflowConfig,
        engine: parsed.engine,
      })
      expect(routed.hash).toBe(initial.hash)
      expect(() =>
        validateProfileRun(routed, {
          commandLine: parsed.profile !== undefined || parsed.workflowConfig !== undefined,
          ...(parsed.engine && { engineFlag: parsed.engine }),
        }),
      ).not.toThrow()
      expect(
        Object.fromEntries(
          Object.keys(initial.stages).map(stage => [stage, stageSettings(routed, stage)]),
        ),
      ).toEqual(
        Object.fromEntries(
          Object.keys(initial.stages).map(stage => [stage, stageSettings(initial, stage)]),
        ),
      )
      expect(stageEngineIds(routed, ['claude', 'codex']).sort()).toEqual(
        ['codex'].concat(selection === 'external' ? ['claude'] : []).sort(),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
)

it.each([{ selection: 'external' }, { selection: 'config default' }])(
  '#617 r0-11: implement batch remedy preserves its $selection mixed profile',
  async ({ selection }) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-batch-remedy-')))
    try {
      const profile = {
        name: 'mixed',
        ...(selection === 'external'
          ? {
              defaults: { engine: 'claude', model: 'sonnet' },
            }
          : {}),
        stages: { implement: { engine: 'codex', model: 'gpt-6-sol' } },
      }
      writeFileSync(join(root, 'mixed.json'), JSON.stringify(profile))
      if (selection === 'config default')
        writeFileSync(
          join(root, 'pair.config.json'),
          JSON.stringify({
            workflowProfiles: { default: 'mixed', inline: { mixed: profile } },
          }),
        )
      const initial = resolveWorkflowProfile(SCRIPTS, {
        root,
        ...(selection === 'external' && { workflowConfig: 'mixed.json' }),
      })
      expect(() =>
        validateProfileRun(initial, { commandLine: selection === 'external' }),
      ).not.toThrow()
      const source = readFileSync(
        join(REPO_ROOT, '.claude/workflows', 'pair-implement-batch.js'),
        'utf8',
      ).replace(/^export /gm, '')
      const evaluate = new Function(
        'args',
        'agent',
        'parallel',
        'pipeline',
        'log',
        `return (async () => {${source}})()`,
      ) as (...args: unknown[]) => Promise<unknown>
      const calls: string[] = []
      let gap = ''
      try {
        await evaluate(
          {
            cards: [
              {
                id: '617',
                title: 'Mixed profile',
                branch: 'feature/US-617-mixed',
                tier: 'risk:yellow',
              },
            ],
            policyText: '',
          },
          async (_prompt: string, opts: { label: string }) => {
            calls.push(opts.label)
            return initial
          },
          () => {
            throw new Error('unexpected work dispatch')
          },
          () => {
            throw new Error('unexpected work dispatch')
          },
          () => {},
        )
      } catch (error) {
        gap = error instanceof Error ? error.message : String(error)
      }
      expect(calls).toEqual(['profile:resolve'])
      const command = /Run (pair-cli run .*); no (?:story|card) dispatched/.exec(gap)?.[1]
      expect(command).toBeDefined()
      const tokens = command!
        .match(/"(?:\\.|[^"\\])*"|[^\s]+/g)!
        .map(token => (token.startsWith('"') ? (JSON.parse(token) as string) : token))
      const flags = Object.fromEntries(
        Array.from({ length: (tokens.length - 2) / 2 }, (_, i) => [
          tokens[2 + i * 2],
          tokens[3 + i * 2],
        ]),
      )
      const { parseRunCommand } = await import('./parser.js')
      const parsed = parseRunCommand({
        card: flags['--card'],
        profile: flags['--profile'],
        workflowConfig: flags['--workflow-config'],
        engine: flags['--engine'],
      })
      expect(parsed.dispatch?.card).toBe('617')
      const routed = resolveWorkflowProfile(SCRIPTS, {
        root,
        profile: parsed.profile,
        workflowConfig: parsed.workflowConfig,
        engine: parsed.engine,
      })
      expect(routed.hash).toBe(initial.hash)
      expect(() =>
        validateProfileRun(routed, {
          commandLine: parsed.profile !== undefined || parsed.workflowConfig !== undefined,
          ...(parsed.engine && { engineFlag: parsed.engine }),
        }),
      ).not.toThrow()
      expect(
        Object.fromEntries(
          Object.keys(initial.stages).map(stage => [stage, stageSettings(routed, stage)]),
        ),
      ).toEqual(
        Object.fromEntries(
          Object.keys(initial.stages).map(stage => [stage, stageSettings(initial, stage)]),
        ),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
)

it('#617 engine default map: host remedy pins the selected mixed profile across CLI fallback', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-map-remedy-')))
  try {
    writeFileSync(
      join(root, 'pair.config.json'),
      JSON.stringify({
        workflowProfiles: {
          default: { codex: 'mixed', claude: 'other' },
          inline: {
            mixed: {
              name: 'mixed',
              defaults: { engine: 'claude', model: 'sonnet' },
              stages: { implement: { engine: 'codex', model: 'gpt-6-sol' } },
            },
            other: { name: 'other', defaults: { engine: 'claude', model: 'opus' } },
          },
        },
      }),
    )
    const { resolveProfile, gapsForHost } = await import(join(SCRIPTS, 'workflow-profile.mjs'))
    const initial = resolveProfile({ root, host: 'codex' })
    expect(initial.name).toBe('mixed')
    const command = gapsForHost(initial, 'codex', '617').find(
      (gap: { stage: string }) => gap.stage === 'verify',
    ).command
    const tokens = command
      .match(/"(?:\\.|[^"\\])*"|[^\s]+/g)
      .map((token: string) => (token.startsWith('"') ? JSON.parse(token) : token))
    const flags = Object.fromEntries(
      Array.from({ length: (tokens.length - 2) / 2 }, (_, i) => [
        tokens[2 + i * 2],
        tokens[3 + i * 2],
      ]),
    )
    const { parseRunCommand } = await import('./parser.js')
    const parsed = parseRunCommand({
      card: flags['--card'],
      profile: flags['--profile'],
      engine: flags['--engine'],
    })
    const routed = resolveWorkflowProfile(SCRIPTS, {
      root,
      profile: parsed.profile,
      engine: parsed.engine,
    })
    expect(parsed.dispatch?.card).toBe('617')
    expect(routed.name).toBe('mixed')
    expect(routed.hash).toBe(initial.hash)
    expect(() =>
      validateProfileRun(routed, {
        commandLine: parsed.profile !== undefined,
        ...(parsed.engine && { engineFlag: parsed.engine }),
      }),
    ).not.toThrow()
    expect(stageSettings(routed, 'verify')).toEqual({ engine: 'claude', model: 'sonnet' })
    expect(stageSettings(routed, 'implement')).toEqual({ engine: 'codex', model: 'gpt-6-sol' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it('#617 r0-9/11: implement batch remedy uses the card tier engine binding', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-tier-remedy-')))
  try {
    mkdirSync(join(root, '.pair/adoption/tech'), { recursive: true })
    writeFileSync(
      join(root, '.pair/adoption/tech/automation.md'),
      '## Model Policy\n\nrisk:red: frontier\n',
    )
    writeFileSync(
      join(root, 'pair.config.json'),
      JSON.stringify({
        workflowProfiles: {
          default: 'p',
          inline: {
            p: {
              name: 'p',
              defaults: { model: 'by-tier' },
              modelClasses: { frontier: 'gpt-6-sol' },
            },
          },
        },
      }),
    )
    const initial = resolveWorkflowProfile(SCRIPTS, { root })
    const source = readFileSync(
      join(REPO_ROOT, 'packages/knowledge-hub/dataset/.workflows', 'pair-implement-batch.js'),
      'utf8',
    ).replace(/^export /gm, '')
    const evaluate = new Function(
      'args',
      'agent',
      'parallel',
      'pipeline',
      'log',
      `return (async () => {${source}})()`,
    ) as (...args: unknown[]) => Promise<unknown>
    let gap = ''
    try {
      await evaluate(
        {
          cards: [{ id: '617', title: 'Red tier', branch: 'feature/US-617-red', tier: 'risk:red' }],
          policyText: '',
        },
        async () => initial,
        () => {
          throw new Error('unexpected work dispatch')
        },
        () => {
          throw new Error('unexpected work dispatch')
        },
        () => {},
      )
    } catch (error) {
      gap = error instanceof Error ? error.message : String(error)
    }
    const command = /Run (pair-cli run .*); no (?:story|card) dispatched/.exec(gap)?.[1]
    expect(command).toBeDefined()
    const tokens = command!
      .match(/"(?:\\.|[^"\\])*"|[^\s]+/g)!
      .map(token => (token.startsWith('"') ? (JSON.parse(token) as string) : token))
    const flags = Object.fromEntries(
      Array.from({ length: (tokens.length - 2) / 2 }, (_, i) => [
        tokens[2 + i * 2],
        tokens[3 + i * 2],
      ]),
    )
    const { parseRunCommand } = await import('./parser.js')
    const parsed = parseRunCommand({
      card: flags['--card'],
      profile: flags['--profile'],
      engine: flags['--engine'],
    })
    const routed = resolveWorkflowProfile(SCRIPTS, {
      root,
      profile: parsed.profile,
      engine: parsed.engine,
      tier: 'risk:red',
    })
    expect(parsed.dispatch?.card).toBe('617')
    expect(routed.hash).toBe(initial.hash)
    expect(() =>
      validateProfileRun(routed, {
        commandLine: parsed.profile !== undefined,
        ...(parsed.engine && { engineFlag: parsed.engine }),
      }),
    ).not.toThrow()
    expect(stageSettings(routed, 'implement')).toEqual({
      engine: 'codex',
      model: 'gpt-6-sol',
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
