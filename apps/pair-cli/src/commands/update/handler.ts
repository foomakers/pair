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
  reconcileSkillNameRegistry,
  handleBackupRollback,
  resolveEffectiveDatasetRoot,
  writeProjectLlmsTxt,
  resolveWorkingPathOverride,
  type RegistryConfig,
} from '#registry'
import { applyLinkTransformation } from '../update-link/logic'
import type { HttpClientService } from '@pair/content-ops'
import { BackupService, type SkillNameMap, type SkillLinkPathMap } from '@pair/content-ops'
import { createCliPresenter, type CliPresenter, type RegistryResult } from '#ui'
import { emitVersionDriftHint, recordInstalledVersion } from '../kb-info/version-hint'

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
  presenter?: CliPresenter
}

type UpdateContext = {
  fs: FileSystemService
  datasetRoot: string
  registries: Record<string, RegistryConfig>
  baseTarget: string
  options: UpdateHandlerOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
  presenter: CliPresenter
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
  const presenter = options?.presenter ?? createCliPresenter(pushLog)

  try {
    const { datasetRoot, registries, baseTarget } = await setupUpdateContext(fs, config, options)
    await emitVersionDriftHint({ fs, datasetRoot, baseTarget, presenter })
    validateUpdateContext(fs, registries, baseTarget)
    await executeUpdate({
      fs,
      datasetRoot,
      registries,
      baseTarget,
      options,
      pushLog,
      presenter,
    })
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
    // `--no-kb` has to reach THIS reader too: the pre-flight honouring it only skips the warm
    // fetch, and the command would otherwise download the KB the user just refused.
    kb: (config as { kb?: boolean }).kb,
  })
  const configOptions: { customConfigPath?: string; projectRoot?: string } = {}
  if (options?.config) configOptions.customConfigPath = options.config
  const configContent = loadConfigWithOverrides(fs, configOptions)

  const registries = extractRegistries(configContent.config)
  const workingPathOverride = resolveWorkingPathOverride(configContent.config)
  const validation = validateAllRegistries(registries, workingPathOverride)
  if (!validation.valid) {
    throw new Error(validation.errors.join('; ') || 'Invalid registry configuration')
  }

  const baseTarget = options?.baseTarget || config.target || fs.currentWorkingDirectory()
  return { datasetRoot, registries, baseTarget }
}

function validateUpdateContext(
  fs: FileSystemService,
  registries: Record<string, RegistryConfig>,
  baseTarget: string,
): void {
  const hasTarget = Object.entries(registries).some(([name, config]) => {
    const target = resolveTarget(name, config, fs, baseTarget)
    return fs.existsSync(target)
  })
  if (!hasTarget) {
    throw new Error("No installed targets found. Project not installed. Use 'pair install' first.")
  }
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

  await writeProjectLlmsTxt(fs, context.baseTarget, pushLog)
  await recordInstalledVersion({
    fs,
    datasetRoot: context.datasetRoot,
    baseTarget: context.baseTarget,
  })

  if (!options?.persistBackup && shouldBackup) {
    await backupService.commit(false)
  }
}

async function performBackup(backupService: BackupService, context: UpdateContext): Promise<void> {
  const { fs, registries, baseTarget, presenter } = context
  const backupConfig: Record<string, string> = {}
  for (const [name, config] of Object.entries(registries)) {
    backupConfig[name] = resolveTarget(name, config, fs, baseTarget)
  }
  presenter.phase('Creating backup...')
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

interface UpdateRegistryCtx {
  fs: FileSystemService
  datasetRoot: string
  registryName: string
  registryConfig: RegistryConfig
  baseTarget: string
  pushLog: (level: LogEntry['level'], message: string) => void
  presenter: CliPresenter
  index: number
  total: number
}

async function finalizeRegistryCopy(
  ctx: UpdateRegistryCtx,
  paths: { effectiveTarget: string; datasetPath: string },
): Promise<void> {
  const { fs, registryConfig, baseTarget } = ctx
  await postCopyOps({ fs, registryConfig, baseTarget, ...paths })
}

async function updateSingleRegistry(ctx: UpdateRegistryCtx): Promise<{
  skillNameMap?: SkillNameMap | undefined
  skillLinkPathMap?: SkillLinkPathMap | undefined
  result: RegistryResult
}> {
  const {
    fs,
    datasetRoot,
    registryName,
    registryConfig,
    baseTarget,
    pushLog,
    presenter,
    index,
    total,
  } = ctx
  const resolved = resolveRegistryPaths({
    name: registryName,
    config: registryConfig,
    datasetRoot,
    fs,
    baseTarget,
  })
  const { target: effectiveTarget, source: datasetPath } = resolved
  await ensureDir(fs, dirname(effectiveTarget))
  const effectiveDatasetRoot = resolveEffectiveDatasetRoot(registryConfig, baseTarget, datasetRoot)
  await logDatasetEntries(fs, datasetPath, pushLog)
  presenter.registryStart({
    name: registryName,
    index,
    total,
    source: datasetPath,
    target: effectiveTarget,
  })
  const copyResult = await doCopyAndUpdateLinks(fs, {
    source: datasetPath,
    target: effectiveTarget,
    datasetRoot: effectiveDatasetRoot,
    options: buildCopyOptions(registryConfig),
  })

  await finalizeRegistryCopy(ctx, { effectiveTarget, datasetPath })
  presenter.registryDone(registryName)
  return {
    skillNameMap: copyResult['skillNameMap'] as SkillNameMap | undefined,
    skillLinkPathMap: copyResult['skillLinkPathMap'] as SkillLinkPathMap | undefined,
    result: { name: registryName, target: effectiveTarget, status: 'ok' },
  }
}

async function updateRegistries(context: UpdateContext): Promise<RegistryResult[]> {
  const { fs, datasetRoot, registries, baseTarget, pushLog, presenter } = context
  const accumulatedSkillNameMap: SkillNameMap = new Map()
  const accumulatedSkillLinkPathMap: SkillLinkPathMap = new Map()
  const total = Object.keys(registries).length
  const startTime = Date.now()

  presenter.startOperation('update', total)

  const results = await forEachRegistry(registries, async (registryName, registryConfig, index) => {
    const { skillNameMap, skillLinkPathMap, result } = await updateSingleRegistry({
      fs,
      datasetRoot,
      registryName,
      registryConfig,
      baseTarget,
      pushLog,
      presenter,
      index,
      total,
    })
    if (skillNameMap) {
      for (const [k, v] of skillNameMap) accumulatedSkillNameMap.set(k, v)
    }
    if (skillLinkPathMap) {
      for (const [k, v] of skillLinkPathMap) accumulatedSkillLinkPathMap.set(k, v)
    }
    return result
  })

  await reconcileSkillNameRegistry(
    { fs, baseTarget, pushLog },
    registries,
    accumulatedSkillNameMap,
    accumulatedSkillLinkPathMap,
  )

  presenter.summary(results, 'update', Date.now() - startTime)
  return results
}

async function executeRollback(
  backupService: BackupService,
  err: unknown,
  context: UpdateContext,
): Promise<void> {
  const { options, pushLog } = context
  context.presenter.phase('Rolling back...')
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
