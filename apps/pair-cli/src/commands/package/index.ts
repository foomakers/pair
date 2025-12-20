import { parsePackageCommand } from './parser'
import { handlePackageCommand } from './handler'

export { parsePackageCommand } from './parser'
export { handlePackageCommand } from './handler'
export type { PackageCommandConfig } from './parser'

/**
 * Package command module with unified interface
 */
export const packageCommand = {
  parse: parsePackageCommand,
  handle: handlePackageCommand,
} as const
