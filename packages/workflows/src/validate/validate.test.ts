import { validate, type ValidationDeps } from '.'
import { kindByName } from '../kinds'

const deps: ValidationDeps = {
  skillExists: name =>
    ['pair-process-implement', 'pair-process-review', 'pair-process-fix', 'my-skill'].includes(
      name,
    ),
  gateKeys: ['quality-gate', 'smoke-tests'],
  launchInputs: ['card'],
  isSafeText: text => !text.includes('`') && !text.includes('\n'),
}

const QUICK = `version: 1
name: quick
steps:
  implement:
    kind: implement
    gates: [quality-gate]
  review:
    kind: review
`

const check = (text: string, over: Partial<ValidationDeps> = {}) =>
  validate(text, 'quick.yaml', { ...deps, ...over })

const decisionStops = 'escalate: { blocked: stop, needs-decision: stop }'
const allStops = 'escalate: { failed: stop, blocked: stop, needs-decision: stop }'

describe('#728 T-1: kind outputs', () => {
  it.each([
    [
      'status',
      [
        expect.objectContaining({
          problem: expect.stringMatching(/status.*reserved|reserved.*status/i),
        }),
      ],
    ],
    ['outcome', []],
  ] as const)('validates the kind output name %s', (output, expected) => {
    const { generic } = kindByName
    Object.assign(kindByName, {
      generic: {
        ...generic,
        outputs: { type: 'object', properties: { [output]: { type: 'string' } } },
      },
    })
    try {
      const { errors } = check(
        'version: 1\nname: quick\nsteps:\n  work: { kind: generic, skill: my-skill }\n',
      )
      expect(errors).toEqual(expected)
    } finally {
      Object.assign(kindByName, { generic })
    }
  })
})

describe('loop validation (#670 AC-7)', () => {
  const loop = `version: 1
name: quick
steps:
  rounds:
    kind: loop
    until: review
    max: 2
    on-max: escalate
    steps:
      review: { kind: generic, skill: my-skill }
      fix: { kind: generic, skill: my-skill }
`

  it('does not expose outputs of children skipped on loop exit (#670-loop-outputs)', () => {
    const text = `version: 1
name: quick
steps:
  rounds:
    kind: loop
    until: first
    max: 2
    on-max: escalate
    steps:
      first: { kind: generic, skill: my-skill }
      review: { kind: review }
  fix: { kind: fix }
`
    const errors = check(text, { launchInputs: ['card', 'pr', 'head'] }).errors
    expect(errors.some(error => error.problem.includes("input 'findings'"))).toBe(true)
  })

  it.each([
    ['review:', 'steps.rounds.steps.review'],
    ['review: { kind: typo }', 'steps.rounds.steps.review.kind'],
  ])('diagnoses malformed child %s (#670-child-validation)', (child, key) => {
    const result = check(loop.replace('review: { kind: generic, skill: my-skill }', child))
    expect(
      result.errors.some(
        error => error.file === 'quick.yaml' && error.line > 0 && error.key === key,
      ),
    ).toBe(true)
  })

  it('accepts a bounded loop', () => {
    expect(check(loop).errors).toEqual([])
  })

  it.each([
    ['an explicit exhaustion rule', 'escalate: { exhausted: continue }'],
    ['matching rules', 'on-max: escalate\n    escalate: { exhausted: stop }'],
  ])('accepts %s (#728 AC 9–10)', (_name, rules) => {
    expect(check(loop.replace('on-max: escalate', rules)).errors).toEqual([])
  })

  it('reports the conflicting exhaustion rule with its line and fix (#728 AC 10)', () => {
    const text = loop.replace(
      '    on-max: escalate',
      '    on-max: escalate\n    escalate:\n      exhausted: continue',
    )
    expect(check(text).errors).toEqual([
      {
        file: 'quick.yaml',
        line: 10,
        key: 'steps.rounds.escalate.exhausted',
        problem: expect.stringMatching(/conflict.*on-max|on-max.*conflict/i),
        fix: expect.stringMatching(/on-max|escalate/),
      },
    ])
  })

  it('rejects a child outcome as an escalation rule on the loop itself (#728 T-5)', () => {
    const text = loop.replace('max: 2', 'max: 2\n    escalate:\n      failed: stop')
    expect(check(text).errors).toContainEqual({
      file: 'quick.yaml',
      line: 9,
      key: 'steps.rounds.escalate.failed',
      problem: expect.stringMatching(/loop/i),
      fix: expect.stringMatching(/exhausted|child|remove/i),
    })
  })

  it('accepts an escalation rule on a loop child (#728 T-5)', () => {
    const text = loop.replace(
      'fix: { kind: generic, skill: my-skill }',
      'fix: { kind: generic, skill: my-skill, escalate: { failed: stop } }',
    )
    expect(check(text).errors).toEqual([])
  })

  it.each([
    [
      'loop gates',
      loop.replace('    max: 2', '    gates: [quality-gate]\n    max: 2'),
      'gates is not allowed on a loop',
    ],
    ['missing max', loop.replace('    max: 2\n', ''), "missing key 'max'"],
    ['missing on-max', loop.replace('    on-max: escalate\n', ''), "missing key 'on-max'"],
    [
      'unknown until',
      loop.replace('until: review', 'until: absent'),
      "unknown until step 'absent'",
    ],
    [
      'on-failed child',
      loop.replace(
        'review: { kind: generic, skill: my-skill }',
        'review: { kind: generic, skill: my-skill, on-failed: continue }',
      ),
      'on-failed is not allowed inside a loop',
    ],
    [
      'nested loop',
      loop.replace(
        'fix: { kind: generic, skill: my-skill }',
        'fix: { kind: loop, until: a, max: 1, on-max: fail, steps: { a: { kind: generic, skill: my-skill } } }',
      ),
      'nested loop is not allowed',
    ],
  ])('refuses %s', (_name, text, problem) => {
    expect(check(text).errors.some(error => error.problem === problem)).toBe(true)
  })
})

