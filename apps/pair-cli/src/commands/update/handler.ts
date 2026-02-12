import type { UpdateCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { dirname } from 'path'
import { loadConfigWithOverrides, resolveDatasetRoot, ensureDir } from '#config'
import { createLogger, type LogEntry } from '#diagnostics'
import {
  extractRegistries,
  validateAllRegistries,
  resolveTarget,
  resolveRegistryPaths,
  forEachRegistry,
  doCopyAndUpdateLinks,
  buildCopyOptions,
  postCopyOps,
  applySkillRefsToNonSkillRegistries,
  handleBackupRollback,
  type RegistryConfig,
} from '#registry'
import { applyLinkTransformation } from '../update-link/logic'
import type { HttpClientService } from '@pair/content-ops'
import { BackupService, type SkillNameMap } from '@pair/content-ops'

/**
 * Update options for handler
 */
interface UpdateHandlerOptions {
  baseTarget?: string
  linkStyle?: 'relative' | 'absolute' | 'auto'
  config?: string
  minLogLevel?: LogEntry['level']
  persistBackup?: boolean
  autoRollback?: boolean
  httpClient?: HttpClientService
  cliVersion?: string
}

type UpdateContext = {
  fs: FileSystemService
  datasetRoot: string
  registries: Record<string, RegistryConfig>
  baseTarget: string
  options: UpdateHandlerOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}

/**
 * Handles the update command execution.
 * Processes UpdateCommandConfig to update KB content from various sources.
 */
export async function handleUpdateCommand(
  config: UpdateCommandConfig,
  fs: FileSystemService,
  options?: UpdateHandlerOptions,
): Promise<void> {
  const logLevel =
    (config as unknown as { logLevel?: LogEntry['level'] }).logLevel ??
    options?.minLogLevel ??
    'info'
  const { pushLog } = createLogger(logLevel as LogEntry['level'])

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
  registries: Record<string, RegistryConfig>
  baseTarget: string
}> {
  const datasetRoot = await resolveDatasetRoot(fs, config, {
    cliVersion: options?.cliVersion,
    httpClient: options?.httpClient,
  })
  const configOptions: { customConfigPath?: string; projectRoot?: string } = {}
  if (options?.config) configOptions.customConfigPath = options.config
  const configContent = loadConfigWithOverrides(fs, configOptions)

  const registries = extractRegistries(configContent.config)
  const validation = validateAllRegistries(registries)
  if (!validation.valid) {
    throw new Error(validation.errors.join('; ') || 'Invalid registry configuration')
  }

  const baseTarget = options?.baseTarget || config.target || fs.currentWorkingDirectory()
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
  const backupConfig: Record<string, string> = {}
  for (const [name, config] of Object.entries(registries)) {
    backupConfig[name] = resolveTarget(name, config, fs, baseTarget)
  }
  pushLog('info', 'Creating backup before update...')
  await backupService.backupAllRegistries(backupConfig)
}

async function logDatasetEntries(
  fs: FileSystemService,
  datasetPath: string,
  pushLog: (level: LogEntry['level'], message: string) => void,
): Promise<void> {
  if (!process.env['PAIR_DIAG'] && !process.env['DEBUG'] && process.env['NODE_ENV'] !== 'test')
    return
  try {
    const entries = await fs.readdir(datasetPath)
    pushLog(
      'debug',
      `Dataset entries at ${datasetPath}: ${entries.map(e => (e && e.name) || String(e)).join(', ')}`,
    )
  } catch (e) {
    pushLog('debug', `Failed to read dataset path ${datasetPath}: ${String(e)}`)
  }
}

async function updateSingleRegistry(ctx: {
  fs: FileSystemService
  datasetRoot: string
  registryName: string
  registryConfig: RegistryConfig
  baseTarget: string
  pushLog: (level: LogEntry['level'], message: string) => void
}): Promise<SkillNameMap | undefined> {
  const { fs, datasetRoot, registryName, registryConfig, baseTarget, pushLog } = ctx
  const resolved = resolveRegistryPaths({
    name: registryName,
    config: registryConfig,
    datasetRoot,
    fs,
    baseTarget,
  })
  const effectiveTarget = resolved.target
  await ensureDir(fs, dirname(effectiveTarget))
  const datasetPath = resolved.source
  const copyOptions = buildCopyOptions(registryConfig)

  // For flatten+prefix registries (skills), use baseTarget as the effective
  // datasetRoot so that link re-rooting correctly maps source paths (potentially
  // deep in node_modules) to installed paths relative to the target root.
  const effectiveDatasetRoot =
    registryConfig.flatten || registryConfig.prefix ? baseTarget : datasetRoot

  await logDatasetEntries(fs, datasetPath, pushLog)
  pushLog('info', `Updating registry '${registryName}' at '${effectiveTarget}'`)
  const result = await doCopyAndUpdateLinks(fs, {
    source: datasetPath,
    target: effectiveTarget,
    datasetRoot: effectiveDatasetRoot,
    options: copyOptions,
  })

  await postCopyOps({ fs, registryConfig, effectiveTarget, datasetPath, baseTarget })
  pushLog('info', `Successfully updated registry '${registryName}'`)
  return result['skillNameMap'] as SkillNameMap | undefined
}

async function updateRegistries(context: UpdateContext): Promise<void> {
  const { fs, datasetRoot, registries, baseTarget, pushLog } = context
  const accumulatedSkillNameMap: SkillNameMap = new Map()

  await forEachRegistry(registries, async (registryName, registryConfig) => {
    const skillNameMap = await updateSingleRegistry({
      fs,
      datasetRoot,
      registryName,
      registryConfig,
      baseTarget,
      pushLog,
    })
    if (skillNameMap) {
      for (const [k, v] of skillNameMap) accumulatedSkillNameMap.set(k, v)
    }
  })

  if (accumulatedSkillNameMap.size > 0) {
    await applySkillRefsToNonSkillRegistries(
      { fs, baseTarget, pushLog },
      registries,
      accumulatedSkillNameMap,
    )
  }
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
