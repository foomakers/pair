/**
 * Root command configuration union type
 */

import type { InstallCommandConfig } from './install/parser'
import type { UpdateCommandConfig } from './update/parser'
import type { UpdateLinkCommandConfig } from './update-link/parser'
import type { PackageCommandConfig } from './package/parser'
import type { ValidateConfigCommandConfig } from './validate-config/parser'
import type { KbValidateCommandConfig } from './kb-validate/parser'

// Command registry for dynamic dispatch
import { parseInstallCommand } from './install/parser'
import { installMetadata } from './install/metadata'
import { handleInstallCommand } from './install/handler'
import { parseUpdateCommand } from './update/parser'
import { updateMetadata } from './update/metadata'
import { handleUpdateCommand } from './update/handler'
import { parseUpdateLinkCommand } from './update-link/parser'
import { updateLinkMetadata } from './update-link/metadata'
import { handleUpdateLinkCommand } from './update-link/handler'
import { parsePackageCommand } from './package/parser'
import { handlePackageCommand } from './package/handler'
import { packageCommandMetadata } from './package/metadata'
import { parseValidateConfigCommand } from './validate-config/parser'
import { validateConfigMetadata } from './validate-config/metadata'
import { handleValidateConfigCommand } from './validate-config/handler'
import { parseKbValidateCommand } from './kb-validate/parser'
import { handleKbValidateCommand } from './kb-validate/handler'
import { kbValidateMetadata } from './kb-validate/metadata'

/**
 * Discriminated union of all command configurations
 */
export type CommandConfig =
  | InstallCommandConfig
  | UpdateCommandConfig
  | UpdateLinkCommandConfig
  | KbValidateCommandConfig
  | PackageCommandConfig
  | ValidateConfigCommandConfig

/**
 * Command registry mapping command names to their parse/handle/metadata functions.
 * 
 * Provides centralized registration for all CLI commands:
 * - parse: Transforms Commander.js options into typed CommandConfig
 * - handle: Executes command logic using typed config
 * - metadata: Provides CLI help text, examples, and option definitions
 * 
 * Used by:
 * - cli.ts: registerCommandFromMetadata() for dynamic CLI registration
 * - dispatcher.ts: dispatchCommand() for type-safe command routing
 */
export const commandRegistry = {
  install: {
    parse: parseInstallCommand,
    handle: handleInstallCommand,
    metadata: installMetadata,
  },
  update: {
    parse: parseUpdateCommand,
    handle: handleUpdateCommand,
    metadata: updateMetadata,
  },
  'update-link': {
    parse: parseUpdateLinkCommand,
    handle: handleUpdateLinkCommand,
    metadata: updateLinkMetadata,
  },
  package: {
    parse: parsePackageCommand,
    handle: handlePackageCommand,
    metadata: packageCommandMetadata,
  },
  'validate-config': {
    parse: parseValidateConfigCommand,
    handle: handleValidateConfigCommand,
    metadata: validateConfigMetadata,
  },
  'kb-validate': {
    parse: parseKbValidateCommand,
    handle: handleKbValidateCommand,
    metadata: kbValidateMetadata,
  },
} as const
