import { kindByName, settle } from '.'
import { buildMessage, readResult } from '../dispatch'
import { start, type StepLaunch } from '../engine'
import { createMemoryFiles } from '../engine/memory-files'
import { runSteps, type WorkflowHost } from '../host'
import { renderKindReference } from './reference'

// #652 r0-1 — design §3: "`review` returns `status: failed` when it has at least one blocking
// finding, `ok` otherwise." The review kind enforces its own rule and its launch message states it.

const HEAD = 'a'.repeat(40)
const BLOCKING = { id: 'F1', severity: 'Critical', title: 'data loss', blocking: true }
const fenced = (value: unknown) => `Done.\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``
const reviewed = (over: Record<string, unknown>) => ({
  status: 'ok',
  summary: 'reviewed',
  verdict: 'approved',
  reviewedHead: HEAD,
  findings: [],
  ...over,
})

const CONTRADICTIONS = [
  [
    'changes-requested with a blocking finding',
    { verdict: 'changes-requested', findings: [BLOCKING] },
  ],
  ['approved with a blocking finding', { findings: [BLOCKING] }],
  [
    'a blocking finding after a non-blocking one',
    { findings: [{ ...BLOCKING, id: 'F0', severity: 'Minor', blocking: false }, BLOCKING] },
  ],
  ['changes-requested with no blocking finding', { verdict: 'changes-requested' }],
] as const

describe('review result: `ok` contradicts a blocking finding (r0-1, design §3)', () => {
  it.each(CONTRADICTIONS)('settle does not accept as ok: %s', (_name, over) => {
    expect(settle(kindByName.review, reviewed(over)).status).toBe('failed')
  })

  it.each(CONTRADICTIONS)('readResult does not accept as ok: %s', (_name, over) => {
    expect(readResult(fenced(reviewed(over)), kindByName.review).status).toBe('failed')
  })
})

describe('review result: a failed review carries its outputs (r0-1)', () => {
  // A-2: the rule is on a result the agent returned. A reason of the agent's own does not lift it;
  // only the reasons the host and the validator write (no-result, unsafe-value, invalid-result) do.
  it.each([
    ['verdict', {}],
    ['reviewedHead', {}],
    ['findings', {}],
    ['verdict', { reason: 'blocking-findings' }],
    ['reviewedHead', { reason: 'blocking-findings' }],
    ['findings', { reason: 'blocking-findings' }],
  ] as const)('a failed review without %s (%j) is an invalid result naming it', (missing, over) => {
    const failed = reviewed({
      status: 'failed',
      verdict: 'changes-requested',
      findings: [BLOCKING],
      ...over,
    })
    const rest = Object.fromEntries(Object.entries(failed).filter(([name]) => name !== missing))
    const result = settle(kindByName.review, rest)
    expect(result).toMatchObject({ status: 'failed', reason: 'invalid-result' })
    expect(result.detail).toContain(missing)
  })
})

describe('review launch message states the rule (r0-1)', () => {
  const review: StepLaunch = {
    id: 'review',
    kind: 'review',
    uses: 'pair-process-review',
    with: {},
    inputs: { card: '627', pr: 12, head: HEAD },
  }

  it.each(['slash', 'instruction'] as const)(
    'in the %s style: one line ties a blocking finding to status "failed"',
    style => {
      const message = buildMessage(review, kindByName.review, { style, isSafeText: () => true })
      expect(
        message.split('\n').filter(line => /blocking/i.test(line) && /failed/.test(line)),
      ).not.toEqual([])
    },
  )

  it.each(['slash', 'instruction'] as const)(
    'in the %s style: the line that requires verdict, reviewedHead, findings names status "failed" too',
    style => {
      const message = buildMessage(review, kindByName.review, { style, isSafeText: () => true })
      const required = message
        .split('\n')
        .filter(
          line =>
            /required/i.test(line) &&
            ['verdict', 'reviewedHead', 'findings'].every(name => line.includes(name)),
        )
      expect(required).not.toEqual([])
      expect(required.filter(line => !/failed/.test(line))).toEqual([])
    },
  )
})

describe('kind reference page: the review outputs (r0-1)', () => {
  it('the Outputs line of the review section says they are required of a failed review too', () => {
    const section = renderKindReference()
      .split('\n## ')
      .find(one => one.startsWith('review\n'))
    const outputs = section?.split('\n').filter(line => line.startsWith('- **Outputs**'))
    expect(outputs).toHaveLength(1)
    expect(outputs?.[0]).toMatch(/failed/)
  })
})

describe('runSteps: a review that answers ok with a blocking finding (r0-1)', () => {
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
  const contradicted = fenced(
    reviewed({ summary: 'changes requested', verdict: 'changes-requested', findings: [BLOCKING] }),
  )

  /** A host whose review agent gives `reviews` in order, one per launch. */
  function hostOf(reviews: string[]) {
    const launched: string[] = []
    const host: WorkflowHost = {
      files: createMemoryFiles(),
      style: 'slash',
      isSafeText: text => !text.includes('`') && !text.includes('\n'),
      launch: async step => {
        launched.push(step.id)
        return step.kind === 'review' ? reviews.shift() : implemented
      },
      report: () => undefined,
    }
    return { host, launched }
  }

  const reviewRecord = (host: WorkflowHost) =>
    (
      JSON.parse(host.files.readFileSync(`${dir}/state.json`)) as {
        steps: Record<string, { state: string; reason?: string; outputs?: unknown }>
      }
    ).steps['review']
  const reviewState = (host: WorkflowHost) => reviewRecord(host)?.state

  it('ends the run failed at the review step, which is not recorded ok', async () => {
    const { host } = hostOf([contradicted])
    await start({ files: host.files, dir }, source, { card: '627' })

    const outcome = await runSteps(host, dir)

    expect(outcome.run).toBe('failed')
    expect(reviewState(host)).toBe('failed')
  })

  it('records why, and keeps what the review found (A-3)', async () => {
    const { host } = hostOf([contradicted])
    await start({ files: host.files, dir }, source, { card: '627' })

    const outcome = await runSteps(host, dir)

    const kept = { verdict: 'changes-requested', reviewedHead: HEAD, findings: [BLOCKING] }
    expect(outcome.last).toMatchObject({
      step: 'review',
      state: 'failed',
      reason: 'invalid-result',
    })
    expect(reviewRecord(host)).toMatchObject({ reason: 'invalid-result', outputs: kept })
    expect(JSON.parse(host.files.readFileSync(`${dir}/steps/review/result.json`))).toMatchObject({
      status: 'failed',
      reason: 'invalid-result',
      ...kept,
    })
  })

  it('runs the review again on the next launch, and an approved review then ends the run done', async () => {
    const { host, launched } = hostOf([contradicted, fenced(reviewed({}))])
    await start({ files: host.files, dir }, source, { card: '627' })
    await runSteps(host, dir)
    await start({ files: host.files, dir }, source, { card: '627' })

    const outcome = await runSteps(host, dir)

    expect(launched).toEqual(['implement', 'review', 'review'])
    expect(outcome.run).toBe('done')
    expect(reviewState(host)).toBe('ok')
  })
})
