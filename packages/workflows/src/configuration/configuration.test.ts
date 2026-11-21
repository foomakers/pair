import {
  applyOverride,
  checkAgainstEngines,
  describeSettings,
  firstExisting,
  parseConfiguration,
  selectConfiguration,
  settingsFor,
  type Configuration,
  type EngineFacts,
} from '..'

const FILE = '/p/claude-medium.yaml'
const BASE = `version: 1
name: claude-medium
defaults: { engine: claude, model: claude-sonnet-5-5, effort: medium }
kinds:
  review: { model: claude-opus-5-5, effort: high }
steps:
  implement: { effort: low }
`
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

describe('settings of a step (AC-1)', () => {
  const c = parsed()
  it.each([
    ['step over kind and defaults', { id: 'implement', kind: 'implement' as const }, 'low', 'step'],
    ['kind over defaults', { id: 'code-review', kind: 'review' as const }, 'high', 'kind'],
    ['defaults', { id: 'x', kind: 'fix' as const }, 'medium', 'defaults'],
  ])('%s', (_, step, effort, source) => {
    const s = settingsFor(c, step)
    expect(s.effort).toBe(effort)
    expect(s.sources.effort).toBe(source)
  })

  it('resolves each field on its own, with mixed engines', () => {
    const s = settingsFor(
      parsed(`${BASE}  review: { engine: codex }\n`.replace('steps:\n', 'steps:\n')),
      { id: 'review', kind: 'review' },
    )
    expect(s).toMatchObject({ engine: 'codex', model: 'claude-opus-5-5', effort: 'high' })
    expect(describeSettings('review', s)).toBe(
      'review: engine=codex (step) model=claude-opus-5-5 (kind) effort=high (kind)',
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
    ['unknown kind', BASE.replace('review:', 'plan:')],
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
    expect(errors.map(e => e.key)).toEqual(['kinds.review.model'])
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

  it('an engine used but not installed refuses; an unknown step id and an unsupported effort warn', () => {
    const steps = [{ id: 'implement', kind: 'implement' as const }]
    const result = checkAgainstEngines(parsed(`${BASE}  ghost: { effort: low }\n`), {
      file: FILE,
      steps,
      facts: facts({ installed: () => false, supportsEffort: () => false }),
    })
    expect(result.errors.map(e => e.problem)).toEqual(["engine 'claude' is not installed"])
    expect(result.warnings.map(w => w.key)).toEqual(
      expect.arrayContaining(['steps.ghost', 'defaults.effort']),
    )
  })

  it('an engine only an unused kind names is not required installed', () => {
    const steps = [{ id: 'implement', kind: 'implement' as const }]
    const text = BASE.replace('review: {', 'review: { engine: codex,')
    const result = checkAgainstEngines(parsed(text), {
      file: FILE,
      steps,
      facts: facts({ installed: e => e === 'claude' }),
    })
    expect(result.errors).toEqual([])
  })
})

describe('override (AC-6)', () => {
  const base = { ...parsed() }
  it('deep-merges field by field and validates the result', () => {
    const out = applyOverride(base, '{"kinds":{"review":{"model":"m2"}}}', FILE)
    if ('problem' in out) throw new Error(out.problem)
    expect(out.parsed.configuration?.kinds?.review).toEqual({ model: 'm2', effort: 'high' })
    expect(out.parsed.configuration?.defaults.model).toBe('claude-sonnet-5-5')
  })

  it('an invalid merge is refused with errors', () => {
    const out = applyOverride(base, '{"kinds":{"nope":{}}}', FILE)
    expect('parsed' in out && out.parsed.errors.length).toBeGreaterThan(0)
  })

  it.each(['{', '[1]'])('not a JSON object: %s', text => {
    expect(applyOverride(base, text, FILE)).toHaveProperty('problem')
  })

  it('with no base, needs a complete defaults', () => {
    const bare = applyOverride(undefined, '{"kinds":{"review":{"model":"m"}}}', 'override.yaml')
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
