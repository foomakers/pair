import { kindByName, settle } from '.'
import { violations } from '../schema'
import { validate } from '../validate'

const HEAD = 'b'.repeat(40)
const fixed = (over: Record<string, unknown>) => ({
  status: 'ok',
  summary: 'fixed',
  head: HEAD,
  resolutions: [{ id: 'F1', status: 'resolved', reason: 'guarded' }],
  ...over,
})

describe('fix kind (#708 AC-1..AC-3)', () => {
  it.each([
    [{ severity: 'Major' }],
    [{ findings: ['F1', 'F2'] }],
    [{ gates: ['quality-gate'] }],
    [{}],
  ])('accepts %j', options => {
    expect(violations(kindByName.fix.with, options)).toEqual([])
  })

  it.each([
    [{ severity: 'Trivial' }, 'unknown value "Trivial"'],
    [{ ids: ['F1'] }, "unknown key 'ids'"],
    [{ findings: 'F1' }, 'expected array, found string "F1"'],
  ])('refuses %j', (options, problem) => {
    expect(violations(kindByName.fix.with, options).map(found => found.problem)).toEqual([problem])
  })

  it('refuses a gate key the registry does not have, like implement does', () => {
    const text =
      'version: 1\nname: w\nsteps:\n  fix:\n    kind: fix\n    with:\n      gates: [nope]\n'
    const { errors } = validate(text, 'w.yaml', {
      skillExists: () => true,
      gateKeys: ['quality-gate'],
      launchInputs: ['card', 'pr', 'head', 'findings'],
      isSafeText: () => true,
    })
    expect(errors.map(one => one.problem)).toEqual(["unknown gate key 'nope'"])
  })
})

describe('fix result (#708 AC-1, AC-5, AC-6)', () => {
  it.each([
    ['resolved', fixed({})],
    ['empty scope', fixed({ resolutions: [] })],
    [
      'needs-decision with no outputs',
      { status: 'needs-decision', summary: 'x', reason: 'F2 needs a decision' },
    ],
    [
      'failed with a not-resolved finding',
      fixed({
        status: 'failed',
        reason: 'gate red',
        resolutions: [{ id: 'F1', status: 'not-resolved', reason: 'red' }],
      }),
    ],
  ])('accepts %s', (_name, result) => {
    expect(settle(kindByName.fix, result).reason).not.toBe('invalid-result')
  })

  it('refuses ok with a not-resolved finding, naming it', () => {
    const result = settle(
      kindByName.fix,
      fixed({ resolutions: [{ id: 'F3', status: 'not-resolved', reason: 'x' }] }),
    )
    expect(result).toMatchObject({ status: 'failed', reason: 'invalid-result' })
    expect(result.detail).toContain('F3')
  })

  it('refuses ok without the head', () => {
    const rest = Object.fromEntries(Object.entries(fixed({})).filter(([name]) => name !== 'head'))
    expect(settle(kindByName.fix, rest).detail).toContain('head')
  })
})
