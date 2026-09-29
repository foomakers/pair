// US-488 — per-stage engine/model/effort/context profiles: the shared resolver both coordinators
// call (pair-workflow-cycle's skill and `pair-cli run --card`). Every scenario runs the real module
// against real temporary files; the `context` rule is asserted against the REAL cycle-state.mjs table.
// RUNS FROM `.claude/workflows` ONLY (same rule as cycle-state.test.mjs): `pnpm workflows:test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { validateProfile, effectiveStage, resolveProfile, bindProfile, describeProfile, profileContextPolicy, ProfileError, STAGES, KB_DEFAULT } from '../../skills/pair-workflow-cycle/scripts/workflow-profile.mjs'
import { CONTEXT_TABLE, publish, resolve, effectiveInputs } from '../../skills/pair-workflow-cycle/scripts/cycle-state.mjs'

const errorsOf = p => validateProfile(p).errors

// ── T-1: shape + validator (AC1, AC5) ────────────────────────────────────────────────────────
test('T-1/AC1: a minimal {name, defaults} profile is valid and needs no stages', () => {
  assert.deepEqual(errorsOf({ name: 'min', defaults: { engine: 'pi', model: 'x', effort: 'low', context: 'fresh' } }), [])
})

test('T-1/AC1: a stage entry overrides only the fields it declares; the rest fall back to defaults', () => {
  const p = { name: 'cheap-green', defaults: { engine: 'pi', model: 'big', effort: 'high', context: 'fresh' }, stages: { green: { model: 'small', context: 'reuse' } } }
  assert.deepEqual(errorsOf(p), [])
  assert.deepEqual(effectiveStage(p, 'green'), {
    engine: { value: 'pi', source: 'defaults' },
    model: { value: 'small', source: 'stage' },
    effort: { value: 'high', source: 'defaults' },
    context: { value: 'reuse', source: 'stage' },
  })
  assert.deepEqual(effectiveStage(p, 'verify').model, { value: 'big', source: 'defaults' })
})

test('T-1/AC1: a field neither stage nor defaults declares falls back to the KB default', () => {
  const s = effectiveStage({ name: 'n' }, 'implement')
  assert.deepEqual(s.context, { value: 'fresh', source: 'KB default' })
  assert.deepEqual(s.model, { value: KB_DEFAULT.model, source: 'KB default' })
})

test('T-1: every stage id of the story shape is known', () => {
  assert.deepEqual(STAGES, ['prepare', 'validate', 'implement', 'green', 'verify', 'contract', 'merge'])
})

test('T-1: an unknown stage id is profile-invalid and names the stage', () => {
  const errs = errorsOf({ name: 'p', stages: { verfy: { model: 'x' } } })
  assert.equal(errs.length, 1)
  assert.match(errs[0], /unknown stage 'verfy'/)
})

test('T-1: an unknown top-level key, unknown stage field, bad effort/context value or missing name is rejected', () => {
  assert.match(errorsOf({ name: 'p', extra: 1 })[0], /unknown key 'extra'/)
  assert.match(errorsOf({ name: 'p', stages: { green: { temperature: 1 } } })[0], /stages\.green: unknown field 'temperature'/)
  assert.match(errorsOf({ name: 'p', defaults: { effort: 'turbo' } })[0], /defaults\.effort/)
  assert.match(errorsOf({ name: 'p', defaults: { context: 'maybe' } })[0], /defaults\.context/)
  assert.match(errorsOf({ defaults: {} })[0], /name/)
  assert.match(errorsOf('nope')[0], /object/)
})

test('T-1/AC5: reuse into validate or verify is rejected, naming the stage, before any dispatch', () => {
  for (const stage of ['validate', 'verify']) {
    const errs = errorsOf({ name: 'p', stages: { [stage]: { context: 'reuse' } } })
    assert.equal(errs.length, 1, stage)
    assert.match(errs[0], new RegExp(`stages\\.${stage}\\.context: 'reuse' is not admissible`))
  }
})

test('T-1/AC5: admissibility IS the real cycle-state.mjs table — every transition it allows makes its target stage legal, every other stage is refused', () => {
  const allowedTargets = new Set(CONTEXT_TABLE.reuseAllowed.map(t => t.split('->')[1]))
  for (const stage of STAGES) {
    const errs = errorsOf({ name: 'p', stages: { [stage]: { context: 'reuse' } } })
    assert.equal(errs.length === 0, allowedTargets.has(stage), `${stage}: ${errs.join(';')}`)
  }
})

