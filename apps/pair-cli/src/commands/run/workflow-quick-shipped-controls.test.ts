import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { parse } from 'yaml'
import { fileSystemService as fs } from '@pair/content-ops'
import {
  createMemoryFiles,
  runGate,
  runSteps,
  STATE_FILE,
  start,
  readGateRegistry,
  readGateTargets,
  validate,
} from '@pair/workflows'
import type { RunStateFile, StepResult } from '@pair/workflows'
import { isSafePromptText } from './prompt-safety'

/**
 * #652 r0-2 — what already holds around the shipped quick workflow, and must keep holding whichever
 * way the shipped files are aligned (a registry row, other gates, or the page's claim).
 */

const REPO = join(__dirname, '../../../../..')
const DATASET = join(REPO, 'packages/knowledge-hub/dataset')
const WAY_OF_WORKING = '.pair/adoption/tech/way-of-working.md'
const WORKFLOWS = '.pair/adoption/tech/workflows'
const QUICK = join(WORKFLOWS, 'quick.yaml')
const PAGE = '.pair/knowledge/guidelines/collaboration/automation/workflow-quick.md'

const read = (root: string, path: string) => fs.readFileSync(join(root, path))

const validateAdopted = (root: string, path: string) =>
  validate(read(root, path), path, {
    skillExists: skill => fs.existsSync(join(REPO, '.claude/skills', skill, 'SKILL.md')),
    gateKeys: Object.keys(readGateRegistry(read(root, WAY_OF_WORKING))),
    gateTargets: Object.keys(readGateTargets(read(root, WAY_OF_WORKING))),
    launchInputs: ['card'],
    isSafeText: isSafePromptText,
  })

const errorsOf = (root: string) => validateAdopted(root, QUICK).errors

const workflowFiles = (root: string) =>
  fs.readdirSync(join(root, WORKFLOWS)).filter(file => file.isFile() && file.name.endsWith('.yaml'))

