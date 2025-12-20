import { parseInstallCommand } from './parser'
import { handleInstallCommand } from './handler'

export { parseInstallCommand } from './parser'
export { handleInstallCommand } from './handler'
export type { InstallCommandConfig } from './parser'

/**
 * Install command module with unified interface
 */
export const installCommand = {
  parse: parseInstallCommand,
  handle: handleInstallCommand,
} as const