test('T-1/AC5: a defaults-level reuse is not an error — it applies only where the table admits it', () => {
  const p = { name: 'p', defaults: { context: 'reuse' } }
  assert.deepEqual(errorsOf(p), [])
  assert.equal(effectiveStage(p, 'green').context.value, 'reuse')
  assert.equal(effectiveStage(p, 'verify').context.value, 'fresh')
})

test('T-1: workflow-profile.mjs ships byte-identical in the installed skill and the dataset source', () => {
  const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
  assert.equal(
    read('../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts/workflow-profile.mjs'),
    read('../../skills/pair-workflow-cycle/scripts/workflow-profile.mjs'),
  )
})

// ── T-2: resolver — cascade, collision, unresolved (AC2, AC3, AC8) ───────────────────────────
const project = ({ config, files = {} } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'wfp-'))
  if (config !== undefined) writeFileSync(join(root, 'pair.config.json'), typeof config === 'string' ? config : JSON.stringify(config))
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), typeof body === 'string' ? body : JSON.stringify(body))
  }
  return root
}
const GLOB = '.pair/adoption/tech/workflow-profiles/*.json'
const cheap = { name: 'cheap-green', defaults: { model: 'small' } }
const pricey = { name: 'pricey', defaults: { model: 'big' } }
const halt = (fn, code) => assert.throws(fn, e => e instanceof ProfileError && e.code === code, code)

test('T-2/AC2: --profile resolves from files and reports source `argument`', () => {
  const root = project({ config: { workflowProfiles: { default: 'pricey', files: GLOB } }, files: { '.pair/adoption/tech/workflow-profiles/a.json': cheap, '.pair/adoption/tech/workflow-profiles/b.json': pricey } })
  const r = resolveProfile({ root, profile: 'cheap-green' })
  assert.equal(r.name, 'cheap-green')
  assert.equal(r.source, 'argument')
  assert.equal(r.stages.green.model.value, 'small')
  assert.match(r.hash, /^[0-9a-f]{64}$/)
})

test('T-2/AC2: no argument resolves workflowProfiles.default; source `pair.config.json`', () => {
  const root = project({ config: { workflowProfiles: { default: 'pricey', files: GLOB } }, files: { '.pair/adoption/tech/workflow-profiles/b.json': pricey } })
  const r = resolveProfile({ root })
  assert.deepEqual([r.name, r.source], ['pricey', 'pair.config.json'])
})

test('T-2/AC2/AC9: neither argument nor default (or no pair.config.json at all) is the KB default; source `KB default`', () => {
  for (const config of [undefined, {}, { workflowProfiles: { files: GLOB } }]) {
    const r = resolveProfile({ root: project({ config }) })
    assert.deepEqual([r.name, r.source], ['KB default', 'KB default'])
    for (const stage of STAGES) assert.deepEqual(Object.fromEntries(Object.entries(r.stages[stage]).map(([k, v]) => [k, v.value])), KB_DEFAULT)
  }
})

test('T-2/AC2: profiles are indexed by their own `name`, never the filename', () => {
  const root = project({ config: { workflowProfiles: { files: [GLOB] } }, files: { '.pair/adoption/tech/workflow-profiles/zzz-not-the-name.json': cheap } })
  assert.equal(resolveProfile({ root, profile: 'cheap-green' }).name, 'cheap-green')
})

test('T-2: inline profiles resolve, and inline wins over a file with the same name (reported)', () => {
  const root = project({
    config: { workflowProfiles: { files: GLOB, inline: { 'cheap-green': { name: 'cheap-green', defaults: { model: 'from-inline' } } } } },
    files: { '.pair/adoption/tech/workflow-profiles/a.json': cheap },
  })
  const r = resolveProfile({ root, profile: 'cheap-green' })
  assert.equal(r.stages.green.model.value, 'from-inline')
  assert.match(r.notes.join('\n'), /inline.*wins.*a\.json/)
})

test('T-2/AC3: --workflow-config wins over --profile and over the configured default, verbatim; source says so', () => {
  const root = project({ config: { workflowProfiles: { default: 'pricey', files: GLOB } }, files: { '.pair/adoption/tech/workflow-profiles/b.json': pricey, 'ext/mine.json': { name: 'mine', defaults: { model: 'ext' } } } })
  const r = resolveProfile({ root, profile: 'pricey', workflowConfig: join(root, 'ext/mine.json') })
  assert.deepEqual([r.name, r.source], ['mine', '--workflow-config'])
  assert.equal(r.stages.implement.model.value, 'ext')
  assert.equal(r.sourceDetail, join(root, 'ext/mine.json'))
})

