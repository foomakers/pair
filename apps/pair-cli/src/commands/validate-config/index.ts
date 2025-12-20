import { parseValidateConfigCommand } from './parser'
import { handleValidateConfigCommand } from './handler'

export { parseValidateConfigCommand } from './parser'
export { handleValidateConfigCommand } from './handler'
export type { ValidateConfigCommandConfig } from './parser'

/**
 * Validate-config command module with unified interface
 */
export const validateConfigCommand = {
  parse: parseValidateConfigCommand,
  handle: handleValidateConfigCommand,
} as const
