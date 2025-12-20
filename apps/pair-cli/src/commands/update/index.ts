import { parseUpdateCommand } from './parser'
import { handleUpdateCommand } from './handler'

export { parseUpdateCommand } from './parser'
export { handleUpdateCommand } from './handler'
export type { UpdateCommandConfig } from './parser'

/**
 * Update command module with unified interface
 */
export const updateCommand = {
  parse: parseUpdateCommand,
  handle: handleUpdateCommand,
} as const