test('T-2/AC3: a malformed --workflow-config is profile-invalid with the parse error; a missing one is profile-unresolved', () => {
  const root = project({ files: { 'bad.json': '{ nope' } })
  assert.throws(() => resolveProfile({ root, workflowConfig: join(root, 'bad.json') }), e => e.code === 'profile-invalid' && /JSON/i.test(e.detail) && e.detail.includes('bad.json'))
  halt(() => resolveProfile({ root, workflowConfig: join(root, 'absent.json') }), 'profile-unresolved')
})

test('T-2/AC8: an unresolvable --profile HALTs profile-unresolved naming the searched sources — never the KB default', () => {
  const root = project({ config: { workflowProfiles: { files: GLOB, inline: { x: { name: 'x' } } } }, files: { '.pair/adoption/tech/workflow-profiles/a.json': cheap } })
  assert.throws(() => resolveProfile({ root, profile: 'does-not-exist' }), e => e.code === 'profile-unresolved' && e.detail.includes(GLOB) && e.detail.includes('inline') && e.detail.includes('does-not-exist') && e.detail.includes('cheap-green'))
})

test('T-2/AC8: an unresolvable configured default HALTs too; with no pair.config.json an --profile name is unresolved', () => {
  halt(() => resolveProfile({ root: project({ config: { workflowProfiles: { default: 'ghost', files: GLOB } } }) }), 'profile-unresolved')
  halt(() => resolveProfile({ root: project(), profile: 'anything' }), 'profile-unresolved')
})

test('T-2: two files declaring the same name HALT profile-name-collision naming both paths', () => {
  const root = project({ config: { workflowProfiles: { files: GLOB } }, files: { '.pair/adoption/tech/workflow-profiles/a.json': cheap, '.pair/adoption/tech/workflow-profiles/b.json': cheap } })
  assert.throws(() => resolveProfile({ root, profile: 'cheap-green' }), e => e.code === 'profile-name-collision' && e.detail.includes('a.json') && e.detail.includes('b.json'))
})

test('T-2: the selected profile is validated on load — a bad context is profile-invalid through the resolver too', () => {
  const root = project({ config: { workflowProfiles: { files: GLOB } }, files: { '.pair/adoption/tech/workflow-profiles/a.json': { name: 'bad', stages: { verify: { context: 'reuse' } } } } })
  assert.throws(() => resolveProfile({ root, profile: 'bad' }), e => e.code === 'profile-invalid' && /stages\.verify\.context/.test(e.detail))
})

test('T-2: a malformed workflowProfiles block (unknown key, wrong types) is profile-invalid', () => {
  halt(() => resolveProfile({ root: project({ config: { workflowProfiles: { defualt: 'x' } } }) }), 'profile-invalid')
  halt(() => resolveProfile({ root: project({ config: { workflowProfiles: { files: 3 } } }) }), 'profile-invalid')
})

test('T-2: `**` globs recurse and a glob never escapes the project root', () => {
  const root = project({ config: { workflowProfiles: { files: 'profiles/**/*.json' } }, files: { 'profiles/deep/er/a.json': cheap } })
  assert.equal(resolveProfile({ root, profile: 'cheap-green' }).name, 'cheap-green')
  halt(() => resolveProfile({ root: project({ config: { workflowProfiles: { files: '../*.json' } } }), profile: 'x' }), 'profile-invalid')
})

// ── T-3: model class → concrete id, against the card's tier (AC4) ────────────────────────────
const POLICY_MD = '# Automation\n\n## Model Policy\n\nrisk:green: cheap\nrisk:yellow: balanced\nrisk:red: frontier\n'
const CLASSES = { cheap: 'm-cheap', balanced: 'm-balanced', frontier: 'm-frontier' }
const withProfile = (model, { policy = POLICY_MD, modelClasses = CLASSES } = {}) => {
  const files = { '.pair/adoption/tech/workflow-profiles/p.json': { name: 'p', defaults: { model }, ...(modelClasses !== null ? { modelClasses } : {}) } }
  if (policy !== null) files['.pair/adoption/tech/automation.md'] = policy
  return project({ config: { workflowProfiles: { default: 'p', files: GLOB } }, files })
}

test('T-3/AC4: a class resolves to its concrete id and the line names the class, the id and the card tier', () => {
  const r = resolveProfile({ root: withProfile('balanced'), tier: 'risk:yellow' })
  const m = r.stages.implement.model
  assert.deepEqual([m.value, m.resolved.class, m.resolved.id, m.resolved.tier], ['balanced', 'balanced', 'm-balanced', 'risk:yellow'])
  assert.match(m.resolved.line, /balanced/)
  assert.match(m.resolved.line, /m-balanced/)
  assert.match(m.resolved.line, /risk:yellow/)
})

