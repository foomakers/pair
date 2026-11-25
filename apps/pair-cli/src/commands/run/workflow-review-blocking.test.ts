import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService as fs } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import type { WorkflowHostDependencies } from './workflow-host'

/**
 * #652 r0-1 — design §3 and workflow-quick.md "How it ends": a `review` with a blocking finding
 * ends the run failed, exit 1 — also when the agent answers `ok`. Through the command's own entry
 * point, with a fake launcher: no real agent, tracker or git. The disk is real (a temp project).
 */

const HEAD = 'a'.repeat(40)
const fenced = (value: unknown) => `Done.\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``
const IMPLEMENTED = fenced({
  status: 'ok',
  summary: 'PR opened',
  branch: 'feature/US-627-x',
  pr: 12,
  head: HEAD,
})
const review = (findings: unknown[], verdict: string) =>
  fenced({ status: 'ok', summary: 'reviewed', verdict, reviewedHead: HEAD, findings })
const QUICK = `version: 1
name: quick
steps:
  implement:
    kind: implement
  review:
    kind: review
`

let project: string
let lines: string[]

const write = (path: string, content: string) => {
  fs.mkdirSync(join(project, path, '..'), { recursive: true })
  fs.writeFileSync(join(project, path), content)
}

const run = (reviewed: string) => {
  const workflow: WorkflowHostDependencies = {
    runIteration: async input => {
      const result = input.promptText.startsWith('/pair-process-review') ? reviewed : IMPLEMENTED
      input.onEvent?.({ type: 'result', subtype: 'success', result })
      return { outcome: 'success', detail: 'terminal event: success' }
    },
    readCard: async () => ({ title: 'A card' }),
    readResultFacts: async () => ({ head: HEAD }),
    prepareWorktree: async ({ main, card }) => join(main, 'worktrees', card),
    engineAvailable: () => true,
  }
  return handleRunCommand(parseRunCommand({ card: '627', cwd: project }, ['quick']), fs, {
    workflow,
  })
}

const reviewState = () =>
  (
    JSON.parse(fs.readFileSync(join(project, '.pair/working/runs/quick-627/state.json'))) as {
      steps: Record<string, { state: string }>
    }
  ).steps['review']?.state

beforeEach(() => {
  project = fs.mkdtempSync(join(tmpdir(), 'pair-workflow-review-'))
  lines = []
  for (const skill of ['pair-process-implement', 'pair-process-review'])
    write(`.claude/skills/${skill}/SKILL.md`, `# ${skill}\n`)
  write('.pair/adoption/tech/workflows/quick.yaml', QUICK)
  const keep = (...args: unknown[]) => void lines.push(args.join(' '))
  vi.spyOn(console, 'log').mockImplementation(keep)
  vi.spyOn(console, 'error').mockImplementation(keep)
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(project, { recursive: true, force: true })
})

describe('pair run quick: the review answers ok (r0-1, design §3)', () => {
  it('with a blocking finding: exit 1, the review step is not ok, the run is not reported done', async () => {
    const blocking = { id: 'F1', severity: 'Critical', title: 'data loss', blocking: true }

    expect(await run(review([blocking], 'changes-requested'))).toBe(1)

    expect(reviewState()).toBe('failed')
    expect(lines).not.toContain('  Run: done — every step is ok.')
  })

  it('with non-blocking findings only: exit 0, every step ok', async () => {
    const note = { id: 'F2', severity: 'Minor', title: 'a typo', blocking: false }

    expect(await run(review([note], 'approved'))).toBe(0)

    expect(reviewState()).toBe('ok')
    expect(lines).toContain('  Run: done — every step is ok.')
  })
})
