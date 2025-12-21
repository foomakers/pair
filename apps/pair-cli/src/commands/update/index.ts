import { parseUpdateCommand } from './parser'
import { handleUpdateCommand } from './handler'
import type { UpdateCommandConfig } from './parser'

export { parseUpdateCommand } from './parser'
export { handleUpdateCommand } from './handler'
export { updateMetadata } from './metadata'
export type { UpdateCommandConfig } from './parser'

import type { FileSystemService } from '@pair/content-ops'

/**
 * Legacy command wrapper for backward compatibility with tests
 * Parses update arguments and delegates to handleUpdateCommand
 */
export async function updateCommand(
  fs: FileSystemService,
  args: string[],
  options?: Record<string, unknown>,
): Promise<{ success?: boolean; message?: string }> {
  try {
    const config = parseUpdateArgs(args)
    const handlerOptions = buildUpdateHandlerOptions(options)
    await handleUpdateCommand(
      config,
      fs,
      handlerOptions as Parameters<typeof handleUpdateCommand>[2],
    )
    return { success: true, message: 'Update completed successfully' }
  } catch (err) {
    return { success: false, message: `Update failed: ${String(err)}` }
  }
}

function parseUpdateArgs(args: string[]): UpdateCommandConfig {
  const sourceIdx = args.indexOf('--source')
  const source = sourceIdx >= 0 && args[sourceIdx + 1] ? args[sourceIdx + 1] : undefined
  const parseOptions: Record<string, unknown> = { offline: false, kb: true }
  if (source !== undefined) parseOptions['source'] = source
  return parseUpdateCommand(parseOptions as Parameters<typeof parseUpdateCommand>[0])
}

function buildUpdateHandlerOptions(options?: Record<string, unknown>): Record<string, unknown> {
  const handlerOptions: Record<string, unknown> = {}
  if (options?.['baseTarget']) handlerOptions['baseTarget'] = String(options['baseTarget'])
  if (options?.['customConfigPath']) handlerOptions['config'] = String(options['customConfigPath'])
  if (options?.['verbose']) handlerOptions['verbose'] = Boolean(options['verbose'])
  return handlerOptions
}