test('T-3/AC4: `by-tier` reads the `## Model Policy` convention — every tier x class combination resolves to the policy class and its id', () => {
  for (const [tier, klass] of [['risk:green', 'cheap'], ['risk:yellow', 'balanced'], ['risk:red', 'frontier']]) {
    const m = resolveProfile({ root: withProfile('by-tier'), tier }).stages.verify.model
    assert.deepEqual([m.resolved.class, m.resolved.id], [klass, CLASSES[klass]], tier)
  }
})

test('T-3: an explicit model id passes through unchanged, with no class', () => {
  const m = resolveProfile({ root: withProfile('claude-opus-x'), tier: 'risk:red' }).stages.green.model
  assert.deepEqual([m.resolved.id, m.resolved.class], ['claude-opus-x', undefined])
})

test('T-3: `default` (and the KB default) means the engine default — no id', () => {
  assert.equal(resolveProfile({ root: withProfile('default'), tier: 'risk:red' }).stages.green.model.resolved.id, null)
  assert.equal(resolveProfile({ root: project() }).stages.green.model.resolved.id, null)
})

test('T-3: no `## Model Policy`, an untagged card or an omitted tier is never a HALT — by-tier resolves to the engine default', () => {
  assert.equal(resolveProfile({ root: withProfile('by-tier', { policy: null }), tier: 'risk:red' }).stages.green.model.resolved.id, null)
  assert.equal(resolveProfile({ root: withProfile('by-tier'), tier: undefined }).stages.green.model.resolved.id, null)
  assert.equal(resolveProfile({ root: withProfile('by-tier', { policy: '## Model Policy\n\nrisk:green: cheap\n' }), tier: 'risk:red' }).stages.green.model.resolved.id, null)
})

test('T-3: a class the profile gives no concrete id resolves to the engine default (no second taxonomy, no HALT)', () => {
  const m = resolveProfile({ root: withProfile('frontier', { modelClasses: null }), tier: 'risk:red' }).stages.green.model
  assert.deepEqual([m.resolved.class, m.resolved.id], ['frontier', null])
})

test('T-3: a fenced or malformed Model Policy line is never read as policy; an unknown class is profile-invalid', () => {
  const fenced = '```\n## Model Policy\nrisk:red: frontier\n```\n'
  assert.equal(resolveProfile({ root: withProfile('by-tier', { policy: fenced }), tier: 'risk:red' }).stages.green.model.resolved.id, null)
  assert.throws(() => resolveProfile({ root: withProfile('by-tier', { policy: '## Model Policy\n\nrisk:red: turbo\n' }), tier: 'risk:red' }), e => e.code === 'profile-invalid' && /turbo/.test(e.detail))
})

test('T-3: modelClasses is validated (unknown class name, non-string id)', () => {
  assert.match(errorsOf({ name: 'p', modelClasses: { huge: 'x' } })[0], /modelClasses: unknown class 'huge'/)
  assert.match(errorsOf({ name: 'p', modelClasses: { cheap: 3 } })[0], /modelClasses\.cheap/)
})

// ── T-4: recorded in every handoff, excluded from the digest (AC7) ───────────────────────────
const SHA = c => c.repeat(40)
const V = '4.0.1'
const runDirOf = () => {
  const root = mkdtempSync(join(tmpdir(), 'wfp-run-'))
  const dir = join(root, '.pair', 'working', 'runs', 'run-1', '42')
  mkdirSync(dir, { recursive: true })
  return dir
}
const implementHandoff = (dir, attempt) => {
  const file = join(dir, `draft-${attempt}.json`)
  writeFileSync(file, JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'b', phase: 'a0', skill: 'implement-phase', inputHead: SHA('a'), status: 'ok', prNumber: 7, outputHead: SHA('c'), gatesPassed: true }))
  const out = publish({ dir, file, phase: 'a0', skill: 'implement-phase', workflowVersion: V, attempt, pr: 7 })
  assert.equal(out.published, true, JSON.stringify(out))
  return JSON.parse(readFileSync(out.path, 'utf8'))
}
const resolvedProfile = (name, model) => resolveProfile({ root: project({ config: { workflowProfiles: { default: name, inline: { [name]: { name, defaults: { model } } } } } }) })

test('T-4/AC7: bindProfile records the run profile once; a same-hash re-bind is `reused`, a changed profile is `rebound`', () => {
  const dir = runDirOf()
  const a = resolvedProfile('A', 'm1')
  assert.equal(bindProfile({ dir, resolved: a }).action, 'bound')
  assert.equal(bindProfile({ dir, resolved: a }).action, 'reused')
  const b = resolvedProfile('B', 'm2')
  const out = bindProfile({ dir, resolved: b })
  assert.deepEqual([out.action, out.previous.name, out.previous.hash], ['rebound', 'A', a.hash])
})

