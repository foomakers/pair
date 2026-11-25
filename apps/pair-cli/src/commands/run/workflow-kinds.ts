import {
  runChecks,
  runGate,
  type FactReader,
  type StepLaunch,
  type StepResult,
} from '@pair/workflows'
import { runHostProcess } from './host-process'

/** A deterministic step that needs an unavailable platform adapter. */
const UNWIRED = (what: string): StepResult => ({
  status: 'failed',
  reason: 'no-platform-adapter',
  summary: `${what} needs a platform adapter this host does not have yet; nothing was assumed`,
})

/** How long one gate entry may run. Longer is a configuration problem, not a slow gate. */
export const GATE_TIMEOUT_MS = Number(process.env['PAIR_GATE_TIMEOUT_MS']) || 10 * 60_000

/** Runs one gate command in the card worktree, bounded. */
export const gateRunner =
  (worktree: string, timeout = GATE_TIMEOUT_MS) =>
  async (command: string) => {
    const r = await runHostProcess('sh', ['-c', command], worktree, { timeout })
    const output = `${r.stdout}${r.stderr}`.trim()
    return {
      code: r.status ?? 1,
      output: r.error
        ? `${output}\n${r.error.message}: a gate this slow is a configuration problem`.trim()
        : output,
    }
  }

/** The gates of a step that ended `ok`: `undefined` when all pass, else the failed result. */
export function runStepGates(
  registry: Readonly<Record<string, string>>,
  worktree: string,
  targets: Readonly<Record<string, readonly string[]>> = {},
  timeout = GATE_TIMEOUT_MS,
) {
  return async (entries: readonly string[]): Promise<StepResult | undefined> => {
    const result = await runGate(
      { gates: entries },
      { registry, targets, run: gateRunner(worktree, timeout) },
    )
    return result.status === 'ok' ? undefined : result
  }
}

async function worktreeMismatch(
  worktree: string,
  reviewedHead: string,
): Promise<StepResult | undefined> {
  const head = await runHostProcess('git', ['rev-parse', '--verify', 'HEAD'], worktree)
  if (head.status === 0 && head.stdout.trim() === reviewedHead) {
    const tree = await runHostProcess(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'],
      worktree,
    )
    if (tree.status === 0 && tree.stdout === '') return undefined
  }
  return {
    status: 'failed',
    reason: 'gate-worktree-mismatch',
    summary: `Local gates require a clean worktree at the reviewed commit ${reviewedHead}`,
  }
}

function reviewedGateHead(step: StepLaunch): string | undefined {
  const head = step.inputs['reviewedHead']
  const checks = step.with['checks']
  return typeof head === 'string' && Array.isArray(checks) && checks.includes('head-unchanged')
    ? head
    : undefined
}

async function runBoundGate(
  run: () => Promise<StepResult>,
  head: string,
  worktree: string | undefined,
  facts: FactReader | undefined,
): Promise<StepResult> {
  if (worktree !== undefined) {
    if (facts === undefined) return { ...UNWIRED('the head-unchanged check'), status: 'blocked' }
    const current = await runChecks(['head-unchanged'], facts)
    if (current.status !== 'ok') return current
    const mismatch = await worktreeMismatch(worktree, head)
    if (mismatch !== undefined) return mismatch
  }
  const result = await run()
  if (result.status !== 'ok') return result
  const mismatch = worktree === undefined ? undefined : await worktreeMismatch(worktree, head)
  return mismatch ?? { ...result, gatedHead: head }
}

/** The gate kind runs registry commands in the card worktree and reads platform facts. */
export function performHostKind(
  registry: Readonly<Record<string, string>>,
  worktree: string,
  targets: Readonly<Record<string, readonly string[]>> = {},
  factsFor?: (step: StepLaunch) => FactReader,
) {
  return async (step: StepLaunch): Promise<StepResult> => {
    if (step.kind !== 'gate') return UNWIRED(`a ${step.kind} step`)
    const facts = factsFor?.(step)
    const run = () =>
      runGate(step.with, {
        registry,
        targets,
        run: gateRunner(worktree),
        ...(facts === undefined ? {} : { facts }),
      })
    const head = reviewedGateHead(step)
    if (head === undefined) return run()
    const entries = step.with['gates']
    const local = Array.isArray(entries) && entries.length > 0
    return runBoundGate(run, head, local ? worktree : undefined, facts)
  }
}
