import type { UpdateCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { dirname } from 'path'
import {
  loadConfigWithOverrides,
  resolveDatasetRoot,
  ensureDir,
  type LoadConfigOptions,
} from '#config'
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
import {
  createCliPresenter,
  exitCodeFor,
  tallyRegistries,
  SKIP_NOT_SHIPPED,
  type CliPresenter,
  type RegistryResult,
} from '#ui'
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
 *
 * Returns the process exit code, on the same contract as install: a registry the source
 * does not ship is skipped (not ok, not failed), and a run that updated nothing does not
 * report success (US-396 AC1/AC5).
 */
export async function handleUpdateCommand(
  config: UpdateCommandConfig,
  fs: FileSystemService,
  options?: UpdateHandlerOptions,
): Promise<number> {
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
    return await executeUpdate({
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
  // The project being updated is where its own pair.config.json lives — not the CLI's
  // module directory, which is what the loader defaults to (US-396).
  const baseTarget = options?.baseTarget || config.target || fs.currentWorkingDirectory()
  const configOptions: LoadConfigOptions = { projectRoot: baseTarget, projectConfigOnly: true }
  if (options?.config) configOptions.customConfigPath = options.config
  const configContent = loadConfigWithOverrides(fs, configOptions)

  const registries = extractRegistries(configContent.config)
  const workingPathOverride = resolveWorkingPathOverride(configContent.config)
  const validation = validateAllRegistries(registries, workingPathOverride)
  if (!validation.valid) {
    throw new Error(validation.errors.join('; ') || 'Invalid registry configuration')
  }

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

async function executeUpdate(context: UpdateContext): Promise<number> {
  const { fs, options } = context
  const backupService = new BackupService(fs)
  const shouldBackup = options?.persistBackup || options?.autoRollback !== false

  if (shouldBackup) {
    await performBackup(backupService, context)
  }

  try {
    return await runUpdateSequence(backupService, context)
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
): Promise<number> {
  const { fs, options, pushLog } = context
  const shouldBackup = options?.persistBackup || options?.autoRollback !== false

  const results = await updateRegistries(context)
  const tally = tallyRegistries(results)

  if (options?.linkStyle) {
    await applyLinkTransformation(fs, { linkStyle: options.linkStyle }, pushLog, 'update')
  }

  await writeProjectLlmsTxt(fs, context.baseTarget, pushLog)
  // Same rule as install: a partial run must not leave a marker that says "complete".
  if (tally.failed === 0) {
    await recordInstalledVersion({
      fs,
      datasetRoot: context.datasetRoot,
      baseTarget: context.baseTarget,
    })
  }

  if (!options?.persistBackup && shouldBackup) {
    await backupService.commit(false)
  }

  return exitCodeFor(tally)
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

/** Where this registry reads from and writes to, announced to the reader. */
async function beginRegistryUpdate(ctx: UpdateRegistryCtx): Promise<{
  effectiveTarget: string
  datasetPath: string
  effectiveDatasetRoot: string
}> {
  const { fs, datasetRoot, registryName, registryConfig, baseTarget, pushLog, presenter } = ctx
  const { target: effectiveTarget, source: datasetPath } = resolveRegistryPaths({
    name: registryName,
    config: registryConfig,
    datasetRoot,
    fs,
    baseTarget,
  })
  await ensureDir(fs, dirname(effectiveTarget))
  await logDatasetEntries(fs, datasetPath, pushLog)
  presenter.registryStart({
    name: registryName,
    index: ctx.index,
    total: ctx.total,
    source: datasetPath,
    target: effectiveTarget,
  })
  return {
    effectiveTarget,
    datasetPath,
    effectiveDatasetRoot: resolveEffectiveDatasetRoot(registryConfig, baseTarget, datasetRoot),
  }
}

type RegistryOutcome = {
  skillNameMap?: SkillNameMap | undefined
  skillLinkPathMap?: SkillLinkPathMap | undefined
  result: RegistryResult
}

async function updateSingleRegistry(ctx: UpdateRegistryCtx): Promise<RegistryOutcome> {
  const { fs, registryName, registryConfig, pushLog, presenter } = ctx
  const { effectiveTarget, datasetPath, effectiveDatasetRoot } = await beginRegistryUpdate(ctx)

  const copyResult = await doCopyAndUpdateLinks(fs, {
    source: datasetPath,
    target: effectiveTarget,
    datasetRoot: effectiveDatasetRoot,
    options: buildCopyOptions(registryConfig),
  })

  // Absent is not updated: an external source that ships two of the five registries must
  // not be reported as having updated five (US-396 AC1).
  if (copyResult['skipped']) {
    pushLog('debug', `Registry '${registryName}' has no source at ${datasetPath}`)
    presenter.registrySkipped(registryName, SKIP_NOT_SHIPPED)
    const skipped: RegistryResult = {
      name: registryName,
      target: effectiveTarget,
      status: 'skipped',
      reason: SKIP_NOT_SHIPPED,
    }
    return { result: skipped }
  }

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