test('T-4/AC7: every handoff records the profile name + content hash bound when it was published', () => {
  const dir = runDirOf()
  const a = resolvedProfile('A', 'm1')
  const b = resolvedProfile('B', 'm2')
  assert.notEqual(a.hash, b.hash)
  assert.equal(implementHandoffWithout(dir).workflowProfile, undefined, 'no profile bound ⇒ nothing stamped (AC9)')
  bindProfile({ dir, resolved: a })
  assert.deepEqual(implementHandoff(dir, 2).workflowProfile, { name: 'A', hash: a.hash })
  bindProfile({ dir, resolved: b })
  assert.deepEqual(implementHandoff(dir, 3).workflowProfile, { name: 'B', hash: b.hash })
})
const implementHandoffWithout = dir => implementHandoff(dir, 1)

test('T-4/AC7: the profile is never an effective input — two runs differing only by profile digest identically', () => {
  const story = { id: '42', branch: 'b', base: 'origin/main', title: 't' }
  const base = effectiveInputs(story, { workflowVersion: V })
  assert.equal(effectiveInputs(story, { workflowVersion: V, profile: resolvedProfile('A', 'm1') }), base)
  assert.equal(effectiveInputs(story, { workflowVersion: V, profile: resolvedProfile('B', 'm2') }), base)
})

test('T-4/AC7: resuming after the profile changed is not an input change — resolve answers the same next step and status', () => {
  const dir = runDirOf()
  const root = dirname(dirname(dirname(dirname(dirname(dir)))))
  const story = { id: '42', branch: 'b', base: 'origin/main', title: 't' }
  const inputs = effectiveInputs(story, { workflowVersion: V })
  bindProfile({ dir, resolved: resolvedProfile('A', 'm1') })
  implementHandoff(dir, 1)
  const ask = () => resolve({ dir, workflowVersion: V, policy: {}, entry: 'fresh', inputs, story: '42', runsRoot: join(root, '.pair', 'working', 'runs') })
  const before = ask()
  bindProfile({ dir, resolved: resolvedProfile('B', 'm2') })
  const after = ask()
  assert.equal(before.status, after.status)
  assert.deepEqual(after.next, before.next)
  assert.equal(after.next.inputsChanged, undefined)
  assert.equal(after.next.step, 'verify')
})

// ── T-5: the transparency table, the context policy, and the CLI both coordinators run (AC6) ──
const CLI = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/workflow-profile.mjs', import.meta.url))
const cli = (...args) => {
  const r = spawnSync('node', [CLI, ...args], { encoding: 'utf8' })
  return { code: r.status, out: JSON.parse(r.stdout.trim()) }
}
const mixed = {
  name: 'mixed',
  defaults: { engine: 'pi', model: 'by-tier', effort: 'medium' },
  modelClasses: CLASSES,
  stages: { prepare: { model: 'cheap', context: 'reuse' }, green: { model: 'cheap', context: 'reuse' }, validate: { model: 'frontier' }, verify: { model: 'frontier', effort: 'high' } },
}
const mixedRoot = () => project({ config: { workflowProfiles: { default: 'mixed', files: GLOB } }, files: { '.pair/adoption/tech/workflow-profiles/mixed.json': mixed, '.pair/adoption/tech/automation.md': POLICY_MD } })

test('T-5/AC6: the transparency table names profile, source and hash once, then every stage with engine/model/effort/context each carrying its source', () => {
  const r = resolveProfile({ root: mixedRoot(), tier: 'risk:yellow' })
  const lines = describeProfile(r)
  const text = lines.join('\n')
  assert.match(lines[0], /Profile: mixed/)
  assert.match(lines[0], /pair\.config\.json/)
  assert.ok(lines[0].includes(r.hash.slice(0, 12)))
  for (const stage of STAGES) assert.ok(lines.some(l => l.trimStart().startsWith(stage)), stage)
  const verify = lines.find(l => l.trimStart().startsWith('verify'))
  assert.match(verify, /pi \(defaults\)/)
  assert.match(verify, /frontier[^|]*m-frontier[^|]*\(stage\)/)
  assert.match(verify, /high \(stage\)/)
  assert.match(verify, /fresh \(KB default\)/)
  const green = lines.find(l => l.trimStart().startsWith('green'))
  assert.match(green, /cheap[^|]*m-cheap/)
  assert.match(green, /reuse \(stage\)/)
  assert.match(text, /risk:yellow/)
})

