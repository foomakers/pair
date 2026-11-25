import { canCommentOnCard } from '@pair/workflows/cli'
import type { Assignment, StepLaunch } from '@pair/workflows'
import {
  assignCard,
  runWorkflowOperation,
  stepFacts,
  type HostOperation,
} from '@pair/workflows/cli'
import { runHostProcess } from './host-process'

export { canCommentOnCard }

export const workflowOperation = (
  scriptDir: () => string,
  cwd: string,
  request: Parameters<HostOperation>[0],
) => runWorkflowOperation(runHostProcess, scriptDir, cwd, request)

export const assignWorkflowCard = (
  scriptDir: () => string,
  cwd: string,
  card: string,
  assign: Assignment,
) => assignCard(request => workflowOperation(scriptDir, cwd, request), card, assign, console.log)

export const workflowFacts = (scriptDir: () => string, cwd: string, step: StepLaunch) =>
  stepFacts(request => workflowOperation(scriptDir, cwd, request), step)
