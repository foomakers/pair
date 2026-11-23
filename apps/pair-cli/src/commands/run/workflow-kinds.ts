import { runGate, type FactReader, type StepLaunch, type StepResult } from '@pair/workflows'
import { runHostProcess } from './host-process'

/** What the host reads from the platform for the `checks` of a gate; not wired yet, so a check fails loudly. */
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

/**
 * The steps `pair run` executes itself, no agent: a gate's registry commands run in the card worktree.
 * `checks`, `approval` and `merge` read or write the platform and fail until their adapter is wired.
 */
export function performHostKind(
  registry: Readonly<Record<string, string>>,
  worktree: string,
  targets: Readonly<Record<string, readonly string[]>> = {},
  factsFor?: (step: StepLaunch) => FactReader,
) {
  return async (step: StepLaunch): Promise<StepResult> => {
    if (step.kind !== 'gate') return UNWIRED(`a ${step.kind} step`)
    const result = await runGate(step.with, {
      registry,
      targets,
      run: gateRunner(worktree),
      ...(factsFor === undefined ? {} : { facts: factsFor(step) }),
    })
    const head = step.inputs['reviewedHead']
    return result.status === 'ok' &&
      typeof head === 'string' &&
      Array.isArray(step.with['checks']) &&
      step.with['checks'].includes('head-unchanged')
      ? { ...result, gatedHead: head }
      : result
  }
}
