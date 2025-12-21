import type { InstallCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { loadConfigWithOverrides, getKnowledgeHubDatasetPath } from '../../config-utils'
import type { LogEntry } from '../command-utils'
import {
  createLogger,
  doCopyAndUpdateLinks,
  applyLinkTransformation,
  ensureDir,
} from '../command-utils'
import {
  loadRegistriesFromConfig,
  validateRegistries,
  calculateEffectiveTarget,
  processAssetRegistries,
  type AssetRegistryConfig,
} from '../registry'
import { detectOverlappingTargets, checkTargetsEmptiness } from '../validation'

/**
 * Install options for handler
 */
interface InstallHandlerOptions {
  baseTarget?: string
  linkStyle?: 'relative' | 'absolute' | 'auto'
  config?: string
  verbose?: boolean
  minLogLevel?: LogEntry['level']
}

/**
 * Handles the install command execution.
 * Processes InstallCommandConfig to install KB content from various sources.
 *
 * @param config - The parsed install command configuration
 * @param fs - FileSystemService instance (injected for testing)
 * @param options - Optional handler configuration (baseTarget, linkStyle, etc)
 * @throws Error if installation fails
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
  registries: Record<string, AssetRegistryConfig>
  baseTarget: string
}> {
  const datasetRoot = resolveDatasetRoot(fs, config)
  const configOptions: { customConfigPath?: string; projectRoot?: string } = {}
  if (options?.config) configOptions.customConfigPath = options.config
  const configContent = loadConfigWithOverrides(fs, configOptions)
  const registries = loadRegistriesFromConfig(configContent.config)
  const validation = validateRegistries(registries)
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid registry configuration')
  }
  const baseTarget = options?.baseTarget || fs.currentWorkingDirectory()
  return { datasetRoot, registries, baseTarget }
}

async function validateInstallContext(
  fs: FileSystemService,
  registries: Record<string, AssetRegistryConfig>,
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
  registries: Record<string, AssetRegistryConfig>
  baseTarget: string
  options: InstallHandlerOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}): Promise<void> {
  const { fs, datasetRoot, registries, baseTarget, options, pushLog } = context
  await processAssetRegistries(registries, async (registryName, registryConfig) => {
    const effectiveTarget = calculateEffectiveTarget(registryName, registryConfig, baseTarget, fs)
    await ensureDir(fs, effectiveTarget)
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
function resolveDatasetRoot(fs: FileSystemService, config: InstallCommandConfig): string {
  switch (config.resolution) {
    case 'default':
      // Use default KB dataset path
      return getKnowledgeHubDatasetPath(fs)

    case 'remote':
      // Remote URL would need download handling - for now use default
      // TODO: implement remote download logic
      return getKnowledgeHubDatasetPath(fs)

    case 'local':
      // Local source (ZIP or directory) - use source as dataset root if offline
      if (config.offline) {
        return config.path
      }
      return getKnowledgeHubDatasetPath(fs)
  }
}

/**
 * Validate all targets are empty before installation
 */
async function validateAllTargetsBeforeInstall(
  fs: FileSystemService,
  registries: Record<string, AssetRegistryConfig>,
  baseTarget: string,
): Promise<{ valid: boolean; error?: string }> {
  const targets: Record<string, string> = {}

  for (const [registryName, registryConfig] of Object.entries(registries)) {
    const effectiveTarget = calculateEffectiveTarget(registryName, registryConfig, baseTarget, fs)
    targets[registryName] = effectiveTarget
  }

  // Check for overlapping targets
  const { overlapping } = detectOverlappingTargets(targets)
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
function buildCopyOptions(registryConfig: AssetRegistryConfig): Record<string, unknown> {
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
