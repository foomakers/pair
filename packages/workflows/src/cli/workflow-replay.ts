import { stepSettled, type RunStateFile } from '../engine'
import type { Workflow } from '../grammar'
import { approvalPlatform } from './workflow-approval'
import type { Operation } from './workflow-facts'

/** Only a matching frozen failure route can replay the review on the original PR. */
export async function refreshReplayInputs(
  saved: { workflow: Workflow; state: RunStateFile } | undefined,
  call: Operation,
) {
  if (saved === undefined) return undefined
  const { workflow, state } = saved
  const stopped = workflow.steps.find(step => !stepSettled(step, state.steps[step.id]?.state))
  const route = stopped?.['on-resume']
  if (stopped === undefined || route === undefined) return undefined
  const failure = state.steps[stopped.id]
  if (failure?.state !== 'failed' || failure.reason !== route.reason) return undefined
  const from = workflow.steps.findIndex(step => step.id === route.step)
  const pr = workflow.steps
    .slice(0, from)
    .reverse()
    .map(step => state.steps[step.id]?.outputs?.['pr'])
    .find(value => typeof value === 'number')
  if (pr === undefined) throw new Error('Cannot replay without the original workflow PR')
  const current = await approvalPlatform(call).target(state.card)
  if (current.pr !== pr) throw new Error('The workflow PR changed; start a new run for that PR')
  return { from: route.step, inputs: { head: current.head } }
}
