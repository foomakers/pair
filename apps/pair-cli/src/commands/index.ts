/**
 * Root command configuration union type
 */

import type { InstallCommandConfig } from './install/parser'
import type { UpdateCommandConfig } from './update/parser'
import type { UpdateLinkCommandConfig } from './update-link/parser'
import type { PackageCommandConfig } from './package/parser'
import type { ValidateConfigCommandConfig } from './validate-config/parser'

/**
 * Discriminated union of all command configurations
 */
export type CommandConfig =
  | InstallCommandConfig
  | UpdateCommandConfig
  | UpdateLinkCommandConfig
  | PackageCommandConfig
  | ValidateConfigCommandConfig

export type { InstallCommandConfig } from './install/parser'
export type { UpdateCommandConfig } from './update/parser'
export type { UpdateLinkCommandConfig } from './update-link/parser'
export type { PackageCommandConfig } from './package/parser'
export type { ValidateConfigCommandConfig } from './validate-config/parser'
