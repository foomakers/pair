import { validate, type ValidationDeps } from '.'

const deps: ValidationDeps = {
  skillExists: () => true,
  gateKeys: ['quality-gate'],
  gateTargets: ['pr'],
  launchInputs: ['card'],
  isSafeText: () => true,
}
const problems = (gates: string) =>
  validate(
    `version: 1\nname: q\nsteps:\n  g: { kind: gate, with: { gates: [${gates}] } }\n`,
    'q.yaml',
    deps,
  ).errors.map(e => e.problem)

describe('gate entries', () => {
  it('accepts a key, a known target and a command', () => {
    expect(problems("quality-gate, 'target:pr', 'command:pnpm lint'")).toEqual([])
  })
  it.each([
    ["'target:nope'", "unknown gate target 'nope'"],
    ["'command:'", 'an empty gate command'],
  ])('refuses %s', (entry, problem) => {
    expect(problems(entry)).toEqual([problem])
  })
})

describe('gates as a step attribute (#729 AC-7)', () => {
  const at = (step: string) =>
    validate(`version: 1\nname: q\nsteps:\n  s: ${step}\n`, 'q.yaml', deps).errors.map(
      e => `${e.key}: ${e.problem}`,
    )
  it('accepts entries on any kind, and a gate with only `gates`', () => {
    expect(at("{ kind: implement, gates: ['target:pr', quality-gate, 'command:x'] }")).toEqual([])
    expect(at("{ kind: gate, gates: ['target:pr'] }")).toEqual([])
  })
  it('refuses an unknown entry where it is written', () => {
    expect(at("{ kind: implement, gates: ['target:nope'] }")).toEqual([
      "steps.s.gates.0: unknown gate target 'nope'",
    ])
  })
  it('no longer takes `with.gates` on implement and fix', () => {
    expect(at('{ kind: implement, with: { gates: [quality-gate] } }')[0]).toContain(
      "unknown key 'gates'",
    )
  })
})
