import { parseUpdateLinkCommand } from './parser'
import { handleUpdateLinkCommand } from './handler'

export { parseUpdateLinkCommand } from './parser'
export { handleUpdateLinkCommand } from './handler'
export type { UpdateLinkCommandConfig } from './parser'

/**
 * Update-link command module with unified interface
 */
export const updateLinkCommand = {
  parse: parseUpdateLinkCommand,
  handle: handleUpdateLinkCommand,
} as const
