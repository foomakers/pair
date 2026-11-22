import { next, record, start, type RunDirectory } from '.'
import { createMemoryFiles } from './memory-files'

const DIR = '/main/.pair/working/runs/quick-680'
const H = 'a'.repeat(40)
const IMPLEMENTED = { status: 'ok', summary: 'x', branch: 'b', pr: 1, head: H }
const REVIEWED = (verdict: string) => ({
  status: 'ok',
  summary: 'x',
  verdict,
  reviewedHead: H,
  findings: [],
})
const open = (): RunDirectory => ({ files: createMemoryFiles(), dir: DIR })
const states = (run: RunDirectory) =>
  Object.fromEntries(
    Object.entries(
      JSON.parse(run.files.readFileSync(`${DIR}/state.json`)).steps as Record<
        string,
        { state: string }
      >,
    ).map(([id, s]) => [id, s.state]),
  )
const labels =
  (...l: string[]) =>
  async () => ({ labels: l })

const FLAT = `version: 1
name: quick
steps:
  implement: { kind: implement }
  approve:
    kind: approval
    when: { has: [risk:red] }
  review: { kind: review }
`

describe('when on card facts (#680 AC-6)', () => {
  it('skips the step when the card does not match at that moment, and goes on', async () => {
    const run = open()
    await start(run, { text: FLAT, file: 'workflows/quick.yaml' }, { card: '680' })
    await next(run, labels())
    await record(run, 'implement', IMPLEMENTED)
    const after = await next(run, labels('risk:green'))
    expect(after.skipped).toEqual([{ id: 'approve', kind: 'approval' }])
    expect(after.ready.map(s => s.id)).toEqual(['review'])
    expect(states(run).approve).toBe('skipped')
  })
  it('runs the step when the card matches', async () => {
    const run = open()
    await start(run, { text: FLAT, file: 'workflows/quick.yaml' }, { card: '680' })
    await next(run, labels())
    await record(run, 'implement', IMPLEMENTED)
    const after = await next(run, labels('risk:red'))
    expect(after.ready.map(s => s.id)).toEqual(['approve'])
    expect(after.skipped).toBeUndefined()
  })
})

const QUICK = `version: 1
name: quick
steps:
  implement: { kind: implement }
  review: { kind: review, on-failed: continue }
  fix:
    kind: fix
    when: { output: review.verdict, is: [changes-requested] }
`

describe('when on an output (#680 AC-9)', () => {
  const afterReview = async (result: object) => {
    const run = open()
    await start(run, { text: QUICK, file: 'workflows/quick.yaml' }, { card: '680' })
    await next(run)
    await record(run, 'implement', IMPLEMENTED)
    await next(run)
    await record(run, 'review', result)
    return { run, after: await next(run) }
  }
  it('skips the step when the output is not in the list', async () => {
    const { run, after } = await afterReview(REVIEWED('approved'))
    expect(after).toMatchObject({ run: 'done', skipped: [{ id: 'fix', kind: 'fix' }] })
    expect(states(run).fix).toBe('skipped')
  })
  it('runs the step when the output is in the list', async () => {
    const { after } = await afterReview({
      ...REVIEWED('changes-requested'),
      status: 'failed',
      reason: 'blocking',
    })
    expect(after.ready.map(s => s.id)).toEqual(['fix'])
  })
})

const LOOP = `version: 1
name: quick
steps:
  implement: { kind: implement }
  rounds:
    kind: loop
    until: review
    max: 2
    on-max: fail
    steps:
      review: { kind: review }
      fix:
        kind: fix
        when: { has: [risk:red] }
`

describe('when inside a loop (#680 AC-6)', () => {
  it('a skipped last child closes the round and the next round starts', async () => {
    const run = open()
    await start(run, { text: LOOP, file: 'workflows/quick.yaml' }, { card: '680' })
    await next(run)
    await record(run, 'implement', IMPLEMENTED)
    await next(run)
    await record(run, 'rounds/review', {
      ...REVIEWED('changes-requested'),
      status: 'failed',
      reason: 'blocking',
    })
    const after = await next(run, labels())
    expect(after.skipped).toEqual([{ id: 'rounds/fix', kind: 'fix' }])
    expect(after.ready.map(s => s.id)).toEqual(['rounds/review'])
  })
})
