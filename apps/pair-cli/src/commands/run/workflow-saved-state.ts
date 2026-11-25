import { join } from 'node:path'
import type { FileSystemService } from '@pair/content-ops'
import {
  FROZEN_WORKFLOW,
  STATE_FILE,
  parseWorkflow,
  type RunStateFile,
  type Workflow,
} from '@pair/workflows'

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
