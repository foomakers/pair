import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validate } from '../src/validate'

it('ships delivery and full with the approved expansion (#700 AC-1, AC-2, AC-6)', () => {
  const dir = resolve(__dirname, '../../knowledge-hub/dataset/.pair/adoption/tech/workflows')
  const source = (name: string) => readFileSync(resolve(dir, `${name}.yaml`), 'utf8')
  const result = validate(source('full'), 'full.yaml', {
    skillExists: name => name !== 'refinement' && name !== 'delivery',
    gateKeys: ['gate-pr', 'target:pr'],
    launchInputs: ['card'],
    isSafeText: () => true,
    resolveWorkflow: name => ({ file: `${name}.yaml`, text: source(name) }),
  })
  expect(source('delivery')).not.toContain('gates: [gate-pr]')
  expect(result.errors).toEqual([])
  expect(result.workflow?.steps.map(step => step.id)).toEqual([
    'refinement/refine',
    'refinement/tasks',
    'delivery/implement',
    'delivery/rounds',
    'delivery/final-review',
    'delivery/checks',
    'delivery/approve',
    'delivery/merge',
  ])
})

it.each([
  {
    name: 'pending to green',
    answers: ['pending', 'green'],
    head: 'a'.repeat(40),
    reason: undefined,
  },
  { name: 'failed CI', answers: ['red'], head: 'a'.repeat(40), reason: 'ci-red' },
  { name: 'timeout', answers: ['pending'], head: 'a'.repeat(40), reason: 'ci-timeout' },
  { name: 'changed head', answers: ['green'], head: 'b'.repeat(40), reason: 'head-changed' },
] as const)('delivery gate: $name (#700 AC-8)', async ({ answers, head, reason }) => {
  const { runGate } = await import('../src/checks')
  const { stepFacts } = await import('../src/cli/workflow-facts')
  const dir = resolve(__dirname, '../../knowledge-hub/dataset/.pair/adoption/tech/workflows')
  const result = validate(readFileSync(resolve(dir, 'delivery.yaml'), 'utf8'), 'delivery.yaml', {
    skillExists: () => true,
    gateKeys: ['target:pr'],
    launchInputs: ['card'],
    isSafeText: () => true,
  })
  expect(result.workflow?.steps.map(step => step.id).slice(-3)).toEqual([
    'checks',
    'approve',
    'merge',
  ])
  const gate = result.workflow?.steps.find(step => step.id === 'checks')
  expect(gate?.with?.checks).toEqual(['ci-green', 'head-unchanged'])
  const reviewedHead = 'a'.repeat(40)
  const requests: Array<{ action: string; data?: unknown }> = []
  let index = 0
  let time = 0
  const facts = stepFacts(
    async request => {
      requests.push(request)
      if (request.action === 'ci') return answers[index++] ?? answers[answers.length - 1]
      if (request.action === 'head') return head
      throw new Error(`unexpected ${request.action}`)
    },
    {
      id: 'checks',
      kind: 'gate',
      uses: '',
      with: gate!.with!,
      inputs: { card: '700', reviewedHead },
      attempt: 1,
    },
  )
  const verdict = await runGate(
    {
      checks: gate!.with!.checks as ('ci-green' | 'head-unchanged')[],
      'timeout-minutes': gate!.with!['timeout-minutes'] as number | undefined,
    },
    {
      registry: {},
      run: async () => ({ code: 0, output: '' }),
      facts,
      now: () => time,
      sleep: async ms => {
        time += ms
      },
      pollMs: 60_000,
    },
  )
  expect(verdict.status).toBe(reason === undefined ? 'ok' : 'failed')
  expect(verdict.reason).toBe(reason)
  expect(
    requests
      .filter(request => request.action === 'ci')
      .every(
        request => JSON.stringify(request.data) === JSON.stringify({ expectedHead: reviewedHead }),
      ),
  ).toBe(true)
  if (reason === 'ci-timeout') expect(time).toBe(30 * 60_000)
  if (reason === undefined) expect(index).toBe(2)
})

it.each(['approved', 'changes-requested'] as const)(
  'reviews the last allowed fix before stopping or gating: %s (#700 AC-9)',
  async verdict => {
    const { start, next, record } = await import('../src/engine')
    const { createMemoryFiles } = await import('../src/engine/memory-files')
    const dir = '/main/.pair/working/runs/delivery-700'
    const run = { dir, files: createMemoryFiles() }
    const path = resolve(
      __dirname,
      '../../knowledge-hub/dataset/.pair/adoption/tech/workflows/delivery.yaml',
    )
    const text = readFileSync(path, 'utf8')
    const head = 'a'.repeat(40)
    const fixedHead = 'b'.repeat(40)
    const findings = [{ id: 'a', severity: 'Major', title: 'gap', blocking: true, origin: 'new' }]
    await start(run, { text, file: 'delivery.yaml' }, { card: '700' })
    expect((await next(run)).ready[0]?.id).toBe('implement')
    await record(run, 'implement', {
      status: 'ok',
      summary: 'opened',
      branch: 'feature/US-700-x',
      pr: 12,
      head,
    })
    for (let round = 0; round < 3; round++) {
      expect((await next(run)).ready[0]?.id).toBe('rounds/review')
      await record(run, 'rounds/review', {
        status: 'failed',
        summary: 'gap',
        verdict: 'changes-requested',
        reviewedHead: round ? fixedHead : head,
        findings,
      })
      expect((await next(run)).ready[0]?.id).toBe('rounds/fix')
      await record(run, 'rounds/fix', {
        status: 'ok',
        summary: 'fixed',
        head: fixedHead,
        resolutions: [{ id: 'a', status: 'resolved', reason: 'fixed' }],
      })
    }
    const finalReview = (await next(run)).ready[0]
    expect(finalReview).toMatchObject({ kind: 'review', inputs: { head: fixedHead } })
    await record(
      run,
      finalReview!.id,
      verdict === 'approved'
        ? { status: 'ok', summary: 'approved', verdict, reviewedHead: fixedHead, findings: [] }
        : { status: 'failed', summary: 'gap remains', verdict, reviewedHead: fixedHead, findings },
    )
    const result = await next(run)
    if (verdict === 'approved') expect(result.ready[0]?.id).toBe('checks')
    else {
      expect(['parked', 'failed']).toContain(result.run)
      expect(result.ready).toEqual([])
      const state = JSON.parse(run.files.readFileSync(`${dir}/state.json`))
      expect(state.steps[finalReview!.id].outputs.findings).toEqual([
        { ...findings[0], origin: 'carried' },
      ])
    }
  },
)
