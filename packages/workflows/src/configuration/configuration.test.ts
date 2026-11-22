import {
  applyOverride,
  checkAgainstEngines,
  describeSettings,
  firstExisting,
  parseConfiguration,
  parseWorkflow,
  selectConfiguration,
  settingsFor,
  type Configuration,
  type EngineFacts,
} from '..'

const FILE = '/p/claude-medium.yaml'
const BASE = `version: 1
name: claude-medium
defaults: { engine: claude, model: claude-sonnet-5-5, effort: medium }
aliases:
  judge: { model: claude-opus-5-5, effort: high }
steps:
  implement: { effort: low }
`
/** The aliases a workflow declares, with its defaults. */
const DECLARED = {
  build: { model: 'claude-haiku-5-5' },
  judge: { model: 'claude-sonnet-5-5', effort: 'medium' },
}
const parsed = (text = BASE): Configuration => {
  const result = parseConfiguration(text, FILE)
  if (result.configuration === undefined) throw new Error(JSON.stringify(result.errors))
  return result.configuration
}
const facts = (over: Partial<EngineFacts> = {}): EngineFacts => ({
  known: () => true,
  installed: () => true,
  models: () => undefined,
  supportsEffort: () => true,
  ...over,
})

describe('loop max override (#670 AC-8)', () => {
  const text = `${BASE}  rounds: { max: 5 }\n`
  it('accepts max for a loop id', () => {
    const configuration = parsed(text)
    expect(
      checkAgainstEngines(configuration, {
        file: FILE,
        facts: facts(),
        steps: [{ id: 'rounds', kind: 'loop' }],
        aliases: DECLARED,
      }).errors,
    ).toEqual([])
  })

  it('refuses max for an ordinary step and other options for a loop', () => {
    const configuration = parsed(text)
    expect(
      checkAgainstEngines(configuration, {
        file: FILE,
        facts: facts(),
        steps: [{ id: 'rounds', kind: 'review' }],
      }).errors.map(e => e.problem),
    ).toContain('max is only allowed for a loop id')
    const other = parsed(`${BASE}  rounds: { max: 5, model: codex-x }\n`)
    expect(
      checkAgainstEngines(other, {
        file: FILE,
        facts: facts(),
        steps: [{ id: 'rounds', kind: 'loop' }],
      }).errors.map(e => e.problem),
    ).toContain("only max can be overridden for loop 'rounds'")
  })

  it('refuses another loop key in configuration', () => {
    expect(
      parseConfiguration(`${BASE}  rounds: { until: review }\n`, FILE).errors.some(e =>
        e.problem.includes("unknown key 'until'"),
      ),
    ).toBe(true)
  })
})

describe('settings of a step (AC-1)', () => {
  const c = parsed()
  it.each([
    ['step over everything', { id: 'implement', alias: 'build' }, 'claude-haiku-5-5', 'low'],
    [
      'configuration alias over workflow default',
      { id: 'review', alias: 'judge' },
      'claude-opus-5-5',
      'high',
    ],
    ['workflow default over defaults', { id: 'fix', alias: 'build' }, 'claude-haiku-5-5', 'medium'],
    ['defaults with no alias', { id: 'x' }, 'claude-sonnet-5-5', 'medium'],
  ])('%s', (_, step, model, effort) => {
    expect(settingsFor(c, step, DECLARED)).toMatchObject({ model, effort })
  })

  it('names the layer of each field', () => {
    expect(describeSettings('fix', settingsFor(c, { id: 'fix', alias: 'build' }, DECLARED))).toBe(
      'fix: engine=claude (defaults) model=claude-haiku-5-5 (workflow) effort=medium (defaults)',
    )
    expect(
      describeSettings('implement', settingsFor(c, { id: 'implement', alias: 'judge' }, DECLARED)),
    ).toBe('implement: engine=claude (defaults) model=claude-opus-5-5 (alias) effort=low (step)')
  })

  it('resolves each field on its own, with mixed engines', () => {
    const s = settingsFor(parsed(`${BASE}  review: { engine: codex }\n`), {
      id: 'review',
      alias: 'judge',
    })
    expect(s).toMatchObject({ engine: 'codex', model: 'claude-opus-5-5', effort: 'high' })
    expect(describeSettings('review', s)).toBe(
      'review: engine=codex (step) model=claude-opus-5-5 (alias) effort=high (alias)',
    )
  })
})

