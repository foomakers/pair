import type { InstallCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { dirname } from 'path'
import { loadConfigWithOverrides } from '../../config-utils'

import type { LogEntry } from '../command-utils'
import {
  createLogger,
  doCopyAndUpdateLinks,
  applyLinkTransformation,
  ensureDir,
} from '../command-utils'
import {
  extractRegistries,
  validateAllRegistries,
  resolveTarget,
  forEachRegistry,
  detectOverlappingTargets,
  checkTargetsEmptiness,
  getKnowledgeHubDatasetPath,
  getKnowledgeHubDatasetPathWithFallback,
  type RegistryConfig,
} from '../../registry'
import type { HttpClientService } from '@pair/content-ops'
import { installKBFromLocalZip } from '../../kb-manager/kb-installer'

/**
 * Install options for handler
 */
interface InstallHandlerOptions {
  baseTarget?: string
  linkStyle?: 'relative' | 'absolute' | 'auto'
  config?: string
  verbose?: boolean
  minLogLevel?: LogEntry['level']
  httpClient?: HttpClientService
  cliVersion?: string
}

/**
 * Handles the install command execution.
 * Processes InstallCommandConfig to install KB content from various sources.
 */
export async function handleInstallCommand(
  config: InstallCommandConfig,
  fs: FileSystemService,
  options?: InstallHandlerOptions,
): Promise<void> {
  const logLevel = options?.verbose ? 'debug' : 'info'
  const { pushLog } = createLogger(logLevel)

  try {
    const { datasetRoot, registries, baseTarget } = await setupInstallContext(fs, config, options)
    await validateInstallContext(fs, registries, baseTarget)
    await executeInstall({ fs, datasetRoot, registries, baseTarget, options, pushLog })
    pushLog('info', 'Installation completed successfully')
  } catch (err) {
    pushLog('error', `Installation failed: ${String(err)}`)
    throw err
  }
}

async function setupInstallContext(
  fs: FileSystemService,
  config: InstallCommandConfig,
  options?: InstallHandlerOptions,
): Promise<{
  datasetRoot: string
  registries: Record<string, RegistryConfig>
  baseTarget: string
}> {
  const datasetRoot = await resolveDatasetRoot(fs, config, options)
  const configOptions: { customConfigPath?: string; projectRoot?: string } = {}
  if (options?.config) configOptions.customConfigPath = options.config
  const configContent = loadConfigWithOverrides(fs, configOptions)

  const registries = extractRegistries(configContent.config)
  const validation = validateAllRegistries(registries)
  if (!validation.valid) {
    throw new Error(validation.errors.join('; ') || 'Invalid registry configuration')
  }

  const baseTarget = options?.baseTarget || fs.currentWorkingDirectory()
  return { datasetRoot, registries, baseTarget }
}

async function validateInstallContext(
  fs: FileSystemService,
  registries: Record<string, RegistryConfig>,
  baseTarget: string,
): Promise<void> {
  const targetValidation = await validateAllTargetsBeforeInstall(fs, registries, baseTarget)
  if (!targetValidation.valid) {
    throw new Error(targetValidation.error || 'Target validation failed')
  }
}

async function executeInstall(context: {
  fs: FileSystemService
  datasetRoot: string
  registries: Record<string, RegistryConfig>
  baseTarget: string
  options: InstallHandlerOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}): Promise<void> {
  const { fs, datasetRoot, registries, baseTarget, options, pushLog } = context

  await forEachRegistry(registries, async (registryName, registryConfig) => {
    const effectiveTarget = resolveTarget(registryName, registryConfig, fs, baseTarget)
    await ensureDir(fs, dirname(effectiveTarget))
    const datasetPath = fs.resolve(datasetRoot, registryName)
    const copyOptions = buildCopyOptions(registryConfig)
    pushLog('info', `Installing registry '${registryName}' to '${effectiveTarget}'`)
    await doCopyAndUpdateLinks(fs, {
      source: datasetPath,
      target: effectiveTarget,
      datasetRoot: datasetRoot,
      options: copyOptions,
    })
    pushLog('info', `Successfully installed registry '${registryName}'`)
  })

  if (options?.linkStyle) {
    await applyLinkTransformation(fs, { linkStyle: options.linkStyle }, pushLog, 'install')
  }
}

/**
 * Resolve dataset root based on install config resolution strategy
 */
async function resolveDatasetRoot(
  fs: FileSystemService,
  config: InstallCommandConfig,
  options?: InstallHandlerOptions,
): Promise<string> {
  const version = options?.cliVersion || '0.0.0'

  switch (config.resolution) {
    case 'default':
      return getKnowledgeHubDatasetPath(fs)

    case 'remote':
      return getKnowledgeHubDatasetPathWithFallback({
        fsService: fs,
        version,
        ...(options?.httpClient && { httpClient: options.httpClient }),
        customUrl: config.url,
      })

    case 'local':
      if (config.path.endsWith('.zip')) {
        return installKBFromLocalZip(version, config.path, fs)
      }
      return config.path
  }
}

/**
 * Validate all targets are empty before installation
 */
async function validateAllTargetsBeforeInstall(
  fs: FileSystemService,
  registries: Record<string, RegistryConfig>,
  baseTarget: string,
): Promise<{ valid: boolean; error?: string }> {
  const targets: Record<string, string> = {}

  for (const [registryName, registryConfig] of Object.entries(registries)) {
    const effectiveTarget = resolveTarget(registryName, registryConfig, fs, baseTarget)
    targets[registryName] = effectiveTarget
  }

  // Check for overlapping targets
  const overlapping = detectOverlappingTargets(targets)
  if (overlapping.length > 0) {
    return {
      valid: false,
      error: `Overlapping registry targets detected: ${overlapping.join('; ')}`,
    }
  }

  // Check all targets are empty (for mirror behavior)
  const emptyCheck = await checkTargetsEmptiness(targets, fs)
  if (!emptyCheck.valid && emptyCheck.errors.length > 0) {
    const errorMsg = emptyCheck.errors.map(e => `${e.registry}: ${e.error}`).join('; ')
    return { valid: false, error: errorMsg }
  }

  return { valid: true }
}

/**
 * Build copy options for registry based on behavior and includes
 */
function buildCopyOptions(registryConfig: RegistryConfig): Record<string, unknown> {
  const behavior = registryConfig.behavior || 'mirror'
  const include = registryConfig.include || []

  const copyOptions: Record<string, unknown> = {
    defaultBehavior: behavior,
  }

  // For selective behavior, set folder behaviors for included folders
  if (include.length > 0 && behavior === 'mirror') {
    const folderBehavior: Record<string, string> = {}
    include.forEach((folder: string) => {
      folderBehavior[folder] = 'mirror'
    })
    copyOptions['folderBehavior'] = folderBehavior
    copyOptions['defaultBehavior'] = 'skip'
  }

  return copyOptions
}
