import { kindByName, settle } from '.'
import { buildMessage } from '../dispatch'
import { start, type StepLaunch } from '../engine'
import { createMemoryFiles } from '../engine/memory-files'
import { runSteps, type WorkflowHost } from '../host'
import { renderKindReference } from './reference'

// #652 r0-1 — controls: what the review rule of design §3 must leave as it is.

const HEAD = 'a'.repeat(40)
const BLOCKING = { id: 'F1', severity: 'Critical', title: 'data loss', blocking: true }
const NOTE = { id: 'F2', severity: 'Minor', title: 'a typo', blocking: false }
const approved = { status: 'ok', summary: 'approved', verdict: 'approved', reviewedHead: HEAD }
const changes = { ...approved, summary: 'reviewed', verdict: 'changes-requested' }
const PARKED = {
  ...changes,
  status: 'needs-decision',
  summary: 'a person decides',
  findings: [BLOCKING],
}
const fenced = (value: unknown) => `Done.\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``

describe('review result: what stays as returned (r0-1 controls, design §3)', () => {
  it.each([
    ['ok, approved, no finding', { ...approved, findings: [] }],
    ['ok, approved, non-blocking findings only', { ...approved, findings: [NOTE] }],
    [
      'failed, changes-requested, with its blocking finding',
      {
        status: 'failed',
        summary: 'one blocking finding',
        verdict: 'changes-requested',
        reviewedHead: HEAD,
        findings: [NOTE, BLOCKING],
      },
    ],
    ['needs-decision, with no output', { status: 'needs-decision', summary: 'the head moved' }],
    ['needs-decision, with its verdict and a blocking finding', PARKED],
    [
      'failed, approved, no blocking finding, complete (A-4)',
      { ...approved, status: 'failed', summary: 'could not finish', findings: [NOTE] },
    ],
  ])('%s', (_name, value) => {
    expect(settle(kindByName.review, value)).toEqual(value)
  })

  it('an ok review without its outputs stays an invalid result', () => {
    expect(settle(kindByName.review, { status: 'ok', summary: 'approved' })).toMatchObject({
      status: 'failed',
      reason: 'invalid-result',
    })
  })
})

describe('review result: a failure the agent did not return (r0-1 controls, A-2)', () => {
  it.each([
    { status: 'failed', reason: 'no-result', summary: 'the agent ended without a final message' },
    { status: 'failed', reason: 'unsafe-value', summary: 'unsafe-value: "x" cannot be handed' },
    {
      status: 'failed',
      reason: 'invalid-result',
      summary: 'the final message carries no review result',
      detail: 'no fenced json block in the final message',
    },
  ])('settle keeps %j as it is, with no review output', value => {
    expect(settle(kindByName.review, value)).toEqual(value)
  })

  const failed = { ...changes, status: 'failed', findings: [BLOCKING] }
  const without = (name: string) =>
    Object.fromEntries(Object.entries(failed).filter(([field]) => field !== name))

  it.each([
    ['ok, changes-requested, a blocking finding', { ...changes, findings: [BLOCKING] }],
    ['ok, approved, a blocking finding', { ...approved, findings: [BLOCKING] }],
    [
      'ok, a blocking finding after a non-blocking one',
      { ...approved, findings: [NOTE, BLOCKING] },
    ],
    ['ok, changes-requested, no blocking finding', { ...changes, findings: [] }],
    ['failed without verdict', without('verdict')],
    ['failed without reviewedHead', without('reviewedHead')],
    ['failed without findings', without('findings')],
  ])('settling twice is settling once: %s', (_name, value) => {
    const once = settle(kindByName.review, value)
    expect(settle(kindByName.review, once)).toEqual(once)
  })
})

describe('runSteps: the review step ends without a review (r0-1 controls)', () => {
  const dir = '/main/.pair/working/runs/quick-627'
  const source = {
    text: 'version: 1\nname: quick\nsteps:\n  implement:\n    kind: implement\n  review:\n    kind: review\n',
    file: 'quick.yaml',
  }
  const implemented = fenced({
    status: 'ok',
    summary: 'PR opened',
    branch: 'feature/US-627-x',
    pr: 12,
    head: HEAD,
  })

  /** A quick run whose review agent ends with `review`, on a host with that safety check. */
  async function run(review: string | undefined, isSafeText = (_text: string) => true) {
    const launched: string[] = []
    const host: WorkflowHost = {
      files: createMemoryFiles(),
      style: 'slash',
      isSafeText,
      launch: async step => {
        launched.push(step.id)
        return step.kind === 'review' ? review : implemented
      },
    }
    await start({ files: host.files, dir }, source, { card: '627' })
    const outcome = await runSteps(host, dir)
    const state = JSON.parse(host.files.readFileSync(`${dir}/state.json`)) as {
      steps: Record<string, unknown>
    }
    return { outcome, launched, recorded: state.steps['review'] }
  }

  it('an agent that died or timed out: no-result, as the host wrote it', async () => {
    const { outcome, recorded } = await run(undefined)

    expect(outcome.run).toBe('failed')
    expect(outcome.last).toMatchObject({ step: 'review', state: 'failed', reason: 'no-result' })
    expect(recorded).toMatchObject({ state: 'failed', reason: 'no-result' })
  })

  it('a final message with no fenced json block: invalid-result, with that detail', async () => {
    const detail = 'no fenced json block in the final message'

    const { outcome, recorded } = await run('All done.')

    expect(outcome.last).toMatchObject({ step: 'review', reason: 'invalid-result', detail })
    expect(recorded).toMatchObject({ state: 'failed', reason: 'invalid-result', detail })
  })

  it('an input the host will not hand to an agent: unsafe-value, the review is not launched', async () => {
    const { outcome, launched, recorded } = await run(undefined, text => text !== HEAD)

    expect(launched).toEqual(['implement'])
    expect(outcome.last).toMatchObject({ step: 'review', state: 'failed', reason: 'unsafe-value' })
    expect(recorded).toMatchObject({ state: 'failed', reason: 'unsafe-value' })
  })

  it('a review that needs a person, with a blocking finding: the run is parked, not failed', async () => {
    const { outcome, recorded } = await run(fenced(PARKED))

    expect(outcome.run).toBe('parked')
    expect(recorded).toMatchObject({ state: 'needs-decision' })
  })
})

describe('the review rule belongs to the review kind (r0-1 controls)', () => {
  it.each([
    ['implement', { status: 'failed', summary: 'gate red', reason: 'quality-gate' }],
    ['generic', { status: 'failed', summary: 'no' }],
    ['generic', { status: 'ok', summary: 'done', findings: [BLOCKING] }],
  ] as const)('%s keeps %j as returned', (kind, value) => {
    expect(settle(kindByName[kind], value)).toEqual(value)
  })

  const STEPS: Record<'implement' | 'generic', StepLaunch> = {
    implement: {
      id: 'implement',
      kind: 'implement',
      uses: 'pair-process-implement',
      with: {},
      inputs: { card: '627' },
    },
    generic: { id: 'notify', kind: 'generic', uses: 'my-skill', with: {}, inputs: { card: '627' } },
  }
  const messageOf = (kind: 'implement' | 'generic', style: 'slash' | 'instruction') =>
    buildMessage(STEPS[kind], kindByName[kind], { style, isSafeText: () => true }).split('\n')

  it.each([
    ['implement', 'slash'],
    ['implement', 'instruction'],
    ['generic', 'slash'],
    ['generic', 'instruction'],
  ] as const)('the %s launch message does not state it (%s style)', (kind, style) => {
    expect(
      messageOf(kind, style).filter(line => /blocking/i.test(line) && /failed/.test(line)),
    ).toEqual([])
  })

  it.each(['slash', 'instruction'] as const)(
    'the implement message still requires its outputs of an ok step only (%s style)',
    style => {
      expect(messageOf('implement', style)).toContain(
        'Required when status is "ok": branch, pr, head.',
      )
    },
  )

  it.each(['slash', 'instruction'] as const)(
    'the generic message requires no output (%s style)',
    style => {
      expect(messageOf('generic', style).filter(line => /required/i.test(line))).toEqual([])
    },
  )

  it.each(['implement', 'generic'])(
    'the %s section of the kind reference keeps its Outputs line',
    kind => {
      const section = renderKindReference()
        .split('\n## ')
        .find(one => one.startsWith(`${kind}\n`))
      expect(section?.split('\n')).toContain('- **Outputs**, required when `status` is `ok`')
    },
  )
})
