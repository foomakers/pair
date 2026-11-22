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
