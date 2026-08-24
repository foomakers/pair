import type { CoverageRatchetCommandConfig } from './parser'
import { runRatchet } from './ratchet'

/**
 * Handle the coverage-ratchet command: hand the validated config to the module
 * and return.
 *
 * A thin entrypoint by design (gate-tooling ADL 2026-07-13): every decision —
 * the skip predicate, the monotonic raise, the git/gh command plan, the refusal
 * classification — lives in `ratchet.ts` and is unit-tested white-box there,
 * while this wiring is exercised end-to-end by the `coverage-gate.sh` smoke
 * scenario.
 *
 * No `FileSystemService`: unlike the KB commands, this one's filesystem work is
 * inseparable from the `git`/`gh` subprocesses that read the same working tree,
 * so a faked filesystem would verify nothing the smoke scenario does not verify
 * for real.
 *
 * It never rejects and never sets a non-zero exit code — a persistence failure
 * must not be able to redden a green coverage gate (#372/AC6).
 */
export async function handleCoverageRatchetCommand(
  config: CoverageRatchetCommandConfig,
): Promise<void> {
  runRatchet({
    configPath: config.configPath,
    wowPath: config.wowPath,
    measured: config.measured,
    baseBranch: config.baseBranch,
    remote: config.remote,
    marginPp: config.marginPp,
    dryRun: config.dryRun,
  })
  return Promise.resolve()
}