describe('selection (AC-2, AC-3, AC-5)', () => {
  const workflows = {
    default: { configuration: { claude: 'claude-medium', codex: 'codex-medium' } },
    quick: { configuration: 'claude-cheap' },
  }
  const input = { engine: 'claude', workflow: 'delivery', workflows }
  it.each([
    [
      { ...input, flag: 'mine' },
      { name: 'mine', via: '--config' },
    ],
    [
      { ...input, workflow: 'quick' },
      { name: 'claude-cheap', via: 'pair.config.json workflows.quick' },
    ],
    [input, { name: 'claude-medium', via: 'pair.config.json workflows.default' }],
    [
      { ...input, engine: 'codex' },
      { name: 'codex-medium', via: 'pair.config.json workflows.default' },
    ],
    [
      { ...input, engineFlag: 'codex' },
      { name: 'codex-medium', via: 'pair.config.json workflows.default' },
    ],
    [{ engine: 'claude', workflow: 'delivery' }, undefined],
  ])('%j', (given, expected) => {
    expect(selectConfiguration(given)).toEqual(expected)
  })

  it('refuses a map without the engine', () => {
    expect(() => selectConfiguration({ ...input, engine: 'pi' })).toThrow('configuration-not-found')
  })

  it('a project file replaces the knowledge-base file of the same name', () => {
    const present = new Set(['/kb/c.yaml', '/p/c.yaml'])
    expect(firstExisting(['/p/c.yaml', '/kb/c.yaml'], x => present.has(x))).toBe('/p/c.yaml')
    expect(firstExisting(['/p/c.yaml', '/kb/c.yaml'], x => x === '/kb/c.yaml')).toBe('/kb/c.yaml')
  })

  it('refuses a configuration whose defaults.engine differs from --engine', () => {
    const { errors } = checkAgainstEngines(parsed(), {
      file: FILE,
      facts: facts(),
      engineFlag: 'codex',
    })
    expect(errors.map(e => e.key)).toEqual(['defaults.engine'])
  })
})

