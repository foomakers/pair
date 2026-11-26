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
const allStops = 'failed: stop, blocked: stop, needs-decision: stop'
const approval = '  approve: { kind: approval, escalate: { failed: stop, needs-decision: stop } }\n'
const FULL = `  implement: { kind: implement, escalate: { ${allStops} } }
  review: { kind: review, escalate: { ${allStops} } }
  checks: { kind: gate, with: { checks: [head-unchanged] } }
${approval}  merge: { kind: merge }
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
    const result = check(
      `  implement: { kind: implement, escalate: { ${allStops} } }\n  merge: { kind: merge }\n`,
    )
    expect(result.errors).toEqual([])
    expect(result.workflow).toBeDefined()
    expect(result.warnings.map(w => w.problem)).toEqual([
      'merge has no approval step',
      'merge has no review after the last code-changing step',
      "merge has no gate with the 'head-unchanged' check",
    ])
  })
  it.each([false, true])('checks a review loop followed by a fix (%s)', laterFix => {
    const loop = `  rounds:
    kind: loop
    until: review
    max: 3
    on-max: escalate
    steps:
      review: { kind: review, escalate: { failed: continue } }
      fix: { kind: fix }
`
    const steps = FULL.replace('  review: { kind: review, escalate: { ' + allStops + ' } }\n', loop)
    const candidate = laterFix
      ? steps.replace('  checks:', '  last-fix: { kind: fix }\n  checks:')
      : steps
    expect(problems(candidate)).toEqual([])
    expect(warned(candidate).filter(problem => problem.startsWith('merge has'))).toEqual(
      laterFix ? ['merge has no review after the last code-changing step'] : [],
    )
  })
  it('a review before the last fix does not count', () => {
    expect(
      warned(FULL.replace('  checks', `  fix: { kind: fix, escalate: { ${allStops} } }\n  checks`)),
    ).toEqual(['merge has no review after the last code-changing step'])
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

describe('escalation diagnostics (#728 AC-15)', () => {
  const implement = (rules: string) => `  implement:
    kind: implement
    ${rules}
`
  const delivery = (status: string) => FULL.replace(`${status}: stop`, `${status}: continue`)

  it('warns about the declared outcome left to its default', () => {
    const result = check(implement('on-failed: stop\n    escalate: { needs-decision: stop }'))
    expect(result.errors).toEqual([])
    expect(result.warnings.map(({ problem }) => problem)).toEqual([
      expect.stringMatching(/\bblocked\b/i),
    ])
  })

  it.each(['', 'escalate: {}'])(
    'warns for every defaulted return with policy %j (R747-05)',
    rules => {
      const result = check(implement(rules))
      expect(result.errors).toEqual([])
      expect(result.warnings.map(({ problem }) => problem)).toEqual(
        ['failed', 'blocked', 'needs-decision'].map(
          status => `'${status}' is unhandled and uses the default action`,
        ),
      )
    },
  )

  it('only warns about defaulted returns the shorthand does not handle (R747-05)', () => {
    expect(warned(implement('on-failed: stop'))).toEqual([
      "'blocked' is unhandled and uses the default action",
      "'needs-decision' is unhandled and uses the default action",
    ])
  })

  it.each(['exhausted', 'skipped'])('warns when a condition reads impossible status %s', status => {
    const result = check(`  implement: { kind: implement, on-failed: continue }
  retry: { kind: implement, when: { output: implement.status, is: [${status}] } }
`)
    expect(result.errors).toEqual([])
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        file: 'quick.yaml',
        line: 5,
        problem: expect.stringContaining(status),
      }),
    )
  })

  it('accepts a condition reading the outcome of a continued failure', () => {
    expect(
      check(`  implement: { kind: implement, on-failed: continue, escalate: { blocked: stop, needs-decision: stop } }
  retry: { kind: implement, escalate: { ${allStops} }, when: { output: implement.status, is: [failed] } }
`),
    ).toMatchObject({ errors: [], warnings: [] })
  })

  it('warns about an unreachable exhaustion rule on a non-loop step', () => {
    const result = check(implement(`escalate: { ${allStops}, exhausted: continue }`))
    expect(result.errors).toEqual([])
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ key: 'steps.implement.escalate.exhausted' }),
    )
  })

  it('warns when a rule asks for a comment without a comment host', () => {
    const result = check(
      implement(
        'escalate: { failed: stop, blocked: stop, needs-decision: { do: stop, comment: Explain } }',
      ),
    )
    expect(result.errors).toEqual([])
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ problem: expect.stringMatching(/comment.*host|host.*comment/i) }),
    )
  })

  it.each([
    ['blocked', ''],
    ['needs-decision', '  late: { kind: approval }\n'],
  ])('warns about bypassing %s before a merge without prior approval', (status, lateApproval) => {
    const result = check(delivery(status).replace(approval, '') + lateApproval)
    expect(result.errors).toEqual([])
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ problem: expect.stringContaining(status) }),
    )
  })

  it('accepts a continued block when approval precedes merge', () => {
    expect(check(delivery('blocked'))).toMatchObject({ errors: [], warnings: [] })
  })
})
