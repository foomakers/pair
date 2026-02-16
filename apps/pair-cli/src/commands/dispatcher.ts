import type { CommandConfig } from './index'
import { commandRegistry } from './index'
import type { FileSystemService, HttpClientService } from '@pair/content-ops'

interface DispatchContext {
  httpClient?: HttpClientService
  cliVersion?: string
  baseTarget?: string
}

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
    case 'validate-config':
      return commandRegistry['validate-config'].handle(config, fs)
    case 'kb-validate':
      return commandRegistry['kb-validate'].handle(config, fs)
    case 'kb-verify': {
      const exitCode = await commandRegistry['kb-verify'].handle(config, fs)
      if (exitCode !== 0) {
        process.exitCode = exitCode
      }
      return
    }
  }
}

function resolveOptions(ctx: DispatchContext) {
  return {
    ...(ctx.httpClient && { httpClient: ctx.httpClient }),
    ...(ctx.cliVersion && { cliVersion: ctx.cliVersion }),
    ...(ctx.baseTarget && { baseTarget: ctx.baseTarget }),
  }
}
