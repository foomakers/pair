import type { RunDirectory, StepLaunch } from '../engine'
import { readGateRegistry, readGateTargets, type StepResult } from '../kinds'
import type { HostProcess } from '../worktree/host-process'
import { approvalPlatform, approvalRunner } from './workflow-approval'
import { stepFacts, type HostOperation } from './workflow-facts'
import { hostGateRunners } from './workflow-kinds'
import { workflowMerge } from './workflow-merge'

export function hostSteps(input: {
  run: RunDirectory
  main: string
  worktree: string
  adoption: string
  operation: HostOperation
  process: HostProcess
  reply?: Parameters<typeof approvalRunner>[2]
  channel?: 'session'
  onPark?: Parameters<typeof approvalRunner>[3]
}) {
  const { run, main, worktree, adoption, operation, reply, channel, onPark } = input
  const registry = readGateRegistry(adoption)
  const targets = readGateTargets(adoption)
  const { performHostKind, runStepGates } = hostGateRunners(input.process)
  const gate = performHostKind(registry, worktree, targets, step => stepFacts(operation, step))
  const call = (action: string, card: string, data?: unknown) => operation({ action, card, data })
  const approve = approvalRunner(run, approvalPlatform(call, channel), reply, onPark)
  const merge = workflowMerge(call, main)
  return {
    async perform(step: StepLaunch): Promise<StepResult> {
      if (step.kind !== 'approval' && step.kind !== 'merge') return gate(step)
      try {
        return await (step.kind === 'approval' ? approve(step) : merge(step))
      } catch (error) {
        return {
          status: 'failed',
          summary: `The host could not complete ${step.kind}`,
          reason: error instanceof Error ? error.message : String(error),
        }
      }
    },
    runGates: runStepGates(registry, worktree, targets),
  }
}
