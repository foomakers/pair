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
      return commandRegistry.update.handle(config, fs, opts)
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
