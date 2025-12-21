import type { CommandConfig } from './index'
import { commandRegistry } from './index'
import type { FileSystemService } from '@pair/content-ops'

/**
 * Dispatch CommandConfig to appropriate handler using command registry
 * Type-safe implementation using discriminated union narrowing
 * 
 * @param config - Command configuration from parser
 * @param fs - FileSystemService instance for file operations
 */
export async function dispatchCommand(config: CommandConfig, fs: FileSystemService): Promise<void> {
  // TypeScript can properly narrow discriminated unions through switch
  switch (config.command) {
    case 'install':
      return commandRegistry.install.handle(config, fs)
    case 'update':
      return commandRegistry.update.handle(config, fs)
    case 'update-link':
      return commandRegistry['update-link'].handle()
    case 'package':
      return commandRegistry.package.handle()
    case 'validate-config':
      return commandRegistry['validate-config'].handle()
  }
}