describe('validate (AC-3, AC-5)', () => {
  it('accepts a coherent workflow', () => {
    const { workflow, errors, warnings } = check(
      QUICK.replace('kind: implement', `kind: implement\n    ${allStops}`).replace(
        'kind: review',
        `kind: review\n    ${allStops}`,
      ),
    )
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(workflow?.steps.map(step => step.id)).toEqual(['implement', 'review'])
  })

  it('reports a form error with the same position as the grammar (AC-2)', () => {
    const { workflow, errors } = check(QUICK.replace('version: 1', 'version: 2'))
    expect(workflow).toBeUndefined()
    expect(errors).toEqual([
      { file: 'quick.yaml', line: 1, key: 'version', problem: 'unknown value 2', fix: 'use 1' },
    ])
  })

  it.each([
    [
      'a skill that is not installed',
      QUICK.replace('kind: review', 'kind: review\n    skill: missing-skill'),
      {
        line: 9,
        key: 'steps.review.skill',
        problem: "skill 'missing-skill' is not installed",
        fix: "install it, or name an installed skill in 'skill'",
      },
    ],
    [
      'a generic step with no skill',
      QUICK.replace('kind: review', 'kind: generic'),
      {
        line: 7,
        key: 'steps.review',
        problem: 'a generic step has no default skill',
        fix: "add 'skill' with the skill to run",
      },
    ],
    [
      '`uses` with a skill name',
      QUICK.replace('kind: review', 'kind: review\n    uses: my-skill'),
      {
        line: 9,
        key: 'steps.review.uses',
        problem: "'uses' does not name a skill: 'my-skill'",
        fix: 'write skill: my-skill',
      },
    ],
    [
      'an input no launch argument or earlier step provides',
      'version: 1\nname: quick\nsteps:\n  review:\n    kind: review\n',
      {
        line: 4,
        key: 'steps.review',
        problem: "input 'pr' is neither a launch argument nor an output of an earlier step",
        fix: "put a step that returns 'pr' before it",
      },
    ],
    [
      'a gate key the registry does not hold',
      QUICK.replace('[quality-gate]', '[quality-gate, e2e]'),
      {
        line: 6,
        key: 'steps.implement.gates.1',
        problem: "unknown gate key 'e2e'",
        fix: 'use one of quality-gate, smoke-tests',
      },
    ],
    [
      'a gate key in a list written one item per line',
      QUICK.replace('gates: [quality-gate]', 'gates:\n      - quality-gate\n      - e2e'),
      {
        line: 8,
        key: 'steps.implement.gates.1',
        problem: "unknown gate key 'e2e'",
        fix: 'use one of quality-gate, smoke-tests',
      },
    ],
    [
      'an unsafe text nested in a list of the options',
      QUICK.replace(
        'kind: review',
        'kind: generic\n    skill: my-skill\n    with:\n      notes:\n        - fine\n        - text: "a`b"',
      ),
      {
        line: 13,
        key: 'steps.review.with.notes.1.text',
        problem: '"a`b" is not safe to hand to an agent',
        fix: 'write short plain text: no backtick, no $(, no line break',
      },
    ],
    [
      'an option the kind does not declare',
      QUICK.replace('kind: review', 'kind: review\n    with:\n      floor: Major'),
      {
        line: 10,
        key: 'steps.review.with.floor',
        problem: "unknown key 'floor'",
        fix: 'use one of publication, blocking',
      },
    ],
    [
      'an option text that is not safe to hand to an agent',
      QUICK.replace(
        'kind: review',
        'kind: generic\n    skill: my-skill\n    with:\n      note: "a`b"',
      ),
      {
        line: 11,
        key: 'steps.review.with.note',
        problem: '"a`b" is not safe to hand to an agent',
        fix: 'write short plain text: no backtick, no $(, no line break',
      },
    ],
  ])('refuses %s', (_name, text, expected) => {
    const { workflow, errors, warnings } = check(text)
    expect(workflow).toBeUndefined()
    expect(warnings).toEqual([])
    expect(errors).toContainEqual({ file: 'quick.yaml', ...expected })
  })

  it('names the registry as the fix when it holds no key', () => {
    const { errors } = check(QUICK, { gateKeys: [] })
    expect(errors.map(error => error.fix)).toEqual([
      "give each gate a 'Key' in the Custom Gate Registry of way-of-working.md",
    ])
  })

  it('checks gate keys only where the kind declares gates: a generic `with` is free', () => {
    const text = QUICK.replace(
      'kind: review',
      'kind: generic\n    skill: my-skill\n    with:\n      gates: [whatever]',
    )
    expect(check(text).errors).toEqual([])
  })

  it('lets a later step use an output of an earlier one', () => {
    const { errors } = check(QUICK.replace('kind: review', 'kind: generic\n    skill: my-skill'))
    expect(errors).toEqual([])
  })

  it('refuses an unmet input even when the launch provides nothing', () => {
    const { errors } = check(QUICK, { launchInputs: [] })
    expect(errors.map(error => error.problem)).toEqual([
      "input 'card' is neither a launch argument nor an output of an earlier step",
      "input 'card' is neither a launch argument nor an output of an earlier step",
    ])
  })
})

