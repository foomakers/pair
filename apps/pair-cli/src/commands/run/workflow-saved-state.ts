import { join } from 'node:path'
import type { FileSystemService } from '@pair/content-ops'
import {
  FROZEN_WORKFLOW,
  STATE_FILE,
  parseWorkflow,
  stepSettled,
  writeAtomic,
  type RunStateFile,
  type Workflow,
} from '@pair/workflows'

export function checkpointVersion(fs: FileSystemService, runDir: string): string {
  const stat = fs.statSync(join(runDir, STATE_FILE))
  return `${stat.ino}:${stat.mtimeMs}:${stat.size}`
}

export const batchWaitDirectory = (runDir: string): string => join(runDir, 'batch-wait')

export function savedRunState(
  request: { readonly card: string; readonly restart: boolean },
  runDir: string,
  fs: FileSystemService,
): RunStateFile | undefined {
  const statePath = join(runDir, STATE_FILE)
  const source = join(runDir, FROZEN_WORKFLOW)
  if (request.restart || !fs.existsSync(statePath) || !fs.existsSync(source)) return undefined
  const state = JSON.parse(fs.readFileSync(statePath)) as RunStateFile
  return state.card === request.card ? state : undefined
}

export function savedWorkflow(
  request: { readonly card: string; readonly restart: boolean },
  runDir: string,
  fs: FileSystemService,
): { workflow: Workflow; state: RunStateFile } | undefined {
  const state = savedRunState(request, runDir, fs)
  if (state === undefined) return undefined
  const { workflow } = parseWorkflow(
    fs.readFileSync(join(runDir, FROZEN_WORKFLOW)),
    join(runDir, `${state.workflow.name}.yaml`),
    true,
  )
  return workflow === undefined ? undefined : { workflow, state }
}

export function blockedReviewTarget(saved: ReturnType<typeof savedWorkflow>) {
  if (!saved) return undefined
  const { state, workflow } = saved
  const index = workflow.steps.findIndex(step => !stepSettled(step, state.steps[step.id]?.state))
  const step = workflow.steps[index]
  if (step?.kind !== 'loop') return undefined
  const review = step.steps?.find(
    child => child.kind === 'review' && state.steps[`${step.id}/${child.id}`]?.state === 'blocked',
  )
  if (!review) return undefined
  const outputs = workflow.steps.slice(0, index).map(item => state.steps[item.id]?.outputs)
  const { pr, head }: { pr?: unknown; head?: unknown } = Object.assign(
    {},
    ...outputs,
    state.replay?.inputs,
    state.latest,
  )
  return typeof pr === 'number' && typeof head === 'string' && /^[a-f0-9]{40}$/.test(head)
    ? { pr, head }
    : undefined
}

export async function saveReviewHead(
  fs: FileSystemService,
  dir: string,
  state: RunStateFile,
  head: string,
) {
  await writeAtomic(
    fs,
    join(dir, STATE_FILE),
    JSON.stringify(
      {
        ...state,
        latest: { ...state.latest, head },
      },
      null,
      2,
    ),
  )
}
