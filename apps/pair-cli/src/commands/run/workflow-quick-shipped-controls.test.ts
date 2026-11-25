import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { parse } from 'yaml'
import { fileSystemService as fs } from '@pair/content-ops'
import {
  createMemoryFiles,
  runGate,
  runSteps,
  start,
  readGateRegistry,
  readGateTargets,
  validate,
} from '@pair/workflows'
import type { StepEvent, StepResult } from '@pair/workflows'
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

  it.each(sources)(
    '$name quick runs its gates and reviews again on the next invocation (R747-03)',
    async ({ root, commands }) => {
      const run = { files: createMemoryFiles(), dir: '/runs/728' }
      const head = 'a'.repeat(40)
      const replies: Record<string, StepResult> = {
        implement: { status: 'ok', summary: 'PR opened', branch: 'feature/quick', pr: 728, head },
        review: {
          status: 'failed',
          summary: 'Changes requested',
          verdict: 'changes-requested',
          reviewedHead: head,
          findings: [{ id: 'f1', severity: 'Major', title: 'Missing check', blocking: true }],
        },
        fix: {
          status: 'ok',
          summary: 'Finding fixed',
          head,
          resolutions: [{ id: 'f1', status: 'resolved', reason: 'Check added' }],
        },
      }
      const registryText = read(root, WAY_OF_WORKING)
      const invoked: string[] = []
      const gates = (entries: readonly string[]) =>
        runGate(
          { gates: entries },
          {
            registry: readGateRegistry(registryText),
            targets: readGateTargets(registryText),
            run: async command => {
              invoked.push(command)
              return { code: 0, output: '' }
            },
          },
        )
      const events: StepEvent[] = []
      const source = { text: read(root, QUICK), file: QUICK }
      const execute = () =>
        runSteps(
          {
            files: run.files,
            style: 'instruction',
            isSafeText: isSafePromptText,
            launch: async ({ id }) => {
              const reply = replies[id]
              if (reply === undefined) throw new Error(`Unexpected agent step ${id}`)
              return agentResult(reply)
            },
            runGates: async entries => {
              const result = await gates(entries)
              return result.status === 'ok' ? undefined : result
            },
            perform: async step => gates(step.with['gates'] as readonly string[]),
            report: event => events.push(event),
          },
          run.dir,
        )

      await start(run, source, { card: '728' })
      expect((await execute()).run).toBe('done')
      expect(invoked).toEqual(commands)
      expect(
        events.filter(event => event.state !== 'running').map(event => [event.step, event.state]),
      ).toEqual([
        ['implement', 'ok'],
        ['review', 'failed'],
        ['fix', 'ok'],
        ['gate', 'ok'],
      ])

      replies['review'] = {
        status: 'ok',
        summary: 'Approved',
        verdict: 'approved',
        reviewedHead: head,
        findings: [],
      }
      events.length = 0
      expect(await start(run, source, { card: '728' })).toMatchObject({ status: 'resumed' })
      expect((await execute()).run).toBe('done')
      expect(events.filter(event => event.state === 'running').map(event => event.step)).toEqual([
        'review',
      ])
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