describe('step context (#698 AC-5)', () => {
  const stopped = QUICK.replace('kind: implement', `kind: implement\n    ${allStops}`).replace(
    'kind: review',
    `kind: review\n    ${allStops}`,
  )

  it.each(['handoff', 'resume', 'fresh'])('validates review context %s', context => {
    const { workflow, errors, warnings } = check(
      stopped.replace('kind: review', `kind: review\n    context: ${context}`),
    )
    expect(workflow).toBeDefined()
    expect(errors).toEqual([])
    expect(warnings).toEqual(
      context === 'fresh'
        ? []
        : [
            expect.objectContaining({
              key: 'steps.review.context',
              problem: expect.stringMatching(/independen/i),
            }),
          ],
    )
  })

  it('warns when the first step requests resume', () => {
    const { workflow, errors, warnings } = check(
      stopped.replace('kind: implement', 'kind: implement\n    context: resume'),
    )
    expect(workflow).toBeDefined()
    expect(errors).toEqual([])
    expect(warnings.map(warning => warning.key)).toEqual(['steps.implement.context'])
  })

  it.each([
    ['different engines', 'codex', true, ['steps.follow-up.context']],
    ['engine without resume', 'claude', false, ['steps.follow-up.context']],
    ['same engine with resume', 'claude', true, []],
    ['unknown engine facts', undefined, undefined, []],
  ] as const)('validates resume with %s', (_name, engine, supports, warningKeys) => {
    const host = {
      ...deps,
      resume: {
        engineFor: (step: string) => (step === 'implement' ? 'claude' : engine),
        supports: () => supports,
      },
    }
    const { workflow, errors, warnings } = check(
      stopped.replace(
        'review:\n    kind: review',
        'follow-up:\n    kind: generic\n    skill: my-skill\n    context: resume',
      ),
      host,
    )
    expect(workflow).toBeDefined()
    expect(errors).toEqual([])
    expect(warnings.map(warning => warning.key)).toEqual(warningKeys)
  })

  it.each([
    {
      path: 'configured single round',
      reviewFailure: 'continue',
      fixEngine: 'codex',
      loopMax: 1,
      mismatch: true,
    },
    { path: 'unconditional fix', reviewFailure: 'continue', mismatch: true },
    { path: 'conditional fix', reviewFailure: 'continue', when: ', when: { has: [repair] }' },
    {
      path: 'early round failure',
      reviewFailure: 'continue',
      beforeFix: '      prepare: { kind: generic, skill: my-skill }\n',
    },
    { path: 'stopped review', reviewFailure: 'stop', fixEngine: 'codex', mismatch: true },
  ])('R760-07 (#698 AC-5): validates resume after $path', test => {
    const { errors, warnings } = check(
      `version: 1
name: quick
steps:
  implement: { kind: implement, ${allStops} }
  review-rounds:
    kind: loop
    until: review
    max: 3
    on-max: escalate
    steps:
      review:
        kind: review
        context: resume
        escalate: { failed: ${test.reviewFailure}, blocked: stop, needs-decision: stop }
${test.beforeFix ?? ''}      fix: { kind: fix, ${allStops}${test.when ?? ''} }
`,
      {
        resume: {
          engineFor: step => {
            if (step === 'implement') return 'claude'
            if (step === 'review-rounds/fix') return test.fixEngine ?? 'claude'
            return 'codex'
          },
          supports: () => true,
          ...('loopMax' in test && { loopMax: () => test.loopMax }),
        },
      },
    )
    expect(errors).toEqual([])
    expect(
      warnings
        .filter(warning => warning.key === 'steps.review-rounds.steps.review.context')
        .map(warning => warning.problem),
    ).toEqual([
      'non-fresh context compromises review independence',
      ...(test.mismatch ? ["engine 'codex' differs from the preceding engine"] : []),
    ])
  })

  it.each([
    { path: 'earlier step stops on failure', mismatch: true },
    { path: 'early round failure', editCanEndRound: true },
    { path: 'trailing repair after failed verification', repairEngine: 'codex' },
    { path: 'successful verification', verifyEngine: 'codex', repairEngine: 'claude' },
    {
      path: 'repair is unreachable',
      verifyFailure: 'stop',
      repairEngine: 'codex',
      mismatch: true,
    },
    {
      path: 'only success can reach a Codex summary',
      outcomes: 'ok',
      repairEngine: 'codex',
      mismatch: true,
    },
    {
      path: 'only exhaustion can reach a Claude summary',
      outcomes: 'exhausted',
      repairEngine: 'codex',
      summaryEngine: 'claude',
      mismatch: true,
    },
    {
      path: 'success can resume Claude',
      outcomes: 'ok',
      repairEngine: 'codex',
      summaryEngine: 'claude',
    },
    { path: 'exhaustion can resume Codex', outcomes: 'exhausted', repairEngine: 'codex' },
    {
      path: 'child success leaves only a Claude predecessor',
      output: 'rounds/verify.status',
      outcomes: 'ok',
      repairEngine: 'codex',
      mismatch: true,
    },
    {
      path: 'child repair success excludes both verification success and an early failure',
      output: 'rounds/repair.status',
      outcomes: 'ok',
      repairEngine: 'codex',
      summaryEngine: 'claude',
      editCanEndRound: true,
      mismatch: true,
    },
    {
      path: 'child verification success can resume Claude',
      output: 'rounds/verify.status',
      outcomes: 'ok',
      repairEngine: 'codex',
      summaryEngine: 'claude',
    },
    {
      path: 'child repair success can resume Codex',
      output: 'rounds/repair.status',
      outcomes: 'ok',
      repairEngine: 'codex',
    },
    {
      path: 'failed child can only reach its early round exit',
      output: 'rounds/edit.status',
      outcomes: 'failed',
      editCanEndRound: true,
      editEngine: 'claude',
      repairEngine: 'codex',
      mismatch: true,
    },
    {
      path: 'both exits differ from Pi',
      outcomes: 'ok, exhausted',
      repairEngine: 'codex',
      summaryEngine: 'pi',
      mismatch: true,
    },
    {
      path: 'an intervening step only runs on the excluded exit',
      outcomes: 'exhausted',
      repairEngine: 'codex',
      summaryEngine: 'claude',
      beforeSummary: 'ok',
      mismatch: true,
    },
  ])('R760-08 (#698 AC-5): validates post-loop resume when $path', test => {
    const repair = test.repairEngine
      ? `      repair: { kind: generic, skill: my-skill, ${allStops} }\n`
      : ''
    const when = (outcomes: string, output = 'rounds.status') =>
      `, when: { output: ${output}, is: [${outcomes}] }`
    const beforeSummary = test.beforeSummary
      ? `  notify: { kind: generic, skill: my-skill, ${allStops}${when(test.beforeSummary)} }\n`
      : ''
    const summaryEngine = test.summaryEngine ?? 'codex'
    const { errors, warnings } = check(
      `version: 1
name: quick
steps:
  rounds:
    kind: loop
    until: verify
    max: 3
    escalate: { exhausted: continue }
    steps:
      edit: { kind: generic, skill: my-skill, ${test.editCanEndRound ? decisionStops : allStops} }
      verify:
        kind: generic
        skill: my-skill
        escalate: { failed: ${test.verifyFailure ?? 'continue'}, blocked: stop, needs-decision: stop }
${repair}${beforeSummary}  summary: { kind: generic, skill: my-skill, context: resume, ${allStops}${test.outcomes ? when(test.outcomes, test.output) : ''} }
`,
      {
        resume: {
          engineFor: step => {
            if (step === 'rounds/edit') return test.editEngine ?? 'codex'
            if (step === 'rounds/verify') return test.verifyEngine ?? 'claude'
            if (step === 'rounds/repair') return test.repairEngine
            if (step === 'summary' || step === 'notify') return summaryEngine
            return 'codex'
          },
          supports: () => true,
        },
      },
    )
    expect(errors).toEqual([])
    const contextWarnings = warnings.filter(({ key }) => key.endsWith('.context'))
    expect(contextWarnings.map(({ key, problem }) => [key, problem])).toEqual(
      test.mismatch
        ? [['steps.summary.context', `engine '${summaryEngine}' differs from the preceding engine`]]
        : [],
    )
  })
})

