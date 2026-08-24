import type { CommandConfig } from './index'
import { commandRegistry } from './index'
import type { FileSystemService, HttpClientService } from '@pair/content-ops'

interface DispatchContext {
  httpClient?: HttpClientService
  cliVersion?: string
  baseTarget?: string
  config?: string
}

async function dispatchWithExitCode(handler: () => Promise<number>): Promise<void> {
  const exitCode = await handler()
  if (exitCode !== 0) {
    process.exitCode = exitCode
  }
}

/**
 * The code the CLI entry point must hand to `process.exit()`.
 *
 * `dispatchWithExitCode` sets `process.exitCode`, but the entry point force-exits (open
 * HTTP handles from a KB download would otherwise hang the process) — and Node's
 * `process.exit(0)` with an EXPLICIT code OVERRIDES a previously assigned
 * `process.exitCode`. Calling `process.exit(0)` unconditionally therefore threw away every
 * non-zero code a command had just reported: `install` printed "finished with errors" and
 * exited 0, which is verbatim the disagreement US-396 AC5 exists to remove.
 *
 * Accepts `unknown` because `process.exitCode` is `number | string | undefined` at runtime
 * (a string is legal and coerced by Node); anything not a finite number means "nothing was
 * reported", which is success.
 */
export function finalExitCode(pending: unknown): number {
  const code = typeof pending === 'string' ? Number(pending) : pending
  return typeof code === 'number' && Number.isFinite(code) ? code : 0
}

type ResolvedOptions = ReturnType<typeof resolveOptions>

/** kb-* inspection/validation commands, split out to keep each dispatch small */
type KbCommandConfig = Extract<CommandConfig, { command: `kb-${string}` }>

/**
 * Dispatch CommandConfig to appropriate handler using command registry
 * Type-safe implementation using discriminated union narrowing
 */
export async function dispatchCommand(
  config: CommandConfig,
  fs: FileSystemService,
  ctx: DispatchContext = {},
): Promise<void> {
  const opts = resolveOptions(ctx)
  switch (config.command) {
    case 'install':
      // The install summary distinguishes ok / skipped / failed; the exit code follows the
      // failures, so text and status can never disagree (US-396 AC5).
      return dispatchWithExitCode(() => commandRegistry.install.handle(config, fs, opts))
    case 'update':
      // Same contract as install: ok / skipped / failed, and the exit code follows.
      return dispatchWithExitCode(() => commandRegistry.update.handle(config, fs, opts))
    case 'update-link':
      return commandRegistry['update-link'].handle(config, fs)
    case 'package':
      return commandRegistry.package.handle(config, fs)
    case 'scaffold-kb':
      // cliVersion pins the CLI in the generated release script (reproducible releases)
      return commandRegistry['scaffold-kb'].handle(config, fs, {
        ...(opts.cliVersion && { cliVersion: opts.cliVersion }),
      })
    case 'validate-config':
      return commandRegistry['validate-config'].handle(config, fs)
    case 'coverage-ratchet':
      // No exit-code plumbing, deliberately: a refused commit-back is a warning
      // and the run still succeeds, so a persistence failure can never redden
      // the coverage gate that ran before it (#372/AC6).
      return commandRegistry['coverage-ratchet'].handle(config)
    default:
      return dispatchKbCommand(config, fs, opts)
  }
}

function dispatchKbCommand(
  config: KbCommandConfig,
  fs: FileSystemService,
  opts: ResolvedOptions,
): Promise<void> {
  switch (config.command) {
    case 'kb-validate':
      return commandRegistry['kb-validate'].handle(config, fs)
    case 'kb-verify':
      return dispatchWithExitCode(() => commandRegistry['kb-verify'].handle(config, fs))
    case 'kb-info':
      return dispatchWithExitCode(() => commandRegistry['kb-info'].handle(config, fs, opts))
    case 'kb-cache':
      // `version` decides which official slot prune SPARES, so a missing one must not
      // silently make every official slot prunable — including the running CLI's own.
      return dispatchWithExitCode(() =>
        commandRegistry['kb-cache'].handle(config, fs, { version: opts.cliVersion ?? '' }),
      )
  }
}

function resolveOptions(ctx: DispatchContext) {
  return {
    ...(ctx.httpClient && { httpClient: ctx.httpClient }),
    ...(ctx.cliVersion && { cliVersion: ctx.cliVersion }),
    ...(ctx.baseTarget && { baseTarget: ctx.baseTarget }),
    ...(ctx.config && { config: ctx.config }),
  }
}