describe('validation (AC-4)', () => {
  it.each([
    ['unknown top-level key', `${BASE}extra: 1\n`],
    [
      'unknown field',
      BASE.replace(
        'effort: medium',
        'effort: medium, speed: 1'.replace(', speed: 1', ', speed: 1'),
      ),
    ],
    ['wrong type', BASE.replace('effort: medium', 'effort: 3')],
    ['a kinds section', BASE.replace('aliases:', 'kinds:')],
    ['name differs from file', BASE.replace('name: claude-medium', 'name: other')],
    ['an anchor', BASE.replace('defaults:', 'defaults: &a')],
    ['no defaults', 'version: 1\nname: claude-medium\n'],
  ])('error: %s', (_, text) => {
    expect(parseConfiguration(text, FILE).errors.length).toBeGreaterThan(0)
  })

  it('model not in the declared list is an error', () => {
    const { errors } = checkAgainstEngines(parsed(), {
      file: FILE,
      facts: facts({ models: () => ['claude-sonnet-5-5'] }),
    })
    expect(errors.map(e => e.key)).toEqual(['aliases.judge.model'])
  })

  it('no list: a malformed id is an error, a well-formed one a warning', () => {
    expect(
      checkAgainstEngines(parsed(BASE.replace('claude-opus-5-5', 'big model')), {
        file: FILE,
        facts: facts(),
      }).errors,
    ).toHaveLength(1)
    expect(
      checkAgainstEngines(parsed(), { file: FILE, facts: facts() }).warnings.length,
    ).toBeGreaterThan(0)
  })

  it('an effort that is not a plain level word is an error', () => {
    const { errors } = checkAgainstEngines(
      parsed(BASE.replace('effort: high', "effort: 'high\"; rm'")),
      {
        file: FILE,
        facts: facts(),
      },
    )
    expect(errors.map(e => e.key)).toEqual(['aliases.judge.effort'])
  })

  it('an alias the workflow does not declare is an error', () => {
    const steps = [{ id: 'implement', alias: 'build' }]
    expect(
      checkAgainstEngines(parsed(), { file: FILE, steps, aliases: DECLARED, facts: facts() })
        .errors,
    ).toEqual([])
    const { errors } = checkAgainstEngines(parsed(), {
      file: FILE,
      steps,
      aliases: { build: {} },
      facts: facts(),
    })
    expect(errors.map(e => [e.key, e.problem])).toEqual([
      ['aliases.judge', "alias 'judge' is not one the workflow declares"],
    ])
  })

  it('an engine used but not installed refuses; an unknown step id and an unsupported effort warn', () => {
    const steps = [{ id: 'implement' }]
    const result = checkAgainstEngines(parsed(`${BASE}  ghost: { effort: low }\n`), {
      file: FILE,
      steps,
      aliases: DECLARED,
      facts: facts({ installed: () => false, supportsEffort: () => false }),
    })
    expect(result.errors.map(e => e.problem)).toEqual(["engine 'claude' is not installed"])
    expect(result.warnings.map(w => w.key)).toEqual(
      expect.arrayContaining(['steps.ghost', 'defaults.effort']),
    )
  })

  it('an engine only an unused alias names is not required installed', () => {
    const steps = [{ id: 'implement', alias: 'build' }]
    const text = BASE.replace('judge: {', 'judge: { engine: codex,')
    const result = checkAgainstEngines(parsed(text), {
      file: FILE,
      steps,
      aliases: DECLARED,
      facts: facts({ installed: e => e === 'claude' }),
    })
    expect(result.errors).toEqual([])
  })
})

describe('override (AC-6)', () => {
  const base = { ...parsed() }
  it('deep-merges field by field and validates the result', () => {
    const out = applyOverride(base, '{"aliases":{"judge":{"model":"m2"}}}', FILE)
    if ('problem' in out) throw new Error(out.problem)
    expect(out.parsed.configuration?.aliases?.['judge']).toEqual({ model: 'm2', effort: 'high' })
    expect(out.parsed.configuration?.defaults.model).toBe('claude-sonnet-5-5')
  })

  it('an invalid merge is refused with errors', () => {
    const out = applyOverride(base, '{"aliases":{"judge":{"speed":1}}}', FILE)
    expect('parsed' in out && out.parsed.errors.length).toBeGreaterThan(0)
  })

  it.each(['{', '[1]'])('not a JSON object: %s', text => {
    expect(applyOverride(base, text, FILE)).toHaveProperty('problem')
  })

  it('with no base, needs a complete defaults', () => {
    const bare = applyOverride(undefined, '{"aliases":{"judge":{"model":"m"}}}', 'override.yaml')
    expect('parsed' in bare && bare.parsed.errors.length).toBeGreaterThan(0)
    const whole = applyOverride(undefined, '{"defaults":{"engine":"claude"}}', 'override.yaml')
    expect('parsed' in whole && whole.parsed.errors).toEqual([])
  })
})

describe('key telemetry (AC-9)', () => {
  it.each([true, false])('reads %s', value => {
    expect(parsed(`${BASE}telemetry: ${String(value)}\n`).telemetry).toBe(value)
  })
  it('refuses a non-boolean', () => {
    expect(
      parseConfiguration(`${BASE}telemetry: yes please\n`, FILE).errors.length,
    ).toBeGreaterThan(0)
  })
})