test('T-5/AC2: the KB default prints as a table too, source `KB default`', () => {
  const lines = describeProfile(resolveProfile({ root: project() }))
  assert.match(lines[0], /Profile: KB default \(source: KB default\)/)
  assert.ok(lines.some(l => /implement.*default \(KB default\).*fresh \(KB default\)/.test(l)))
})

test('T-5/AC5: the profile becomes a cycle-state contextPolicy naming only admissible transitions — and cycle-state accepts it', async () => {
  const policy = profileContextPolicy(resolveProfile({ root: mixedRoot() }))
  assert.deepEqual(policy, { 'prepare->prepare': 'reuse', 'implement->green': 'reuse', 'green->green': 'reuse' })
  const { contextPolicyError } = await import('../../skills/pair-workflow-cycle/scripts/cycle-state.mjs')
  assert.equal(contextPolicyError(policy), null)
  assert.deepEqual(profileContextPolicy(resolveProfile({ root: project() })), {})
})

test('T-5: `resolve` CLI prints the resolved profile as JSON, with the table and the context policy', () => {
  const { code, out } = cli('resolve', '--root', mixedRoot(), '--tier', 'risk:red')
  assert.equal(code, 0)
  assert.deepEqual([out.name, out.source], ['mixed', 'pair.config.json'])
  assert.equal(out.stages.verify.model.resolved.id, 'm-frontier')
  assert.equal(out.stages.implement.model.resolved.id, 'm-frontier', 'by-tier → risk:red → frontier')
  assert.equal(out.contextPolicy['implement->green'], 'reuse')
  assert.match(out.table[0], /Profile: mixed/)
})

test('T-5/AC2/AC3: the CLI takes --profile and --workflow-config with the same cascade', () => {
  const root = mixedRoot()
  writeFileSync(join(root, 'ext.json'), JSON.stringify({ name: 'ext' }))
  assert.equal(cli('resolve', '--root', root, '--profile', 'mixed').out.source, 'argument')
  assert.deepEqual([cli('resolve', '--root', root, '--workflow-config', 'ext.json').out.name], ['ext'])
})

test('T-5/AC8: the CLI HALTs with `{halt, detail}` and exit 1 — profile-unresolved, profile-invalid, profile-name-collision', () => {
  const root = mixedRoot()
  const bad = cli('resolve', '--root', root, '--profile', 'nope')
  assert.deepEqual([bad.code, bad.out.halt], [1, 'profile-unresolved'])
  assert.match(bad.out.detail, /nope/)
  writeFileSync(join(root, 'inv.json'), JSON.stringify({ name: 'inv', stages: { verify: { context: 'reuse' } } }))
  assert.equal(cli('resolve', '--root', root, '--workflow-config', 'inv.json').out.halt, 'profile-invalid')
  writeFileSync(join(root, '.pair/adoption/tech/workflow-profiles/dup.json'), JSON.stringify(mixed))
  assert.equal(cli('resolve', '--root', root).out.halt, 'profile-name-collision')
})

test('T-5/AC7: `resolve --dir` binds the run profile; a later publish stamps it', () => {
  const dir = runDirOf()
  const { out } = cli('resolve', '--root', mixedRoot(), '--dir', dir)
  assert.equal(out.binding.action, 'bound')
  assert.deepEqual(implementHandoff(dir, 1).workflowProfile, { name: 'mixed', hash: out.hash })
  assert.equal(cli('resolve', '--root', mixedRoot(), '--dir', dir).out.binding.action, 'reused')
})

test('T-5: the CLI flag set is closed — an unknown flag is refused, never ignored', () => {
  const r = cli('resolve', '--root', mixedRoot(), '--profil', 'x')
  assert.equal(r.code, 2)
  assert.match(r.out.error, /unknown flag/)
})

test('T-5/AC7: `bind` records an ALREADY-resolved identity (no re-resolution) — the path pair-cli takes once the run directory is known', () => {
  const dir = runDirOf()
  const first = cli('bind', '--dir', dir, '--name', 'mixed', '--hash', 'a'.repeat(64), '--source', 'argument')
  assert.equal(first.out.action, 'bound')
  assert.deepEqual(implementHandoff(dir, 1).workflowProfile, { name: 'mixed', hash: 'a'.repeat(64) })
  assert.equal(cli('bind', '--dir', dir, '--name', 'mixed', '--hash', 'a'.repeat(64), '--source', 'argument').out.action, 'reused')
  assert.equal(cli('bind', '--dir', dir, '--name', 'mixed', '--hash', 'not-a-hash', '--source', 'x').code, 2)
})