const agentResult = (payload: StepResult) => `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``

const commandGates = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(
    ([key, child]) =>
      (key === 'gates' &&
        Array.isArray(child) &&
        child.some(item => typeof item === 'string' && item.startsWith('command:'))) ||
      commandGates(child),
  )
}

describe('the shipped quick workflow: what already holds (r0-2)', () => {
  it('c1 the generated mirror of the page is the dataset page', () => {
    expect(read(REPO, PAGE)).toBe(read(DATASET, PAGE))
  })

  it('c2 the file the page shows is the shipped file', () => {
    const shown = /^## The file\n+```yaml\n([\s\S]*?)```/m.exec(read(DATASET, PAGE))?.[1]

    expect(shown).toBe(read(DATASET, QUICK))
  })

  it("c3 this repository's copy is valid against this repository's gate registry", () => {
    expect(errorsOf(REPO)).toEqual([])
  })

  it('c4 the shipped file has no error but a gate key the template registry lacks', () => {
    expect(
      errorsOf(DATASET).filter(error => !error.problem.startsWith('unknown gate key')),
    ).toEqual([])
  })

  it('c5 the template registry row is still read as a gate', () => {
    expect(readGateRegistry(read(DATASET, WAY_OF_WORKING))).toMatchObject({
      formatting: 'pnpm format:check',
    })
  })

  it('c6 no shipped workflow carries a command: gate (ADR-036)', () => {
    const files = workflowFiles(DATASET).map(file => join(WORKFLOWS, file.name))
    const direct = files.filter(f => commandGates(parse(read(DATASET, f))))

    expect(direct).toEqual([])
    expect(commandGates(parse("steps: {check: {gates: ['command:echo ok']}}"))).toBe(true)
    expect(commandGates(parse('steps: {check: {gates: [target:pr]}}'))).toBe(false)
  })
})

describe('#728 AC 20: adopted workflows validate and quick keeps its gate sequence', () => {
  it('ships the same quick file that pair uses locally', () => {
    expect(read(DATASET, QUICK)).toBe(read(REPO, QUICK))
  })

  const sources = [
    {
      name: 'repository',
      root: REPO,
      commands: ['pnpm gate:increment', 'pnpm gate:increment', 'pnpm gate:pr'],
    },
    {
      name: 'dataset',
      root: DATASET,
      commands: ['pnpm format:check', 'pnpm format:check', 'pnpm format:check'],
    },
  ]
  const policies = [
    { policy: 'shorthand', shorthand: true, explicit: false },
    { policy: 'explicit', shorthand: false, explicit: true },
    { policy: 'both', shorthand: true, explicit: true },
  ]
  const verdicts = ['approved', 'changes-requested'] as const
  const checkpoints = [
    { step: 'gate', saved: 'ok', ended: 'done', approved: ['review'], requested: ['review'] },
    {
      step: 'gate',
      saved: 'failed',
      ended: 'failed',
      approved: ['review', 'gate'],
      requested: ['review', 'gate'],
    },
    {
      step: 'gate',
      saved: 'pending',
      ended: 'interrupted',
      approved: ['review', 'gate'],
      requested: ['review', 'gate'],
    },
    {
      step: 'gate',
      saved: 'running',
      ended: 'interrupted',
      approved: ['review', 'gate'],
      requested: ['review', 'gate'],
    },
    { step: 'gate', saved: 'blocked', ended: 'parked', approved: ['gate'], requested: ['gate'] },
    {
      step: 'fix',
      saved: 'failed',
      ended: 'failed',
      approved: ['review', 'gate'],
      requested: ['review', 'fix', 'gate'],
    },
    {
      step: 'fix',
      saved: 'pending',
      ended: 'interrupted',
      approved: ['review', 'gate'],
      requested: ['review', 'fix', 'gate'],
    },
    {
      step: 'fix',
      saved: 'running',
      ended: 'interrupted',
      approved: ['review', 'gate'],
      requested: ['review', 'fix', 'gate'],
    },
    {
      step: 'fix',
      saved: 'blocked',
      ended: 'parked',
      approved: ['fix', 'gate'],
      requested: ['fix', 'gate'],
    },
    {
      step: 'fix',
      saved: 'needs-decision',
      ended: 'parked',
      approved: ['fix', 'gate'],
      requested: ['fix', 'gate'],
    },
  ] as const

  it.each(
    sources.flatMap(source =>
      workflowFiles(source.root).map(file => ({ ...source, file: file.name })),
    ),
  )('$name $file has no new validation warnings', ({ name, root, file }) => {
    const { errors, warnings } = validateAdopted(root, join(WORKFLOWS, file))
    expect(errors).toEqual([])
    expect(warnings.map(({ key, problem }) => ({ key, problem }))).toEqual(
      name === 'repository' && file === 'delivery.yaml'
        ? [{ key: 'steps.merge', problem: 'merge has no review after the last code-changing step' }]
        : [],
    )
  })

  it.each(
    sources.flatMap(source =>
      policies.flatMap(policy =>
        checkpoints.flatMap(checkpoint =>
          verdicts.map(verdict => ({ ...source, ...policy, ...checkpoint, verdict })),
        ),
      ),
    ),
  )(
    '$name quick with $policy resumes from $step $saved with $verdict available (R747-03, R747-08)',
    async ({
      root,
      commands,
      step,
      saved,
      ended,
      verdict,
      approved,
      requested: changes,
      shorthand,
      explicit,
    }) => {
      const run = { files: createMemoryFiles(), dir: '/runs/728' }
      const readSteps = () =>
        (JSON.parse(run.files.readFileSync(join(run.dir, STATE_FILE))) as RunStateFile).steps
      const head = 'a'.repeat(40)
      const firstFinding = { id: 'f1', severity: 'Major', title: 'Missing check', blocking: true }
      const freshFinding = { ...firstFinding, id: 'f2', title: 'Missing assertion' }
      const requested = {
        status: 'failed',
        summary: 'Changes requested',
        verdict: 'changes-requested',
        reviewedHead: head,
        findings: [firstFinding],
      } satisfies StepResult
      const fixed = (finding: typeof firstFinding): StepResult => ({
        status: 'ok',
        summary: 'Finding fixed',
        head,
        resolutions: [{ id: finding.id, status: 'resolved', reason: 'Check added' }],
      })
      function initialFix(): StepResult {
        if (
          step === 'fix' &&
          (saved === 'failed' || saved === 'blocked' || saved === 'needs-decision')
        )
          return {
            status: saved,
            summary: 'Fix stopped',
            reason: 'fix-stopped',
            head,
            resolutions: [],
          }
        return fixed(firstFinding)
      }
      const replies: Record<string, StepResult> = {
        implement: { status: 'ok', summary: 'PR opened', branch: 'feature/quick', pr: 728, head },
        review: requested,
        fix: initialFix(),
      }
      const registryText = read(root, WAY_OF_WORKING)
      const invoked: string[] = []
      const gates = (entries: readonly string[], fail = false) =>
        runGate(
          { gates: entries },
          {
            registry: readGateRegistry(registryText),
            targets: readGateTargets(registryText),
            run: async command => {
              invoked.push(command)
              return { code: fail ? 1 : 0, output: '' }
            },
          },
        )
      const launched: string[] = []
      const fixFindings: unknown[] = []
      const legacy = read(root, QUICK)
      const text = legacy.replace(
        '    on-failed: continue\n    escalate: { blocked: stop, needs-decision: stop }',
        `${shorthand ? '    on-failed: continue\n' : ''}    escalate: { ${explicit ? 'failed: continue, ' : ''}blocked: stop, needs-decision: stop }`,
      )
      const source = { text, file: QUICK }
      const interruption = new Error('Workflow interrupted')
      let resuming = false
      const execute = () =>
        runSteps(
          {
            files: run.files,
            style: 'instruction',
            isSafeText: isSafePromptText,
            launch: async ({ id, inputs }) => {
              if (!resuming && id === step && saved === 'running') throw interruption
              if (id === 'fix') fixFindings.push(inputs['findings'])
              const reply = replies[id]
              if (reply === undefined) throw new Error(`Unexpected agent step ${id}`)
              return agentResult(reply)
            },
            runGates: async entries => {
              const result = await gates(entries)
              return result.status === 'ok' ? undefined : result
            },
            perform: async gate => {
              if (!resuming && step === 'gate' && saved === 'running') throw interruption
              if (!resuming && step === 'gate' && saved === 'blocked')
                return { status: 'blocked', summary: 'Gate unavailable', reason: 'fact-unreadable' }
              return gates(gate.with['gates'] as readonly string[], !resuming && saved === 'failed')
            },
            report: event => {
              if (event.state === 'running') launched.push(event.step)
              // Before the next launch, the previous result is saved and its successor is pending.
              if (
                !resuming &&
                saved === 'pending' &&
                (step === 'fix'
                  ? event.step === 'review' && event.state === 'failed'
                  : event.step === 'fix' && event.state === 'ok')
              )
                throw interruption
            },
          },
          run.dir,
        )

      async function firstInvocation() {
        await start(run, source, { card: '728' })
        if (ended === 'interrupted') await expect(execute()).rejects.toThrow(interruption)
        else expect((await execute()).run).toBe(ended)
        const first = readSteps()
        expect(first[step]).toMatchObject({ state: saved })
        expect(first['review']).toMatchObject({
          outputs: { verdict: 'changes-requested', findings: [firstFinding] },
        })
        expect(fixFindings).toEqual(
          step === 'fix' && ended === 'interrupted' ? [] : [[firstFinding]],
        )
        expect(invoked).toEqual([
          commands[0],
          ...(step === 'gate' ? [commands[1]] : []),
          ...(step === 'gate' && (saved === 'ok' || saved === 'failed') ? [commands[2]] : []),
        ])
        return first
      }

      function expectPersistedOutcome(
        first: RunStateFile['steps'],
        expected: typeof requested | typeof approvedReview,
      ) {
        const second = readSteps()
        expect(second['review']).toMatchObject({
          outputs: { verdict: expected.verdict, findings: expected.findings },
        })
        for (const id of ['implement', 'fix', 'gate']) {
          if (first[id]?.state === 'ok') expect(second[id]).toEqual(first[id])
        }
      }

      const first = await firstInvocation()
      const approvedReview = {
        status: 'ok',
        summary: 'Approved',
        verdict: 'approved',
        reviewedHead: head,
        findings: [],
      } satisfies StepResult
      const followUp =
        verdict === 'approved' ? approvedReview : { ...requested, findings: [freshFinding] }
      replies['review'] = followUp
      const retrySteps: readonly string[] = verdict === 'approved' ? approved : changes
      const refreshesReview = retrySteps.includes('review')
      const fixFinding = refreshesReview ? freshFinding : firstFinding
      replies['fix'] = fixed(fixFinding)
      resuming = true
      launched.length = 0
      invoked.length = 0
      fixFindings.length = 0
      expect(await start(run, source, { card: '728' })).toMatchObject({ status: 'resumed' })
      expect((await execute()).run).toBe('done')
      expect(launched).toEqual(retrySteps)
      expect(fixFindings).toEqual(retrySteps.includes('fix') ? [[fixFinding]] : [])
      const gateCommands = new Map([
        ['fix', commands[1]],
        ['gate', commands[2]],
      ])
      expect(invoked).toEqual(retrySteps.flatMap(id => gateCommands.get(id) ?? []))
      const expectedReview = refreshesReview ? followUp : requested
      expectPersistedOutcome(first, expectedReview)
      expect(await start(run, source, { card: '728' })).toMatchObject({
        status: expectedReview.verdict === 'approved' ? 'complete' : 'resumed',
      })
    },
  )
})

it('the shipped workflow fails at fix after review produces no verdict (#726 AC-6)', async () => {
  const run = { files: createMemoryFiles(), dir: '/runs/726' }
  const head = 'a'.repeat(40)
  await start(run, { text: read(DATASET, QUICK), file: QUICK }, { card: '726' })
  const launched: string[] = []
  const outcome = await runSteps(
    {
      files: run.files,
      style: 'instruction',
      isSafeText: () => true,
      runGates: async () => undefined,
      launch: async step => {
        launched.push(step.id)
        if (step.kind === 'implement')
          return agentResult({
            status: 'ok',
            summary: 'ready',
            branch: 'feature/US-726-test',
            pr: 735,
            head,
          })
        if (step.kind === 'fix')
          return agentResult({ status: 'ok', summary: 'fixed', head, resolutions: [] })
        return undefined
      },
    },
    run.dir,
  )
  expect(outcome).toMatchObject({ run: 'failed', last: { step: 'fix', reason: 'invalid-input' } })
  expect(launched).toEqual(['implement', 'review'])
})
