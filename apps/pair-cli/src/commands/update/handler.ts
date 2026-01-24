import type { UpdateCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { dirname } from 'path'
import {
  loadConfigWithOverrides,
  getKnowledgeHubDatasetPath,
  getKnowledgeHubDatasetPathWithFallback,
} from '../../config-utils'
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
import type { HttpClientService } from '@pair/content-ops'
import { BackupService } from '@pair/content-ops'
import { installKBFromLocalZip } from '../../kb-manager/kb-installer'
import { buildRegistryBackupConfig, handleBackupRollback } from '../backup'

/**
 * Update options for handler
 */
interface UpdateHandlerOptions {
  baseTarget?: string
  linkStyle?: 'relative' | 'absolute' | 'auto'
  config?: string
  verbose?: boolean
  minLogLevel?: LogEntry['level']
  persistBackup?: boolean
  autoRollback?: boolean
  httpClient?: HttpClientService
  cliVersion?: string
}

type UpdateContext = {
  fs: FileSystemService
  datasetRoot: string
  registries: Record<string, AssetRegistryConfig>
  baseTarget: string
  options: UpdateHandlerOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}

/**
 * Handles the update command execution.
 * Processes UpdateCommandConfig to update KB content from various sources.
 *
 * @param config - The parsed update command configuration
 * @param fs - FileSystemService instance (injected for testing)
 * @param options - Optional handler configuration (baseTarget, linkStyle, etc)
 * @throws Error if update fails
 */
export async function handleUpdateCommand(
  config: UpdateCommandConfig,
  fs: FileSystemService,
  options?: UpdateHandlerOptions,
): Promise<void> {
  const logLevel = options?.verbose ? 'debug' : 'info'
  const { pushLog } = createLogger(logLevel)

  try {
    const { datasetRoot, registries, baseTarget } = await setupUpdateContext(fs, config, options)
    await executeUpdate({ fs, datasetRoot, registries, baseTarget, options, pushLog })
    pushLog('info', 'Update completed successfully')
  } catch (err) {
    pushLog('error', `Update failed: ${String(err)}`)
    throw err
  }
}

async function setupUpdateContext(
  fs: FileSystemService,
  config: UpdateCommandConfig,
  options?: UpdateHandlerOptions,
): Promise<{
  datasetRoot: string
  registries: Record<string, AssetRegistryConfig>
  baseTarget: string
}> {
  const datasetRoot = await resolveDatasetRoot(fs, config, options)
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

async function executeUpdate(context: UpdateContext): Promise<void> {
  const { fs, options } = context
  const backupService = new BackupService(fs)
  const shouldBackup = options?.persistBackup || options?.autoRollback !== false

  if (shouldBackup) {
    await performBackup(backupService, context)
  }

  try {
    await runUpdateSequence(backupService, context)
  } catch (err) {
    if (shouldBackup) {
      await executeRollback(backupService, err, context)
    }
    throw err
  }
}

async function runUpdateSequence(
  backupService: BackupService,
  context: UpdateContext,
): Promise<void> {
  const { fs, options, pushLog } = context
  const shouldBackup = options?.persistBackup || options?.autoRollback !== false

  await updateRegistries(context)

  if (options?.linkStyle) {
    await applyLinkTransformation(fs, { linkStyle: options.linkStyle }, pushLog, 'update')
  }

  if (!options?.persistBackup && shouldBackup) {
    await backupService.commit(false)
  }
}

async function performBackup(backupService: BackupService, context: UpdateContext): Promise<void> {
  const { fs, registries, baseTarget, pushLog } = context
  const backupConfig = buildRegistryBackupConfig(
    mapRegistriesToBackupConfig(registries, baseTarget, fs),
    fs,
  )
  pushLog('info', 'Creating backup before update...')
  await backupService.backupAllRegistries(backupConfig)
}

async function updateRegistries(context: UpdateContext): Promise<void> {
  const { fs, datasetRoot, registries, baseTarget, pushLog } = context
  await processAssetRegistries(registries, async (registryName, registryConfig) => {
    const effectiveTarget = calculateEffectiveTarget(registryName, registryConfig, baseTarget, fs)
    await ensureDir(fs, dirname(effectiveTarget))
    const datasetPath = fs.resolve(datasetRoot, registryName)
    const copyOptions = buildCopyOptions(registryConfig)
    pushLog('info', `Updating registry '${registryName}' at '${effectiveTarget}'`)
    await doCopyAndUpdateLinks(fs, {
      source: datasetPath,
      target: effectiveTarget,
      datasetRoot: datasetRoot,
      options: copyOptions,
    })
    pushLog('info', `Successfully updated registry '${registryName}'`)
  })
}

async function executeRollback(
  backupService: BackupService,
  err: unknown,
  context: UpdateContext,
): Promise<void> {
  const { options, pushLog } = context
  pushLog('warn', 'Update failed, attempting rollback...')
  await handleBackupRollback(
    backupService,
    err,
    {
      autoRollback: options?.autoRollback !== false,
      keepBackup: options?.persistBackup ?? false,
    },
    pushLog,
  )
}

/**
 * Helper to map full AssetRegistryConfig to simple path config for backup service
 */
function mapRegistriesToBackupConfig(
  registries: Record<string, AssetRegistryConfig>,
  baseTarget: string,
  fs: FileSystemService,
): Record<string, { target_path: string }> {
  const result: Record<string, { target_path: string }> = {}
  for (const [name, config] of Object.entries(registries)) {
    const effectiveTarget = calculateEffectiveTarget(name, config, baseTarget, fs)
    result[name] = { target_path: effectiveTarget }
  }
  return result
}

/**
 * Resolve dataset root based on update config resolution strategy
 */
async function resolveDatasetRoot(
  fs: FileSystemService,
  config: UpdateCommandConfig,
  options?: UpdateHandlerOptions,
): Promise<string> {
  const version = options?.cliVersion || '0.0.0'

  switch (config.resolution) {
    case 'default':
      // Use default KB dataset path
      return getKnowledgeHubDatasetPath(fs)

    case 'remote':
      // Remote resolution using KB manager
      return getKnowledgeHubDatasetPathWithFallback({
        fsService: fs,
        version,
        ...(options?.httpClient && { httpClient: options.httpClient }),
        customUrl: config.url,
      })

    case 'local':
      // Local source (ZIP or directory)
      if (config.path.endsWith('.zip')) {
        // Install from ZIP to cache and return cache path
        return installKBFromLocalZip(version, config.path, fs)
      }
      // Use directory directly
      return config.path
  }
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
