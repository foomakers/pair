import { parseInstallCommand } from './parser'
import { handleInstallCommand } from './handler'
import type { InstallCommandConfig } from './parser'

export { parseInstallCommand } from './parser'
export { handleInstallCommand } from './handler'
export { installMetadata } from './metadata'
export type { InstallCommandConfig } from './parser'

import type { FileSystemService } from '@pair/content-ops'

/**
 * Legacy command wrapper for backward compatibility with tests
 * Parses install arguments and delegates to handleInstallCommand
 */
export async function installCommand(
  fs: FileSystemService,
  args: string[],
  options?: Record<string, unknown>,
): Promise<{ success?: boolean; message?: string }> {
  try {
    const config = parseInstallArgs(args)
    const handlerOptions = buildInstallHandlerOptions(options)
    await handleInstallCommand(
      config,
      fs,
      handlerOptions as Parameters<typeof handleInstallCommand>[2],
    )
    return { success: true, message: 'Installation completed successfully' }
  } catch (err) {
    return { success: false, message: `Installation failed: ${String(err)}` }
  }
}

function parseInstallArgs(args: string[]): InstallCommandConfig {
  const sourceIdx = args.indexOf('--source')
  const source = sourceIdx >= 0 && args[sourceIdx + 1] ? args[sourceIdx + 1] : undefined
  const parseOptions: Record<string, unknown> = { offline: false, kb: true }
  if (source !== undefined) parseOptions['source'] = source
  return parseInstallCommand(parseOptions as Parameters<typeof parseInstallCommand>[0])
}

function buildInstallHandlerOptions(options?: Record<string, unknown>): Record<string, unknown> {
  const handlerOptions: Record<string, unknown> = {}
  if (options?.['baseTarget']) handlerOptions['baseTarget'] = String(options['baseTarget'])
  if (options?.['customConfigPath']) handlerOptions['config'] = String(options['customConfigPath'])
  if (options?.['verbose']) handlerOptions['verbose'] = Boolean(options['verbose'])
  return handlerOptions
}