describe('step prompts (#698 AC-7, AC-9 and approved design §4)', () => {
  const withPromptOptions = (options: string) =>
    QUICK.replace('kind: review', `kind: review\n    ${options}`)

  it.each([
    ['placement without a prompt', 'prompt-at: before', 'steps.review.prompt-at', /prompt/i],
    [
      'unknown placement',
      'prompt: Check tests\n    prompt-at: last',
      'steps.review.prompt-at',
      /unknown/i,
    ],
    [
      'unsafe prompt text',
      'prompt: |-\n      Check tests\n      Refuse a`b',
      'steps.review.prompt',
      /safe/i,
    ],
  ] as const)('refuses %s', (_name, options, key, problem) => {
    const { workflow, errors } = check(withPromptOptions(options))
    expect(errors).toEqual([
      expect.objectContaining({ key, problem: expect.stringMatching(problem) }),
    ])
    expect(workflow).toBeUndefined()
  })

  it('accepts safe multiline prose with placement', () => {
    const { workflow, errors } = check(
      withPromptOptions(
        'prompt-at: before\n    prompt: |-\n      Check tests\n      Report failures',
      ),
    )
    expect(errors).toEqual([])
    expect(workflow?.steps[1]).toMatchObject({
      prompt: 'Check tests\nReport failures',
      'prompt-at': 'before',
    })
  })
})

