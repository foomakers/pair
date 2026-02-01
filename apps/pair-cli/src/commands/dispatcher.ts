import type { CommandConfig } from './index'
import { commandRegistry } from './index'
import type { FileSystemService, HttpClientService } from '@pair/content-ops'

/**
 * Dispatch CommandConfig to appropriate handler using command registry
 * Type-safe implementation using discriminated union narrowing
 *
 * @param config - Command configuration from parser
 * @param fs - FileSystemService instance for file operations
 * @param httpClient - HttpClientService instance for network operations (optional)
 * @param cliVersion - CLI version string (optional, used for KB cache path)
 */
export async function dispatchCommand(
  config: CommandConfig,
  fs: FileSystemService,
  httpClient?: HttpClientService,
  cliVersion?: string,
): Promise<void> {
  // TypeScript can properly narrow discriminated unions through switch
  switch (config.command) {
    case 'install':
      return commandRegistry.install.handle(config, fs, resolveOptions(httpClient, cliVersion))
    case 'update':
      return commandRegistry.update.handle(config, fs, resolveOptions(httpClient, cliVersion))
    case 'update-link':
      return commandRegistry['update-link'].handle(config, fs)
    case 'package':
      return commandRegistry.package.handle(config, fs)
    case 'validate-config':
      return commandRegistry['validate-config'].handle(config, fs)
    case 'kb-validate':
      return commandRegistry['kb-validate'].handle(config, fs)
  }
}

function resolveOptions(httpClient?: HttpClientService, cliVersion?: string) {
  return {
    ...(httpClient && { httpClient }),
    ...(cliVersion && { cliVersion }),
  }
}
