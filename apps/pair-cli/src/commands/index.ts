/**
 * Root command configuration union type
 */

import type { InstallCommandConfig } from './install/parser'
import type { UpdateCommandConfig } from './update/parser'
import type { UpdateLinkCommandConfig } from './update-link/parser'
import type { PackageCommandConfig } from './package/parser'
import type { ValidateConfigCommandConfig } from './validate-config/parser'

/**
 * Generic command module interface
 */
export interface CommandModule<TConfig extends CommandConfig> {
  parse: (options: unknown) => TConfig
  handle: (config: TConfig) => Promise<void>
  Config: TConfig
}

/**
 * Discriminated union of all command configurations
 */
export type CommandConfig =
  | InstallCommandConfig
  | UpdateCommandConfig
  | UpdateLinkCommandConfig
  | PackageCommandConfig
  | ValidateConfigCommandConfig

// Re-export all command modules
export * from './install'
export * from './update'
export * from './update-link'
export * from './package'
export * from './validate-config'

// Command registry for dynamic dispatch
import { installCommand } from './install/index'
import { updateCommand } from './update/index'
import { updateLinkCommand } from './update-link/index'
import { packageCommand } from './package/index'
import { validateConfigCommand } from './validate-config/index'

export const commandRegistry = {
  install: installCommand,
  update: updateCommand,
  'update-link': updateLinkCommand,
  package: packageCommand,
  'validate-config': validateConfigCommand,
} as const