describe('the shipped set with quick (AC-8, AC-11)', () => {
  const files = import.meta.glob('../../../knowledge-hub/dataset/.pair/adoption/tech/*/*.yaml', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  const text = (path: string) => {
    const [file, source] = Object.entries(files).find(([key]) => key.endsWith(path)) ?? []
    if (file === undefined || source === undefined) throw new Error(`not shipped: ${path}`)
    return [source, file] as const
  }
  const { workflow } = parseWorkflow(...text('/workflows/quick.yaml'))
  const shipped = (name: string): Configuration => {
    const result = parseConfiguration(...text(`/configurations/${name}.yaml`))
    if (result.configuration === undefined) throw new Error(JSON.stringify(result.errors))
    return result.configuration
  }

  it('quick declares build (implement, fix) and judge (review)', () => {
    expect(Object.keys(workflow?.aliases ?? {})).toEqual(['build', 'judge'])
    expect(workflow?.steps.map(step => [step.id, step.alias])).toEqual([
      ['implement', 'build'],
      ['review', 'judge'],
      ['fix', 'build'],
    ])
  })

  it('ships the six profile equivalents and the two base configurations', () => {
    const names = Object.keys(files)
      .filter(path => path.includes('/configurations/'))
      .map(path => path.replace(/^.*\//, '').replace('.yaml', ''))
    expect(names.sort()).toEqual(
      [
        'claude',
        'claude-cheap',
        'claude-high',
        'claude-medium',
        'codex',
        'codex-cheap',
        'codex-high',
        'codex-medium',
      ].sort(),
    )
  })

  // Expected: the profile JSON of the same name, per stage (implement, verify, green), model classes resolved;
  // `claude` and `codex` as their medium.
  const profiles = import.meta.glob(
    '../../../knowledge-hub/dataset/.pair/adoption/tech/workflow-profiles/*.json',
    { import: 'default', eager: true },
  ) as Record<string, ProfileJson>
  type Pick3 = { model?: string; effort?: string }
  type ProfileJson = {
    defaults: Pick3
    modelClasses: Record<string, string>
    stages?: Record<string, Pick3>
  }
  const profileSettings = (name: string) => {
    const profile = Object.entries(profiles).find(([key]) => key.endsWith(`/${name}.json`))?.[1]
    if (profile === undefined) throw new Error(`no profile ${name}`)
    return ['implement', 'verify', 'green'].map(stage => {
      const merged = { ...profile.defaults, ...profile.stages?.[stage] }
      return [profile.modelClasses[merged.model ?? ''] ?? merged.model, merged.effort]
    })
  }
  // Deliberate deviations from the profile of the same name (#672): `claude` judges on sonnet medium;
  // the two cheap ones build and fix on the lightest model and judge one step up. Per step: [model, effort].
  type Settings = [string, string][]
  const DEVIATIONS: Record<string, Settings> = {
    claude: [
      ['claude-sonnet-5-5', 'medium'],
      ['claude-sonnet-5-5', 'medium'],
      ['claude-sonnet-5-5', 'medium'],
    ],
    'claude-cheap': [
      ['claude-haiku-5-5', 'medium'],
      ['claude-sonnet-5-5', 'medium'],
      ['claude-haiku-5-5', 'medium'],
    ],
    'codex-cheap': [
      ['gpt-6-luna', 'medium'],
      ['gpt-6.1-terra', 'medium'],
      ['gpt-6-luna', 'medium'],
    ],
  }
  it.each([
    ['claude-cheap', 'claude', 'claude-cheap'],
    ['claude-medium', 'claude', 'claude-medium'],
    ['claude-high', 'claude', 'claude-high'],
    ['claude', 'claude', 'claude-medium'],
    ['codex-cheap', 'codex', 'codex-cheap'],
    ['codex-medium', 'codex', 'codex-medium'],
    ['codex-high', 'codex', 'codex-high'],
    ['codex', 'codex', 'codex-medium'],
  ])('%s runs quick clean on %s, as the profile %s', (name, engine, profile) => {
    const expected = DEVIATIONS[name] ?? profileSettings(profile)
    const c = shipped(name)
    const steps = workflow?.steps ?? []
    expect(
      checkAgainstEngines(c, { file: name, steps, aliases: workflow?.aliases, facts: facts() })
        .errors,
    ).toEqual([])
    expect(
      steps.map(step => {
        const s = settingsFor(c, step, workflow?.aliases)
        return [s.engine, s.model, s.effort]
      }),
    ).toEqual(expected.map(([model, effort]) => [engine, model, effort]))
  })
})
