import { namedSource, validateCommandOptions } from '#config/cli'
import { isGitUrl, isRemoteUrl, isUnsupportedProtocol } from '@pair/content-ops'

/**
 * Discriminated union for install command with default resolution
 */
export interface InstallCommandConfigDefault {
  command: 'install'
  resolution: 'default'
  offline: false
  kb: boolean
  target?: string
  skipVerify?: boolean
}

/**
 * Discriminated union for install command with remote source
 */
export interface InstallCommandConfigRemote {
  command: 'install'
  resolution: 'remote'
  url: string
  offline: false
  kb: boolean
  target?: string
  skipVerify?: boolean
}

/**
 * Discriminated union for install command with local source
 */
export interface InstallCommandConfigLocal {
  command: 'install'
  resolution: 'local'
  path: string
  offline: boolean
  kb: boolean
  target?: string
  skipVerify?: boolean
}

/**
 * Discriminated union for install command with git source
 */
export interface InstallCommandConfigGit {
  command: 'install'
  resolution: 'git'
  url: string
  offline: false
  kb: boolean
  target?: string
  skipVerify: boolean
}

/**
 * Discriminated union for install command with --list-targets
 */
export interface InstallCommandConfigListTargets {
  command: 'install'
  resolution: 'list-targets'
}

/**
 * Union type for all install command configurations
 */
export type InstallCommandConfig =
  | InstallCommandConfigDefault
  | InstallCommandConfigRemote
  | InstallCommandConfigGit
  | InstallCommandConfigLocal
  | InstallCommandConfigListTargets

interface ParseInstallOptions {
  source?: string
  /** Program-level `--url`; used as the source when `--source` is absent (see `namedSource`). */
  url?: string
  offline?: boolean
  kb?: boolean
  skipVerify?: boolean
  listTargets?: boolean
  config?: string
}

function buildOptionalFields(target?: string, skipVerify?: boolean) {
  return {
    ...(target && { target }),
    ...(skipVerify && { skipVerify }),
  }
}

function resolveInstallSourceConfig(
  source: string,
  fields: { kb: boolean; skipVerify: boolean; offline: boolean; target?: string },
): InstallCommandConfig {
  if (isUnsupportedProtocol(source)) {
    throw new Error(`Unsupported source protocol: ${source}`)
  }
  const { kb, skipVerify, offline, target } = fields
  const optional = buildOptionalFields(target, skipVerify)
  if (isGitUrl(source)) {
    return {
      command: 'install',
      resolution: 'git',
      url: source,
      offline: false,
      kb,
      skipVerify,
      ...(target && { target }),
    }
  }
  if (isRemoteUrl(source)) {
    return {
      command: 'install',
      resolution: 'remote',
      url: source,
      offline: false,
      kb,
      ...optional,
    }
  }
  return { command: 'install', resolution: 'local', path: source, offline, kb, ...optional }
}

/**
 * Parse install command options into InstallCommandConfig.
 *
 * Determines resolution strategy based on the named source — `--source`, or the
 * program-level `--url` when `--source` is absent:
 * - No source: default resolution (uses monorepo dataset or release ZIP)
 * - Git URL (git@, *.git, ssh://git@): git clone resolution
 * - Remote URL (http/https): remote resolution
 * - Local path (absolute/relative): local resolution
 */
export function parseInstallCommand(
  options: ParseInstallOptions,
  args: string[] = [],
): InstallCommandConfig {
  // The program-level `--url` names a source exactly like `--source` does (US-395), so it
  // is resolved BEFORE validation — `--offline --url ./kb.zip` is the same command as
  // `--offline --source ./kb.zip`.
  const source = namedSource(options)
  validateCommandOptions('install', { ...options, ...(source !== undefined && { source }) })
  if (options.listTargets) {
    return { command: 'install', resolution: 'list-targets' }
  }
  const { offline = false, kb = true, skipVerify = false } = options
  const target = args[0]
  if (!source) {
    return {
      command: 'install',
      resolution: 'default',
      offline: false,
      kb,
      ...buildOptionalFields(target, skipVerify),
    }
  }
  return resolveInstallSourceConfig(source, { kb, skipVerify, offline, ...(target && { target }) })
}
