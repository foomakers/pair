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
      return commandRegistry.install.handle(config, fs, opts)
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
