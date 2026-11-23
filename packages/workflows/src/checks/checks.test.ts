import { runGate, type FactReader } from '.'

const facts = (over: Partial<FactReader> = {}): FactReader => ({
  ci: async () => 'green',
  head: async () => 'h1',
  reviewedHead: async () => 'h1',
  reviewApproved: async () => true,
  openPrerequisites: async () => [],
  ...over,
})
const registry = { a: 'cmd-a', b: 'cmd-b' }
const ran: string[] = []
const run = (fail?: string) => async (command: string) => {
  ran.push(command)
  return { code: command === fail ? 1 : 0, output: `out ${command}` }
}
beforeEach(() => (ran.length = 0))

describe('gate gates (#680 AC-1)', () => {
  it('runs registry commands in order', async () => {
    const result = await runGate({ gates: ['b', 'a'] }, { registry, run: run(), facts: facts() })
    expect(result.status).toBe('ok')
    expect(ran).toEqual(['cmd-b', 'cmd-a'])
  })
  it('fails at the first failure with its output, running no later gate', async () => {
    const result = await runGate(
      { gates: ['a', 'b'] },
      { registry, run: run('cmd-a'), facts: facts() },
    )
    expect(result).toMatchObject({
      status: 'failed',
      reason: 'gate-failed: a',
      detail: 'out cmd-a',
    })
    expect(ran).toEqual(['cmd-a'])
  })
  it('fails on an unknown key without running anything', async () => {
    const result = await runGate({ gates: ['zzz'] }, { registry, run: run(), facts: facts() })
    expect(result).toMatchObject({ status: 'failed', reason: 'unknown-gate' })
    expect(ran).toEqual([])
  })
})

describe('gate without platform facts', () => {
  it('fails checks rather than assume, and still runs gates', async () => {
    expect(await runGate({ gates: ['a'] }, { registry, run: run() })).toMatchObject({
      status: 'ok',
    })
    expect(await runGate({ checks: ['ci-green'] }, { registry, run: run() })).toMatchObject({
      status: 'failed',
      reason: 'no-platform-adapter',
    })
  })
})

describe('gate checks (#680 AC-2)', () => {
  const only = (
    check: 'head-unchanged' | 'review-approved' | 'prerequisites-done',
    over: Partial<FactReader>,
  ) => runGate({ checks: [check] }, { registry, run: run(), facts: facts(over) })

  it.each([
    ['head-unchanged', {}, 'ok'],
    ['head-unchanged', { head: async () => 'h2' }, 'head-changed'],
    ['head-unchanged', { reviewedHead: async () => undefined }, 'head-changed'],
    ['review-approved', {}, 'ok'],
    ['review-approved', { reviewApproved: async () => false }, 'review-not-approved'],
    ['prerequisites-done', {}, 'ok'],
    ['prerequisites-done', { openPrerequisites: async () => ['12'] }, 'prerequisites-open: 12'],
  ] as const)('%s with %#: %s', async (check, over, expected) => {
    const result = await only(check, over)
    expect(expected === 'ok' ? result.status : result.reason).toBe(expected)
  })

  it('ci-green fails at once on red CI', async () => {
    const result = await runGate(
      { checks: ['ci-green'] },
      { registry, run: run(), facts: facts({ ci: async () => 'red' }) },
    )
    expect(result.reason).toBe('ci-red')
  })
  it('ci-green waits while pending, then passes', async () => {
    const answers = ['pending', 'pending', 'green'] as const
    let i = 0
    const sleeps: number[] = []
    const result = await runGate(
      { checks: ['ci-green'] },
      {
        registry,
        run: run(),
        facts: facts({ ci: async () => answers[i++] ?? 'green' }),
        sleep: async ms => void sleeps.push(ms),
        pollMs: 5,
      },
    )
    expect(result.status).toBe('ok')
    expect(sleeps).toEqual([5, 5])
  })
  it('ci-green expires at its timeout with reason ci-timeout', async () => {
    let t = 0
    const result = await runGate(
      { checks: ['ci-green'], 'timeout-minutes': 2 },
      {
        registry,
        run: run(),
        facts: facts({ ci: async () => 'pending' }),
        sleep: async ms => void (t += ms),
        now: () => t,
        pollMs: 60_000,
      },
    )
    expect(result.reason).toBe('ci-timeout')
    expect(t).toBe(120_000)
  })
  it('does not wait past the configured timeout (#726 AC-1)', async () => {
    let t = 0
    const result = await runGate(
      { checks: ['ci-green'], 'timeout-minutes': 1 },
      {
        registry,
        run: run(),
        facts: facts({ ci: async () => 'pending' }),
        sleep: async ms => void (t += ms),
        now: () => t,
        pollMs: 40_000,
      },
    )
    expect(result.reason).toBe('ci-timeout')
    expect(t).toBe(60_000)
  })
})

it('fails a check when platform facts cannot be read (#726 AC-1)', async () => {
  const result = await runGate(
    { checks: ['ci-green'] },
    {
      registry,
      run: run(),
      facts: facts({
        ci: async () => {
          throw new Error('offline')
        },
      }),
    },
  )
  expect(result).toMatchObject({ status: 'failed', reason: 'fact-unreadable', detail: 'offline' })
})

it('does not accept a green read that finishes after the CI deadline (#726 T-5)', async () => {
  let time = 0
  const result = await runGate(
    { checks: ['ci-green'], 'timeout-minutes': 1 },
    {
      registry,
      run: run(),
      now: () => time,
      facts: facts({
        ci: async () => {
          time = 60_001
          return 'green'
        },
      }),
    },
  )
  expect(result).toMatchObject({ status: 'failed', reason: 'ci-timeout' })
})
