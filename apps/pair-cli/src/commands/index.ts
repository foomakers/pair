/**
 * Root command configuration union type
 */

import type { InstallCommandConfig } from './install/parser'
import type { UpdateCommandConfig } from './update/parser'
import type { UpdateLinkCommandConfig } from './update-link/parser'
import type { PackageCommandConfig } from './package/parser'
import type { ValidateConfigCommandConfig } from './validate-config/parser'
import type { KbValidateCommandConfig } from './kb-validate/parser'
import type { KbVerifyCommandConfig } from './kb-verify/parser'

export type {
  InstallCommandConfig,
  UpdateCommandConfig,
  UpdateLinkCommandConfig,
  PackageCommandConfig,
  ValidateConfigCommandConfig,
  KbValidateCommandConfig,
  KbVerifyCommandConfig,
}

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
import { parseKbVerifyCommand } from './kb-verify/parser'
import { handleKbVerifyCommand } from './kb-verify/handler'
import { kbVerifyCommandMetadata } from './kb-verify/metadata'

export {
  handleInstallCommand,
  handleUpdateCommand,
  handleUpdateLinkCommand,
  handlePackageCommand,
  handleValidateConfigCommand,
  handleKbValidateCommand,
  handleKbVerifyCommand,
  parseInstallCommand,
  parseUpdateCommand,
  parseUpdateLinkCommand,
  parsePackageCommand,
  parseValidateConfigCommand,
  parseKbValidateCommand,
  parseKbVerifyCommand,
}

/**
 * Discriminated union of all command configurations
 */
export type CommandConfig =
  | InstallCommandConfig
  | UpdateCommandConfig
  | UpdateLinkCommandConfig
  | KbValidateCommandConfig
  | KbVerifyCommandConfig
  | PackageCommandConfig
  | ValidateConfigCommandConfig

/**
 * Command registry mapping command names to their parse/handle/metadata functions.
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
  'kb-verify': {
    parse: parseKbVerifyCommand,
    handle: handleKbVerifyCommand,
    metadata: kbVerifyCommandMetadata,
  },
} as const

// Legacy exports for backward compatibility
export { installCommand } from './install'
export { updateCommand } from './update'
