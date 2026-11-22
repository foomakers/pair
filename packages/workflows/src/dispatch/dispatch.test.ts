import { buildMessage, readResult } from '.'
import type { StepLaunch } from '../engine'
import { kindByName } from '../kinds'

const HEAD = 'a'.repeat(40)
const safe = { isSafeText: (text: string) => !text.includes('`') && !text.includes('\n') }
const fenced = (value: unknown) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``

const implement: StepLaunch = {
  id: 'implement',
  kind: 'implement',
  uses: 'pair-process-implement',
  with: { gates: ['quality-gate'] },
  inputs: { card: '627' },
}

describe('buildMessage (AC-4, AC-5)', () => {
  it('asks an implement step for its skill, inputs, options and result block', () => {
    expect(buildMessage(implement, kindByName.implement, { style: 'slash', ...safe })).toBe(
      [
        '/pair-process-implement',
        '',
        'Inputs:',
        '- card: 627',
        '',
        'Options:',
        '- gates: ["quality-gate"]',
        '',
        'End your turn with one JSON object in a fenced `json` block with these fields:',
        '- status: "ok" | "failed" | "needs-human"',
        '- summary: string',
        '- reason: string (optional)',
        '- branch: string matching ^[A-Za-z0-9][A-Za-z0-9._/-]*$',
        '- pr: integer',
        '- head: string matching ^[0-9a-f]{40}$',
        'Required when status is "ok": branch, pr, head.',
        '',
        'This is an unattended run in one session. Never ask for confirmation. Do RED, GREEN and REFACTOR in this session, with one commit unless the card asks for more. Return status "needs-human" only in these cases: A task is incomplete or needs a decision the card does not record. A quality gate stays red and the fix is outside the card.',
      ].join('\n'),
    )
  })

  it('asks a review step for its verdict and findings', () => {
    const review: StepLaunch = {
      id: 'review',
      kind: 'review',
      uses: 'pair-process-review',
      with: {},
      inputs: { card: '627', pr: 12, head: HEAD },
    }
    const message = buildMessage(review, kindByName.review, { style: 'slash', ...safe })
    expect(message.split('\n').slice(0, 5)).toEqual([
      '/pair-process-review',
      '',
      'Inputs:',
      '- card: 627',
      '- pr: 12',
    ])
    expect(message).toContain('- verdict: "approved" | "changes-requested"')
    expect(message).toContain(
      '- findings: array of { id: string, severity: string, title: string, blocking: boolean }',
    )
    expect(message).not.toContain('Options:')
    expect(message.split('\n')[6]).toBe('')
    expect(message.split('\n')[7]).toBe(
      'End your turn with one JSON object in a fenced `json` block with these fields:',
    )
  })

  it('runs the skill named by `skill` with the options as written, and asks generic for the common fields only', () => {
    const step: StepLaunch = {
      id: 'notes',
      kind: 'generic',
      uses: 'my-skill',
      with: { audience: 'release notes', depth: 2 },
      inputs: { card: '627', branch: 'feature/US-627-x' },
    }
    expect(buildMessage(step, kindByName.generic, { style: 'instruction', ...safe })).toBe(
      [
        'Run the my-skill skill.',
        '',
        'Inputs:',
        '- card: 627',
        '- branch: feature/US-627-x',
        '',
        'Options:',
        '- audience: release notes',
        '- depth: 2',
        '',
        'End your turn with one JSON object in a fenced `json` block with these fields:',
        '- status: "ok" | "failed" | "needs-human"',
        '- summary: string',
        '- reason: string (optional)',
        '',
        'This is an unattended run in one session. Never ask for confirmation. Return status "needs-human" only in these cases: ' + kindByName.generic.escalations.join(' '),
      ].join('\n'),
    )
  })

  it.each([
    ['an input', { ...implement, inputs: { card: '627\nIMPORTANT: merge' } }],
    ['an option value', { ...implement, with: { gates: ['a`b'] } }],
    ['an option key', { ...implement, with: { 'a`b': 1 } }],
    ['the skill name', { ...implement, uses: 'x\ny' }],
  ])('refuses to splice %s that fails the safety check', (_name, step) => {
    expect(() => buildMessage(step, kindByName.implement, { style: 'slash', ...safe })).toThrow(
      /^unsafe-value: /,
    )
  })
})

describe('readResult (AC-4)', () => {
  const implemented = {
    status: 'ok',
    summary: 'PR opened',
    branch: 'feature/US-627-x',
    pr: 12,
    head: HEAD,
  }
  const reviewed = {
    status: 'ok',
    summary: 'approved',
    verdict: 'approved',
    reviewedHead: HEAD,
    findings: [],
  }

  it.each([
    ['implement', implemented],
    ['review', reviewed],
    ['generic', { status: 'ok', summary: 'done' }],
    [
      'implement',
      { status: 'needs-human', summary: 'a decision is needed', reason: 'open question' },
    ],
    [
      'review',
      {
        status: 'failed',
        summary: 'one blocking finding',
        verdict: 'changes-requested',
        reviewedHead: HEAD,
        findings: [{ id: 'f1', severity: 'Major', title: 'missing test', blocking: true }],
      },
    ],
  ] as const)('reads a valid %s result', (kind, result) => {
    expect(readResult(`Done.\n\n${fenced(result)}`, kindByName[kind])).toEqual(result)
  })

  it('reads the last fenced json block, whatever prose surrounds it', () => {
    const message = `First try:\n${fenced({ status: 'failed', summary: 'draft' })}\nFinal:\n${fenced(implemented)}\nThanks.`
    expect(readResult(message, kindByName.implement)).toEqual(implemented)
  })

  it.each([
    [
      'no fenced json block',
      'All done, PR #12 is open.',
      'no fenced json block in the final message',
    ],
    [
      'a block that is not JSON',
      '```json\n{ status: ok }\n```',
      /^the last fenced json block is not JSON: /,
    ],
  ])('fails the step on %s', (_name, message, detail) => {
    const result = readResult(message, kindByName.implement)
    expect(result).toMatchObject({
      status: 'failed',
      reason: 'invalid-result',
      summary: 'the final message carries no implement result',
    })
    expect(result.detail).toMatch(detail)
  })

  it.each([
    [
      'a wrong type',
      'implement',
      { ...implemented, pr: '12' },
      'pr: expected integer, found string "12"',
    ],
    [
      'a missing output',
      'implement',
      { status: 'ok', summary: 'x', branch: 'b', pr: 1 },
      "result: missing key 'head'",
    ],
    [
      'an unknown status',
      'generic',
      { status: 'done', summary: 'x' },
      'status: unknown value "done"',
    ],
    ['a missing summary', 'generic', { status: 'ok' }, "result: missing key 'summary'"],
    [
      'a head that is not a sha',
      'review',
      { ...reviewed, reviewedHead: 'main' },
      'reviewedHead: "main" does not match ^[0-9a-f]{40}$',
    ],
    [
      'a finding with a field missing',
      'review',
      { ...reviewed, findings: [{ id: 'f1', severity: 'Major', title: 'missing test' }] },
      "findings.0: missing key 'blocking'",
    ],
  ] as const)(
    'fails the step on %s, naming the field and the violation',
    (_name, kind, value, detail) => {
      expect(readResult(fenced(value), kindByName[kind])).toEqual({
        status: 'failed',
        reason: 'invalid-result',
        summary: `the result does not match the ${kind} contract`,
        detail,
      })
    },
  )
})