describe('validate: on-failed (#708 AC-7)', () => {
  const withContinue = (kind: 'implement' | 'review', other: 'implement' | 'review') =>
    QUICK.replace(
      `kind: ${kind}`,
      `kind: ${kind}\n    on-failed: continue\n    ${decisionStops}`,
    ).replace(`kind: ${other}`, `kind: ${other}\n    ${allStops}`)

  it('warns, without refusing, on the last step', () => {
    const { errors, warnings } = check(withContinue('review', 'implement'))
    expect(errors).toEqual([])
    expect(warnings.map(one => one.key)).toEqual(['steps.review.on-failed'])
  })

  it('accepts continue before the last step without a warning', () => {
    expect(check(withContinue('implement', 'review')).warnings).toEqual([])
  })

  it('refuses any other value', () => {
    const { errors } = check(QUICK.replace('kind: review', 'kind: review\n    on-failed: retry'))
    expect(errors.map(one => one.key)).toEqual(['steps.review.on-failed'])
  })
})

describe('validate: escalate and on-failed (#728 AC 10)', () => {
  const onFailed = (rules: string) =>
    QUICK.replace(
      'kind: implement',
      `kind: implement\n    on-failed: continue\n    escalate:\n${rules}`,
    )

  it.each([
    ['the same outcome', '      failed: continue'],
    ['a different status', '      blocked: stop'],
  ])('accepts a rule for %s alongside the shorthand', (_name, rule) => {
    expect(check(onFailed(rule)).errors).toEqual([])
  })

  it('reports the conflicting failed rule with its line and fix', () => {
    expect(check(onFailed('      failed: stop')).errors).toEqual([
      {
        file: 'quick.yaml',
        line: 8,
        key: 'steps.implement.escalate.failed',
        problem: expect.stringMatching(/conflict.*on-failed|on-failed.*conflict/i),
        fix: expect.stringMatching(/on-failed|escalate/),
      },
    ])
  })
})

