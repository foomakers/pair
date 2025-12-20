import type { CommandConfig } from './index'
import { commandRegistry } from './index'

/**
 * Dispatch CommandConfig to appropriate handler using command registry
 * Type-safe implementation using discriminated union narrowing
 */
export async function dispatchCommand(config: CommandConfig): Promise<void> {
  // TypeScript can properly narrow discriminated unions through switch
  switch (config.command) {
    case 'install':
      return commandRegistry.install.handle(config)
    case 'update':
      return commandRegistry.update.handle(config)
    case 'update-link':
      return commandRegistry['update-link'].handle()
    case 'package':
      return commandRegistry.package.handle()
    case 'validate-config':
      return commandRegistry['validate-config'].handle()
  }
}
