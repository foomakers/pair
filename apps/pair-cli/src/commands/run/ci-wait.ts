import type { CycleMergeResult } from './cycle-scripts'
import type { Wait } from './wait'

/**
 * Bounded wait for PENDING CI before the merge stage parks. `cycle-merge.mjs check` answers
 * `ciPending: true` only when CI is the sole obstacle and every unsettled check is still running;
 * the driver then polls (interval, cap) and re-runs the check once checks settle. A failed check
 * never reaches here (`ciPending` false => parks/halts at once); pending past the cap parks as before.
 */

export const CI_WAIT_CAP_SECONDS_DEFAULT = 1800
export const CI_WAIT_INTERVAL_SECONDS_DEFAULT = 30

export interface CiWaitOptions {
  /** Total wait cap, seconds. 0 disables waiting. */
  readonly capSeconds?: number
  readonly intervalSeconds?: number
  readonly wait?: Wait
  /** Injectable clock (ms) for tests. */
  readonly now?: () => number
}

const positive = (raw: string | undefined, fallback: number): number => {
  const n = raw === undefined || raw.trim() === '' ? NaN : Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** Env-configurable: `PAIR_CI_WAIT_CAP_SECONDS` (0 = never wait), `PAIR_CI_WAIT_INTERVAL_SECONDS`. */
export function ciWaitFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Pick<CiWaitOptions, 'capSeconds' | 'intervalSeconds'> {
  return {
    capSeconds: positive(env['PAIR_CI_WAIT_CAP_SECONDS'], CI_WAIT_CAP_SECONDS_DEFAULT),
    intervalSeconds: Math.max(
      1,
      positive(env['PAIR_CI_WAIT_INTERVAL_SECONDS'], CI_WAIT_INTERVAL_SECONDS_DEFAULT),
    ),
  }
}

export async function checkWithCiWait(
  /** `deferPark: true` on a poll (no park comment); the one final call after the wait parks for real. */
  check: (deferPark: boolean) => CycleMergeResult,
  wait: Wait,
  options: CiWaitOptions = {},
  notice: (message: string) => void = () => undefined,
): Promise<CycleMergeResult> {
  const { capMs, intervalMs, now, sleep } = resolveOptions(options, wait)
  const start = now()
  let result = check(true)
  while (result.mergeAllowed !== true && result['ciPending'] === true) {
    const remaining = capMs - (now() - start)
    if (remaining <= 0) return parkOnce(result, check)
    const step = Math.min(intervalMs, remaining)
    notice(`  Merge: CI pending — waiting ${Math.round(step / 1000)}s`)
    if ((await sleep(step)) === 'interrupted') return parkOnce(result, check)
    result = check(true)
  }
  return result
}

/** The wait ended with CI still pending: ONE real check records the park comment (polls posted none). */
function parkOnce(
  pending: CycleMergeResult,
  check: (deferPark: boolean) => CycleMergeResult,
): CycleMergeResult {
  return check(false) ?? pending
}

function resolveOptions(options: CiWaitOptions, wait: Wait) {
  const env = ciWaitFromEnv()
  return {
    capMs: (options.capSeconds ?? env.capSeconds ?? CI_WAIT_CAP_SECONDS_DEFAULT) * 1000,
    intervalMs: (options.intervalSeconds ?? env.intervalSeconds ?? 30) * 1000,
    now: options.now ?? Date.now,
    sleep: options.wait ?? wait,
  }
}