describe('invalid escalation and jump rules (#728 AC-16)', () => {
  it.each([
    ['escalate: { needs-human: stop }', 'steps.implement.escalate.needs-human'],
    ['escalate: { failed: retry }', 'steps.implement.escalate.failed'],
    ['escalate: { failed: { do: goto } }', 'steps.implement.escalate.failed.do'],
    ['goto: review', 'steps.implement.goto'],
  ])('refuses %s', (rule, key) => {
    const result = check(QUICK.replace('    kind: implement', `    kind: implement\n    ${rule}`))
    expect(result.workflow).toBeUndefined()
    expect(result.errors).toContainEqual(expect.objectContaining({ key }))
  })
})

it.each([
  { step: 'implement', valid: true },
  { step: 'review', valid: false },
  { step: 'missing', valid: false },
])('validates that a resume route names an earlier step ($step, #726)', ({ step, valid }) => {
  const { errors } = check(QUICK + `    on-resume: { reason: head-moved, step: ${step} }\n`)
  expect(errors.map(error => error.key)).toEqual(valid ? [] : ['steps.review.on-resume.step'])
})

describe('#704 AC-6: agent execution options', () => {
  function errors(kind: string, options: string) {
    return check(
      `version: 1
name: quick
steps:
  work: { kind: ${kind}, ${options} }
`,
      { launchInputs: ['card', 'pr', 'head', 'reviewedHead', 'gatedHead'] },
    ).errors
  }

  it('accepts an agent timeout and zero retries', () => {
    expect(errors('implement', 'timeout-minutes: 2, retries: 0')).toEqual([])
  })

  it.each([
    ['retries', -1],
    ['retries', 1.5],
    ['timeout-minutes', 0],
    ['timeout-minutes', 1.5],
    ['timeout-minutes', 35_792],
  ])('rejects %s: %s', (key, value) => {
    expect(errors('implement', `${key}: ${value}`)).toContainEqual(
      expect.objectContaining({ key: `steps.work.${key}` }),
    )
  })

  it.each(['gate', 'merge', 'approval'])('rejects agent options on %s', kind => {
    const options = kind === 'gate' ? 'with: { checks: [ci-green] }, ' : ''
    expect(errors(kind, options + 'timeout-minutes: 2, retries: 1')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'steps.work.timeout-minutes' }),
        expect.objectContaining({ key: 'steps.work.retries' }),
      ]),
    )
  })
})
