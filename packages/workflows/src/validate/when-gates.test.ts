import { validate, type ValidationDeps } from '.'

const deps: ValidationDeps = {
  skillExists: name =>
    ['pair-process-implement', 'pair-process-review', 'pair-process-fix'].includes(name),
  gateKeys: ['quality-gate'],
  launchInputs: ['card'],
  isSafeText: () => true,
}
const wf = (steps: string) => `version: 1\nname: quick\nsteps:\n${steps}`
const check = (steps: string) => validate(wf(steps), 'quick.yaml', deps)
const problems = (steps: string) => check(steps).errors.map(e => e.problem)
const warned = (steps: string) => check(steps).warnings.map(e => e.problem)
const FULL = `  implement: { kind: implement }
  review: { kind: review }
  checks: { kind: gate, with: { checks: [head-unchanged] } }
  approve: { kind: approval }
  merge: { kind: merge }
`

describe('host kinds validate without a skill (#680 AC-1, AC-3, AC-5)', () => {
  it('accepts the delivery shape with no errors and no warnings', () => {
    expect(check(FULL)).toMatchObject({ errors: [], warnings: [] })
  })
  it('refuses a gate with neither gates nor checks', () => {
    expect(problems('  g: { kind: gate }\n')).toEqual(['a gate has neither gates nor checks'])
  })
  it('refuses an unknown registry key and an unknown check', () => {
    expect(problems('  g: { kind: gate, with: { gates: [nope] } }\n')).toEqual([
      "unknown gate key 'nope'",
    ])
    expect(problems('  g: { kind: gate, with: { checks: [lucky] } }\n')[0]).toContain('lucky')
  })
})

describe('merge warnings (#680 AC-7)', () => {
  it('warns on each missing guard and never refuses', () => {
    const result = check('  implement: { kind: implement }\n  merge: { kind: merge }\n')
    expect(result.errors).toEqual([])
    expect(result.workflow).toBeDefined()
    expect(result.warnings.map(w => w.problem)).toEqual([
      'merge has no approval step',
      'merge has no review after the last code-changing step',
      "merge has no gate with the 'head-unchanged' check",
    ])
  })
  it('a review before the last fix does not count', () => {
    expect(warned(FULL.replace('  checks', '  fix: { kind: fix }\n  checks'))).toEqual([
      'merge has no review after the last code-changing step',
    ])
  })
})

describe('when validation (#680 AC-6, AC-9)', () => {
  const rounds = (child: string) => `  rounds:
    kind: loop
    until: review
    max: 2
    on-max: fail
    steps:
      review: { kind: review${child} }
      fix: { kind: fix }
`
  it('refuses when on the until step of a loop', () => {
    expect(
      problems('  implement: { kind: implement }\n' + rounds(', when: { has: [a] }')),
    ).toContain("when is not allowed on the until step 'review'")
  })
  it('refuses when on a loop', () => {
    expect(
      problems(
        '  implement: { kind: implement }\n' +
          rounds('').replace('kind: loop', 'kind: loop\n    when: { has: [a] }'),
      ),
    ).toEqual(['when is not allowed on a loop'])
  })
  it.each([
    ['unknown step', 'ghost.verdict', "'ghost' is not a step before this one"],
    ['later step', 'merge.merged', "'merge' is not a step before this one"],
    ['unknown output', 'review.nothing', "step 'review' has no output 'nothing'"],
    [
      'unknown status producer (#728 AC-16)',
      'ghost.status',
      "'ghost' is not a step before this one",
    ],
    ['later status producer (#728 AC-16)', 'merge.status', "'merge' is not a step before this one"],
  ])('refuses an output on %s', (_, output, problem) => {
    const steps = `  implement: { kind: implement }
  review: { kind: review }
  fix: { kind: fix, when: { output: ${output}, is: [x] } }
  merge: { kind: merge }
`
    expect(problems(steps)).toContain(problem)
  })
  it('accepts an output of an earlier step and a loop child address', () => {
    expect(
      problems(`  implement: { kind: implement }
  review: { kind: review }
  fix: { kind: fix, when: { output: review.verdict, is: [changes-requested] } }
`),
    ).toEqual([])
  })
  it('accepts the status of an earlier step (#728 AC-11)', () => {
    expect(
      problems(`  implement: { kind: implement, on-failed: continue }
  retry: { kind: implement, when: { output: implement.status, is: [failed] } }
`),
    ).toEqual([])
  })
  it.each([
    [
      '      retry: { kind: implement, when: { output: rounds.status, is: [exhausted] } }\n',
      ["'rounds' is not a step before this one"],
    ],
    ['  retry: { kind: implement, when: { output: rounds.status, is: [exhausted] } }\n', []],
  ])('allows the loop status only after the loop (#728 AC-14, AC-16): %s', (retry, expected) => {
    expect(problems('  implement: { kind: implement }\n' + rounds('') + retry)).toEqual(expected)
  })
  it('wants output and is together', () => {
    expect(
      problems(
        '  implement: { kind: implement }\n  review: { kind: review, when: { output: implement.pr } }\n',
      ),
    ).toEqual(["'output' and 'is' go together"])
  })
  it('refuses a later step that needs an output only a skippable step produces', () => {
    const steps = `  implement: { kind: implement, when: { has: [x] } }
  review: { kind: review }
`
    expect(problems(steps)).toContain(
      "input 'pr' is only produced by a step with 'when', which may be skipped",
    )
  })
})