// ── T-5: the in-session coordinator's SKILL.md drives the same resolver (AC2, AC3, AC5, AC6, AC8) ──
test('T-5: pair-workflow-cycle SKILL.md resolves the profile through workflow-profile.mjs, prints its table once, passes the context policy and names every HALT', () => {
  const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
  const skill = read('../../skills/pair-workflow-cycle/SKILL.md')
  assert.equal(skill, read('../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/SKILL.md'), 'installed copy drifted from the dataset source')
  for (const needle of ['$workflowConfig', 'workflow-profile.mjs" resolve', '--workflow-config', '--contextPolicy', 'profile-unresolved', 'profile-invalid', 'profile-name-collision', 'once', '.contextPolicy'])
    assert.ok(skill.includes(needle), `SKILL.md lacks ${needle}`)
  // the legacy inline `{effort}` object keeps working, and the per-stage profile effort feeds the packet's own --profile flag
  assert.match(skill, /legacy/i)
  assert.match(skill, /packet[^\n]*--profile '\{"effort"/)
})

// ── T-6: the KB slice cannot drift from the resolver — its examples ARE run against it ────────
test('T-6: the KB workflow-profiles.md example profile validates and resolves, and the config example is a legal workflowProfiles block', () => {
  const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
  const kb = read('../../../.pair/knowledge/guidelines/collaboration/automation/workflow-profiles.md')
  assert.equal(kb, read('../../../packages/knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/automation/workflow-profiles.md'), 'KB mirror drifted from the dataset source')
  const blocks = [...kb.matchAll(/```json\n([\s\S]*?)```/g)].map(m => JSON.parse(m[1]))
  const example = blocks.find(b => b.name === 'cheap-green')
  const config = blocks.find(b => b.workflowProfiles)
  assert.ok(example && config)
  assert.deepEqual(errorsOf(example), [])
  // the doc's own claim: prepare/green cheap + reuse, validate/verify frontier + fresh
  const root = project({ config: { workflowProfiles: { default: 'cheap-green', files: GLOB } }, files: { '.pair/adoption/tech/workflow-profiles/cheap-green.json': example, '.pair/adoption/tech/automation.md': POLICY_MD } })
  const r = resolveProfile({ root, tier: 'risk:yellow' })
  assert.deepEqual([r.stages.prepare.model.resolved.class, r.stages.prepare.context.value], ['cheap', 'reuse'])
  assert.deepEqual([r.stages.green.model.resolved.class, r.stages.green.context.value], ['cheap', 'reuse'])
  for (const s of ['validate', 'verify']) assert.deepEqual([r.stages[s].model.resolved.class, r.stages[s].context.value], ['frontier', 'fresh'])
  assert.equal(r.stages.implement.model.resolved.class, 'balanced', 'by-tier on risk:yellow')
  // every key the config example uses is one the resolver accepts
  const inlineOnly = project({ config: { workflowProfiles: { inline: config.workflowProfiles.inline } } })
  assert.equal(resolveProfile({ root: inlineOnly, profile: 'quick' }).stages.implement.effort.value, 'low')
})

test('T-6: every HALT the KB slice names is one the resolver actually raises', () => {
  const kb = readFileSync(new URL('../../../.pair/knowledge/guidelines/collaboration/automation/workflow-profiles.md', import.meta.url), 'utf8')
  for (const code of ['profile-unresolved', 'profile-invalid', 'profile-name-collision']) assert.ok(kb.includes(code) && readFileSync(CLI, 'utf8').includes(code), code)
})

// ── PR #517 finding: a mistyped model class is refused at load, never sent to an engine ──────────
// The KB slice allows `model` = `default` | `by-tier` | a class (cheap | balanced | frontier) | an
// explicit model id, with NO prefix — so an id is any other string (`x`, `big`, `sonnet`, `m-frontier`).
// A value that is a NEAR-MISS of one of the reserved tokens is not an id, it is a typo: same token
// after case-folding and dropping `-`/`_`/spaces, or one edit away (insert, delete, substitute or
// swap two adjacent characters) on the case-folded value. It is `profile-invalid` at load, naming the
// field path, the value and the allowed classes.
const NEAR_MISS_CLASSES = ['frontir', 'fronteir', 'Frontier', 'FRONTIER', 'balnced', 'balanced ', 'chaep', 'cheep']
const NEAR_MISS_KEYWORDS = ['by_tier', 'bytier', 'By-Tier', 'by-teir', 'defualt', 'Default']
const LEGIT_IDS = ['claude-opus-x', 'claude-opus-4-1', 'claude-sonnet-4-5', 'sonnet', 'opus', 'haiku', 'gpt-5-codex', 'o3', 'x', 'big', 'small', 'm-frontier', 'frontier-2', 'claude-haiku-x']
const namesTypo = (msg, where, value) =>
  msg.includes(`${where}.model`) && msg.includes(`'${value}'`) && ['cheap', 'balanced', 'frontier'].every(c => msg.includes(c))

test('PR517-W1: validateProfile refuses a near-miss model class on a stage, naming stage, value and the allowed classes', () => {
  for (const value of NEAR_MISS_CLASSES) {
    const errs = errorsOf({ name: 'p', stages: { verify: { model: value } } })
    assert.ok(errs.some(e => namesTypo(e, 'stages.verify', value)), `${JSON.stringify(value)} accepted: ${JSON.stringify(errs)}`)
  }
})

test('PR517-W2: validateProfile refuses a near-miss model class in defaults, naming defaults.model', () => {
  const errs = errorsOf({ name: 'p', defaults: { model: 'frontir' } })
  assert.ok(errs.some(e => namesTypo(e, 'defaults', 'frontir')), JSON.stringify(errs))
})

test('PR517-W3: validateProfile refuses a near-miss of the `by-tier` / `default` keywords the same way', () => {
  for (const value of NEAR_MISS_KEYWORDS) {
    const errs = errorsOf({ name: 'p', stages: { green: { model: value } } })
    assert.ok(errs.some(e => namesTypo(e, 'stages.green', value)), `${JSON.stringify(value)} accepted: ${JSON.stringify(errs)}`)
  }
})

test('PR517-W4: resolveProfile HALTs profile-invalid on a mistyped class — from files and from --workflow-config — never resolving it to an id', () => {
  const fromFiles = project({ config: { workflowProfiles: { default: 'p', files: GLOB } }, files: { '.pair/adoption/tech/workflow-profiles/p.json': { name: 'p', modelClasses: CLASSES, stages: { verify: { model: 'frontir' } } } } })
  assert.throws(() => resolveProfile({ root: fromFiles, tier: 'risk:red' }), e => e instanceof ProfileError && e.code === 'profile-invalid' && namesTypo(e.detail, 'stages.verify', 'frontir'))
  const ext = project({ files: { 'ext.json': { name: 'ext', stages: { implement: { model: 'balnced' } } } } })
  assert.throws(() => resolveProfile({ root: ext, workflowConfig: 'ext.json' }), e => e instanceof ProfileError && e.code === 'profile-invalid' && namesTypo(e.detail, 'stages.implement', 'balnced'))
})

test('PR517-W5: the `resolve` CLI exits 1 with {halt: profile-invalid} on a mistyped class and prints no resolved stages', () => {
  const root = project({ files: { 'ext.json': { name: 'ext', stages: { verify: { model: 'frontir' } } } } })
  const r = cli('resolve', '--root', root, '--workflow-config', 'ext.json')
  assert.equal(r.code, 1, JSON.stringify(r.out).slice(0, 300))
  assert.equal(r.out.halt, 'profile-invalid')
  assert.ok(namesTypo(r.out.detail, 'stages.verify', 'frontir'), r.out.detail)
  assert.equal(r.out.stages, undefined)
})

test('PR517-C1: every reserved token and every explicit model id still validates and resolves — ids pass through unchanged', () => {
  for (const value of ['default', 'by-tier', 'cheap', 'balanced', 'frontier', ...LEGIT_IDS])
    assert.deepEqual(errorsOf({ name: 'p', stages: { verify: { model: value } } }), [], value)
  for (const id of LEGIT_IDS) {
    const m = resolveProfile({ root: withProfile(id), tier: 'risk:red' }).stages.green.model
    assert.deepEqual([m.resolved.id, m.resolved.class], [id, undefined], id)
  }
})

test('PR517-C2: a concrete id inside modelClasses is an id, never class-checked — even one that looks like a class', () => {
  assert.deepEqual(errorsOf({ name: 'p', modelClasses: { cheap: 'frontir', balanced: 'Balanced', frontier: 'm-frontier' }, stages: { verify: { model: 'cheap' } } }), [])
})

test('PR517-C3: the CLI still resolves a class and an explicit id side by side (exit 0)', () => {
  const root = project({ files: { 'ext.json': { name: 'ext', modelClasses: CLASSES, stages: { verify: { model: 'frontier' }, green: { model: 'sonnet' } } } } })
  const r = cli('resolve', '--root', root, '--workflow-config', 'ext.json')
  assert.equal(r.code, 0, JSON.stringify(r.out))
  assert.deepEqual([r.out.stages.verify.model.resolved.id, r.out.stages.green.model.resolved.id], ['m-frontier', 'sonnet'])
})
