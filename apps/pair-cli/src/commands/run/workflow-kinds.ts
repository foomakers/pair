import { runGate, type StepLaunch, type StepResult } from '@pair/workflows'
import { runHostProcess } from './host-process'

/** What the host reads from the platform for the `checks` of a gate; not wired yet, so a check fails loudly. */
const UNWIRED = (what: string): StepResult => ({
  status: 'failed',
  reason: 'no-platform-adapter',
  summary: `${what} needs a platform adapter this host does not have yet; nothing was assumed`,
})

/**
 * The steps `pair run` executes itself, no agent: a gate's registry commands run in the card worktree.
 * `checks`, `approval` and `merge` read or write the platform and fail until their adapter is wired.
 */
export function performHostKind(
  registry: Readonly<Record<string, string>>,
  worktree: string,
  targets: Readonly<Record<string, readonly string[]>> = {},
) {
  return async (step: StepLaunch): Promise<StepResult> => {
    if (step.kind !== 'gate') return UNWIRED(`a ${step.kind} step`)
    return runGate(step.with, {
      registry,
      targets,
      run: async command => {
        const r = await runHostProcess('sh', ['-c', command], worktree, { timeout: 0 })
        return { code: r.status ?? 1, output: `${r.stdout}${r.stderr}`.trim() }
      },
    })
  }
}
