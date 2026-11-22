import type { StepResult } from '../kinds'

/** The ready-made checks of a `gate`, a closed list. */
export const CHECK_NAMES = [
  'ci-green',
  'head-unchanged',
  'review-approved',
  'prerequisites-done',
] as const
export type CheckName = (typeof CHECK_NAMES)[number]

/** Facts the host reads from the platform; the package never reads them itself. */
export interface FactReader {
  /** CI on the PR head: `pending` while it runs. */
  ci(): Promise<'green' | 'pending' | 'red'>
  /** The PR head now. */
  head(): Promise<string>
  /** The head verified by the last review step. */
  reviewedHead(): Promise<string | undefined>
  /** The `pair-review` check is green on the head. */
  reviewApproved(): Promise<boolean>
  /** The cards this card depends on that are still open. */
  openPrerequisites(): Promise<readonly string[]>
}

export interface CheckOptions {
  /** How long `ci-green` waits. Default 30 minutes. */
  readonly timeoutMinutes?: number
  readonly pollMs?: number
  readonly sleep?: (ms: number) => Promise<void>
  readonly now?: () => number
}

/** `undefined` when the check passes, else its reason. */
type Verdict = string | undefined

async function ciGreen(facts: FactReader, options: CheckOptions): Promise<Verdict> {
  const {
    timeoutMinutes = 30,
    pollMs = 30_000,
    sleep = ms => new Promise(r => setTimeout(r, ms)),
    now = Date.now,
  } = options
  const deadline = now() + timeoutMinutes * 60_000
  for (;;) {
    const ci = await facts.ci()
    if (ci === 'green') return undefined
    if (ci === 'red') return 'ci-red'
    if (now() >= deadline) return 'ci-timeout'
    await sleep(pollMs)
  }
}

const verdicts: Record<CheckName, (facts: FactReader, options: CheckOptions) => Promise<Verdict>> =
  {
    'ci-green': ciGreen,
    'head-unchanged': async facts => {
      const [head, reviewed] = [await facts.head(), await facts.reviewedHead()]
      return reviewed !== undefined && head === reviewed ? undefined : 'head-changed'
    },
    'review-approved': async facts =>
      (await facts.reviewApproved()) ? undefined : 'review-not-approved',
    'prerequisites-done': async facts => {
      const open = await facts.openPrerequisites()
      return open.length === 0 ? undefined : `prerequisites-open: ${open.join(', ')}`
    },
  }

/** Runs `names` in order; the first that does not pass fails the step with its reason. */
export async function runChecks(
  names: readonly CheckName[],
  facts: FactReader,
  options: CheckOptions = {},
): Promise<StepResult> {
  for (const name of names) {
    const reason = await verdicts[name](facts, options)
    if (reason !== undefined) return { status: 'failed', reason, summary: `check ${name} failed` }
  }
  return { status: 'ok', summary: `${names.length} check(s) passed` }
}

/** What runs a registry command in the card worktree. */
export type RunCommand = (
  command: string,
) => Promise<{ readonly code: number; readonly output: string }>

/** Runs the registry commands of `keys` in order; the first failure, or `undefined` when all pass. */
async function runRegistry(
  keys: readonly string[],
  deps: {
    readonly registry: Readonly<Record<string, string>>
    readonly targets?: Readonly<Record<string, readonly string[]>>
    readonly run: RunCommand
  },
): Promise<StepResult | undefined> {
  const entries = keys.flatMap(entry => {
    if (!entry.startsWith('target:')) return [entry]
    const rows = deps.targets?.[entry.slice(7)]
    return rows === undefined ? [entry] : rows
  })
  for (const key of entries) {
    const command = key.startsWith('command:') ? key.slice(8) : deps.registry[key]
    if (command === undefined)
      return {
        status: 'failed',
        reason: 'unknown-gate',
        summary: `gate '${key}' is not in the registry`,
      }
    const { code, output } = await deps.run(command)
    if (code !== 0)
      return {
        status: 'failed',
        reason: `gate-failed: ${key}`,
        summary: `gate ${key} failed`,
        detail: output,
      }
  }
  return undefined
}

/** Runs the registry commands named by `gates`, in order, then `checks`. */
export async function runGate(
  step: {
    readonly gates?: readonly string[]
    readonly checks?: readonly CheckName[]
    readonly 'timeout-minutes'?: number
  },
  deps: {
    readonly registry: Readonly<Record<string, string>>
    readonly targets?: Readonly<Record<string, readonly string[]>>
    readonly run: RunCommand
    /** The platform facts; absent, a gate with `checks` fails `no-platform-adapter` rather than assume. */
    readonly facts?: FactReader
  } & CheckOptions,
): Promise<StepResult> {
  const failed = await runRegistry(step.gates ?? [], deps)
  if (failed !== undefined) return failed
  const { facts } = deps
  if (facts === undefined)
    return (step.checks ?? []).length === 0
      ? { status: 'ok', summary: `${(step.gates ?? []).length} gate(s) passed` }
      : {
          status: 'failed',
          reason: 'no-platform-adapter',
          summary: 'this host cannot read the platform facts the checks need',
        }
  return runChecks(step.checks ?? [], facts, {
    ...deps,
    ...(step['timeout-minutes'] !== undefined && { timeoutMinutes: step['timeout-minutes'] }),
  })
}
