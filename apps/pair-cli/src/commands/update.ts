import { relative, dirname, join } from 'path'
import { convertToRelative, FileSystemService, BackupService } from '@pair/content-ops'
import { Behavior } from '@pair/content-ops'
import {
  parseTargetAndSource,
  createLogger,
  ensureDir,
  doCopyAndUpdateLinks,
  applyLinkTransformation,
  CommandOptions,
  LogEntry,
} from './command-utils'
import {
  calculatePathType,
  getKnowledgeHubDatasetPath,
  loadConfigWithOverrides,
} from '../config-utils'

// Define types for asset registry configuration
interface AssetRegistryConfig {
  source?: string
  behavior: Behavior
  include?: string[]
  target_path: string
  description: string
}

export type UpdateOptions = CommandOptions & {
  linkStyle?: 'relative' | 'absolute' | 'auto'
  persistBackup?: boolean
  autoRollback?: boolean
}

// Context for source-based updates
interface SourceUpdateContext {
  source: string
  target: string
  abs: string
  datasetRoot: string
  fsService: FileSystemService
  options?: UpdateOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}

// Context for registry-based updates
interface AllRegistriesContext {
  target: string
  abs: string
  datasetRoot: string
  fsService: FileSystemService
  options?: UpdateOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}

interface RegistryUpdateContext {
  registryName: string
  registryConfig: AssetRegistryConfig
  target: string
  datasetRoot: string
  fsService: FileSystemService
  options?: UpdateOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}

/**
 * Helper to handle backup rollback on error
 */
async function handleBackupRollback(
  backupService: BackupService,
  error: unknown,
  options: { autoRollback: boolean; keepBackup: boolean },
  pushLog: (level: LogEntry['level'], message: string) => void,
): Promise<void> {
  if (!options.autoRollback) return

  try {
    await backupService.rollback(error as Error, options.keepBackup)
  } catch (rollbackErr) {
    pushLog('error', `Rollback failed: ${String(rollbackErr)}`)
  }
}

/**
 * Helper to create registry backup configuration map
 */
function buildRegistryBackupConfig(
  assetRegistries: Record<string, unknown>,
  fsService: FileSystemService,
): Record<string, string> {
  const registryConfig: Record<string, string> = {}
  for (const [registryName, config] of Object.entries(assetRegistries)) {
    const regConfig = config as AssetRegistryConfig
    const targetPath = regConfig.target_path || registryName
    registryConfig[registryName] = fsService.resolve(targetPath)
  }
  return registryConfig
}

/**
 * Helper to update all registries from defaults
 */
async function updateAllDefaultRegistries(ctx: {
  assetRegistries: Record<string, unknown>
  datasetRoot: string
  fsService: FileSystemService
  options?: UpdateOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}): Promise<void> {
  const { assetRegistries, datasetRoot, fsService, options, pushLog } = ctx
  for (const [registryName, registryConfig] of Object.entries(assetRegistries)) {
    await updateSingleRegistryFromDefaults({
      fsService,
      datasetRoot,
      options,
      pushLog,
      registryName,
      reg: registryConfig as AssetRegistryConfig,
    })
  }
}

/**
 * Helper to resolve dataset root path
 */
function resolveDatasetRoot(fsService: FileSystemService, options?: UpdateOptions): string {
  const datasetRoot =
    (options && (options as { datasetRoot?: string }).datasetRoot) ||
    getKnowledgeHubDatasetPath(fsService)
  return datasetRoot === '' ? fsService.currentWorkingDirectory() : datasetRoot
}

/**
 * Helper to load and validate asset registries
 */
function loadAndValidateRegistries(fsService: FileSystemService): {
  registries: Record<string, AssetRegistryConfig>
  error?: string
} {
  const registries = loadAssetRegistriesForUpdate(fsService)
  if (Object.keys(registries).length === 0) {
    return { registries, error: 'no asset registries found in config' }
  }
  return { registries }
}

/**
 * Update using default targets from config
 */
async function updateWithDefaults(
  fsService: FileSystemService,
  options?: UpdateOptions,
): Promise<{ success: boolean; message?: string; target?: string; logs?: LogEntry[] }> {
  const { logs, pushLog } = createLogger(options?.minLogLevel as LogEntry['level'] | undefined)
  pushLog('info', 'Starting updateWithDefaults')

  const backupService = new BackupService(fsService)
  const autoRollback = options?.autoRollback ?? true
  const keepBackup = options?.persistBackup ?? false

  try {
    const { registries: assetRegistries, error } = loadAndValidateRegistries(fsService)
    if (error) return { success: false, message: error }

    const datasetRoot = resolveDatasetRoot(fsService, options)
    const registryConfig = buildRegistryBackupConfig(assetRegistries, fsService)
    await backupService.backupAllRegistries(registryConfig)

    await updateAllDefaultRegistries({
      assetRegistries,
      datasetRoot,
      fsService,
      options,
      pushLog,
    })

    if (options?.linkStyle) {
      await applyLinkTransformation(fsService, options, pushLog, 'update')
    }

    await backupService.commit()
    pushLog('info', 'updateWithDefaults completed')
    return { success: true, target: 'defaults', logs }
  } catch (err) {
    pushLog('error', `updateWithDefaults failed: ${String(err)}`)
    await handleBackupRollback(backupService, err, { autoRollback, keepBackup }, pushLog)
    return { success: false, message: String(err) }
  }
}

const DIAG = process.env['PAIR_DIAG'] === '1' || process.env['PAIR_DIAG'] === 'true'

function loadAssetRegistriesForUpdate(
  fsService: FileSystemService,
): Record<string, AssetRegistryConfig> {
  const loader = loadConfigWithOverrides(fsService, {
    projectRoot: fsService.currentWorkingDirectory(),
  })
  const cfg = loader && loader.config ? loader.config : undefined
  return (cfg && cfg.asset_registries) || {}
}

type UpdateDefaultsCtx = {
  fsService: FileSystemService
  datasetRoot: string
  options?: UpdateOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
  registryName: string
  reg: AssetRegistryConfig
}

function buildFolderBehavior(include: string[], behavior: string) {
  if (!include || include.length === 0) return undefined
  return Object.fromEntries(include.map(path => [path, behavior as Behavior]))
}

async function updateSingleRegistryFromDefaults(ctx: UpdateDefaultsCtx) {
  const { fsService, datasetRoot, pushLog, registryName, reg } = ctx
  const behavior = reg.behavior || 'mirror'
  const targetPath = reg.target_path || registryName
  const include = reg.include || []
  const sourcePath = reg.source || '.'

  pushLog('info', `Updating registry ${registryName} to ${targetPath} with behavior: ${behavior}`)

  const absTarget = fsService.resolve(targetPath)
  const targetExists = await fsService.exists(absTarget)
  const pathToCheckType = targetExists ? absTarget : join(datasetRoot, sourcePath)

  const type = await calculatePathType(fsService, pathToCheckType)
  const targetFolder = type === 'file' ? dirname(targetPath) : targetPath
  await ensureDir(fsService, targetFolder)

  // Build the full source path and delegate copy to helper to reduce complexity
  const fullSourcePath = fsService.resolve(datasetRoot, sourcePath)
  const rmd = fsService.currentWorkingDirectory()
  await runRegistryCopy({
    fsService,
    rmd,
    fullSourcePath,
    absTarget,
    behavior,
    include,
    registryName,
    pushLog,
  })
}

async function runRegistryCopy(params: {
  fsService: FileSystemService
  rmd: string
  fullSourcePath: string
  absTarget: string
  behavior: string
  include: string[]
  registryName: string
  pushLog: (level: LogEntry['level'], message: string) => void
}) {
  const { fsService, rmd, fullSourcePath, absTarget, behavior, include, registryName, pushLog } =
    params

  let relativeSourcePath = relative(rmd, fullSourcePath)
  let relativeTargetPath = relative(rmd, absTarget)

  relativeSourcePath = relativeSourcePath || convertToRelative(rmd, fullSourcePath)
  relativeTargetPath = relativeTargetPath || convertToRelative(rmd, absTarget)
  if (relativeSourcePath === './') relativeSourcePath = ''
  if (relativeTargetPath === './') relativeTargetPath = ''

  await doCopyAndUpdateLinks(fsService, {
    source: relativeSourcePath,
    target: relativeTargetPath,
    datasetRoot: rmd,
    options: {
      defaultBehavior: behavior as Behavior,
      folderBehavior: buildFolderBehavior(include, behavior),
    },
  })
  pushLog('info', `Successfully updated ${registryName}`)
}

/**
 * Update from a specific source to target
 */
/**
 * Helper to perform source copy and update
 */
async function performSourceCopy(context: {
  source: string
  target: string
  datasetRoot: string
  fsService: FileSystemService
  pushLog: (level: LogEntry['level'], message: string) => void
}): Promise<void> {
  const { source, target, datasetRoot, fsService, pushLog } = context
  const cwd = fsService.currentWorkingDirectory()
  pushLog('info', `Copying/updating from ${source} to ${target} (datasetRoot: ${cwd})`)

  const fullSourcePath = fsService.resolve(datasetRoot, source)
  const fullTargetPath = fsService.resolve(cwd, target)

  let relativeSourcePath = relative(cwd, fullSourcePath) || convertToRelative(cwd, fullSourcePath)
  let relativeTargetPath = relative(cwd, fullTargetPath) || convertToRelative(cwd, fullTargetPath)

  if (relativeSourcePath === './') relativeSourcePath = ''
  if (relativeTargetPath === './') relativeTargetPath = ''

  await doCopyAndUpdateLinks(fsService, {
    source: relativeSourcePath,
    target: relativeTargetPath,
    datasetRoot: cwd,
    options: {
      defaultBehavior: 'mirror',
    },
  })
}

async function updateFromSource(context: SourceUpdateContext): Promise<{
  success: boolean
  target: string
  message?: string
  logs?: LogEntry[]
  dryRun?: boolean
}> {
  const { source, target, abs, datasetRoot, fsService, options, pushLog } = context

  const backupService = new BackupService(fsService)
  const autoRollback = options?.autoRollback ?? true
  const keepBackup = options?.persistBackup ?? false

  try {
    const fullTargetPath = fsService.resolve(fsService.currentWorkingDirectory(), target)
    await backupService.createRegistryBackup('source-update', fullTargetPath)
    await performSourceCopy({ source, target, datasetRoot, fsService, pushLog })
    await backupService.commit()
    pushLog('info', 'copyPathAndUpdateLinks finished')
    return { success: true, target: abs }
  } catch (err) {
    await handleBackupRollback(backupService, err, { autoRollback, keepBackup }, pushLog)
    return { success: false, target: abs, message: `update-failed: ${String(err)}` }
  }
}

/**
 * Helper to build registry backup config for updateAllRegistries
 */
function buildAllRegistriesBackupConfig(
  target: string,
  fsService: FileSystemService,
): Record<string, string> {
  const projectRoot = fsService.currentWorkingDirectory()
  const loader = loadConfigWithOverrides(fsService, { projectRoot })
  const config = loader.config
  const assetRegistries = config.asset_registries || {}

  const registryConfig: Record<string, string> = {}
  for (const [registryName, regConfig] of Object.entries(assetRegistries)) {
    const rc = regConfig as AssetRegistryConfig
    const targetPath = calculateEffectiveTarget(fsService, {
      registryName,
      registryConfig: rc,
      target,
    })
    registryConfig[registryName] = targetPath
  }
  return registryConfig
}

/**
 * Update all registries to a specific target
 */
async function updateAllRegistries(context: AllRegistriesContext): Promise<{
  success: boolean
  target: string
  message?: string
  logs?: LogEntry[]
  dryRun?: boolean
}> {
  const { target, abs, datasetRoot, fsService, options, pushLog } = context

  const backupService = new BackupService(fsService)
  const autoRollback = options?.autoRollback ?? true
  const keepBackup = options?.persistBackup ?? false

  try {
    if (!datasetRoot) {
      return {
        success: false,
        target: abs,
        message: 'datasetRoot not provided and no source specified',
      }
    }

    pushLog('info', `Updating from knowledge-hub dataset: ${datasetRoot} to ${target}`)

    const registryConfig = buildAllRegistriesBackupConfig(target, fsService)
    await backupService.backupAllRegistries(registryConfig)
    await processAssetRegistries({ target, datasetRoot, fsService, options, pushLog })
    await backupService.commit()

    pushLog('info', 'All asset registries processed')
    return { success: true, target: abs, logs: [] }
  } catch (err) {
    pushLog('error', `Failed to update from knowledge-hub: ${String(err)}`)
    await handleBackupRollback(backupService, err, { autoRollback, keepBackup }, pushLog)
    return { success: false, target: abs, message: `update-failed: ${String(err)}` }
  }
}

// Top-level helper: process asset registries for a given target
type ProcessAssetRegistriesCtx = {
  target: string
  datasetRoot: string
  fsService: FileSystemService
  options?: UpdateOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}

async function processAssetRegistries(ctx: ProcessAssetRegistriesCtx) {
  const { target, datasetRoot, fsService, options, pushLog } = ctx
  // Load configuration honoring project-level overrides (pair.config.json)
  // Determine project root from the injected fsService. Do not fall back to
  // process environment variables here; tests should control cwd via the
  // provided FileSystemService.
  const projectRoot = fsService.currentWorkingDirectory()
  const loader = loadConfigWithOverrides(fsService, { projectRoot })
  const config = loader.config
  const assetRegistries = config.asset_registries || {}

  for (const [registryName, registryConfig] of Object.entries(assetRegistries)) {
    await updateSingleRegistry({
      registryName,
      registryConfig: registryConfig as AssetRegistryConfig,
      target,
      datasetRoot,
      fsService,
      options,
      pushLog,
    })
  }
}

/**
 * Update a single registry to target
 */
async function updateSingleRegistry(context: RegistryUpdateContext): Promise<void> {
  const { registryName, registryConfig, target, datasetRoot, fsService, pushLog } = context
  const behavior = registryConfig.behavior || 'mirror'
  const include = registryConfig.include || []
  const sourcePath = registryConfig.source || '.'

  pushLog('info', `Updating registry ${registryName} to ${target} with behavior: ${behavior}`)

  if (include.length > 0 && behavior === 'mirror') {
    await updateSelectiveMirrorRegistry({
      registryName,
      registryConfig,
      target,
      datasetRoot,
      fsService,
      pushLog,
      include,
      sourcePath,
    })
    return
  }

  await updateNormalRegistry({
    registryName,
    registryConfig,
    target,
    datasetRoot,
    fsService,
    pushLog,
    behavior,
    sourcePath,
  })
}

async function updateSelectiveMirrorRegistry(context: {
  registryName: string
  registryConfig: AssetRegistryConfig
  target: string
  datasetRoot: string
  fsService: FileSystemService
  pushLog: (level: LogEntry['level'], message: string) => void
  include: string[]
  sourcePath: string
}): Promise<void> {
  const {
    registryName,
    registryConfig,
    target,
    datasetRoot,
    fsService,
    pushLog,
    include,
    sourcePath,
  } = context

  const effectiveTarget = calculateEffectiveTarget(fsService, {
    registryName,
    registryConfig,
    target,
  })

  for (const folder of include) {
    await processIncludedFolder({
      folder,
      sourcePath,
      effectiveTarget,
      datasetRoot,
      fsService,
      pushLog,
    })
  }
}

function calculateEffectiveTarget(
  fsService: FileSystemService,
  context: {
    registryName: string
    registryConfig: AssetRegistryConfig
    target: string
  },
) {
  const { registryName, registryConfig, target } = context

  // For explicit target updates, if a base 'target' was provided by the
  // caller, combine it with the registry's configured target_path so each
  // registry ends up under the provided base unless the registry target is absolute.
  const regTargetPath =
    (registryConfig && (registryConfig as AssetRegistryConfig).target_path) || registryName
  const effectiveTarget = regTargetPath
    ? regTargetPath.startsWith('/')
      ? regTargetPath
      : fsService.resolve(target, regTargetPath)
    : target

  return effectiveTarget
}

async function processIncludedFolder(context: {
  folder: string
  sourcePath: string
  effectiveTarget: string
  datasetRoot: string
  fsService: FileSystemService
  pushLog: (level: LogEntry['level'], message: string) => void
}): Promise<void> {
  const { folder, sourcePath, effectiveTarget, datasetRoot, fsService, pushLog } = context

  const cleanFolder = folder.replace(/^\/+/, '')
  const subSourcePath = join(sourcePath, cleanFolder)
  const subFullSourcePath = fsService.resolve(datasetRoot, subSourcePath)

  // Check if source exists
  if (!(await fsService.exists(subFullSourcePath))) {
    pushLog('warn', `Included folder ${subSourcePath} does not exist in dataset, skipping`)
    return
  }

  const cwd = fsService.currentWorkingDirectory()
  const subRelativeSourcePath = relative(cwd, subFullSourcePath)
  const subTargetPath = join(effectiveTarget, cleanFolder)
  const subFullTargetPath = fsService.resolve(cwd, subTargetPath)
  const subRelativeTargetPath = relative(cwd, subFullTargetPath)

  // Ensure the destination directory exists
  await ensureDir(fsService, dirname(subFullTargetPath))

  const subCopyOptions: Record<string, unknown> = {
    defaultBehavior: 'mirror',
  }
  await doCopyAndUpdateLinks(fsService, {
    source: subRelativeSourcePath,
    target: subRelativeTargetPath,
    datasetRoot: cwd,
    options: subCopyOptions,
  })
}

async function updateNormalRegistry(context: {
  registryName: string
  registryConfig: AssetRegistryConfig
  target: string
  datasetRoot: string
  fsService: FileSystemService
  pushLog: (level: LogEntry['level'], message: string) => void
  behavior: Behavior
  sourcePath: string
}): Promise<void> {
  const {
    registryName,
    registryConfig,
    target,
    datasetRoot,
    fsService,
    pushLog,
    behavior,
    sourcePath,
  } = context

  const copyOptions: Record<string, unknown> = {
    defaultBehavior: behavior,
  }

  const paths = calculateRegistryPaths(fsService, {
    registryName,
    registryConfig,
    target,
    datasetRoot,
    sourcePath,
  })

  await performRegistryUpdate({
    registryName,
    target,
    fsService,
    pushLog,
    paths,
    copyOptions,
  })
}

function calculateRegistryPaths(
  fsService: FileSystemService,
  context: {
    registryName: string
    registryConfig: AssetRegistryConfig
    target: string
    datasetRoot: string
    sourcePath: string
  },
) {
  const { registryName, registryConfig, target, datasetRoot, sourcePath } = context

  const cwd = fsService.currentWorkingDirectory()
  const fullSourcePath = fsService.resolve(datasetRoot, sourcePath)
  const effectiveTarget = calculateEffectiveTarget(fsService, {
    registryName,
    registryConfig,
    target,
  })
  const fullTargetPath = fsService.resolve(cwd, effectiveTarget)

  if (DIAG) {
    console.error('[diag] calculateRegistryPaths:', {
      cwd,
      datasetRoot,
      fullSourcePath,
      effectiveTarget,
      fullTargetPath,
    })
  }

  return {
    relativeSourcePath: relative(cwd, fullSourcePath),
    fullTargetPath,
    relativeTargetPath: relative(cwd, fullTargetPath),
    monorepoRoot: cwd,
  }
}

async function performRegistryUpdate(context: {
  registryName: string
  target: string
  fsService: FileSystemService
  pushLog: (level: LogEntry['level'], message: string) => void
  paths: {
    relativeSourcePath: string
    fullTargetPath: string
    relativeTargetPath: string
    monorepoRoot: string
  }
  copyOptions: Record<string, unknown>
}): Promise<void> {
  const { registryName, target, fsService, pushLog, paths, copyOptions } = context

  // Ensure the destination directory exists before attempting copy.
  await ensureDir(fsService, paths.fullTargetPath)
  if (DIAG) {
    console.error('[diag] performRegistryUpdate: about to copy', {
      source: paths.relativeSourcePath,
      target: paths.relativeTargetPath,
      datasetRoot: paths.monorepoRoot,
      fullTargetPath: paths.fullTargetPath,
    })
  }

  await doCopyAndUpdateLinks(fsService, {
    source: paths.relativeSourcePath,
    target: paths.relativeTargetPath,
    datasetRoot: paths.monorepoRoot,
    options: copyOptions,
  })
  pushLog('info', `Successfully updated ${registryName} to ${target}`)
}

export async function updateCommand(
  fsService: FileSystemService,
  args: string[],
  options?: UpdateOptions,
) {
  // Handle special mode: useDefaults
  if (options?.useDefaults) {
    return await updateWithDefaults(fsService, options)
  }

  // Parse and validate input
  const parseResult = parseAndValidateInput(fsService, args)
  if (!parseResult.success) return parseResult.result

  const { target, source, abs } = parseResult

  // Ensure target is defined (it should be after validation)
  if (!target) {
    return { success: false, message: 'target is required' }
  }

  // Execute the update
  return await executeUpdate({ target, source, abs: abs!, fsService, options })
}

function parseAndValidateInput(
  fsService: FileSystemService,
  args: string[],
): {
  success: boolean
  result?: { success: boolean; message: string }
  target?: string
  source?: string | null | undefined
  abs?: string
} {
  const { target, source } = parseTargetAndSource(args)

  if (!target) {
    return {
      success: false,
      result: {
        success: false,
        message:
          'no target provided. Use --use-defaults to update all registries to their default targets, or specify a registry name to update only that registry',
      },
    }
  }

  const abs = fsService.resolve(fsService.currentWorkingDirectory(), target)

  // Validate target path
  if (!abs || abs === '/' || abs === '') {
    return {
      success: false,
      result: {
        success: false,
        message: 'invalid target path',
      },
    }
  }

  return { success: true, target, source: source ?? undefined, abs }
}

async function ensureTargetDirectoryExists(
  fsService: FileSystemService,
  abs: string,
  pushLog: (level: LogEntry['level'], message: string) => void,
): Promise<{ success: boolean; message?: string }> {
  const targetExists = await fsService.exists(abs)
  if (targetExists) return { success: true }

  const cwd = fsService.currentWorkingDirectory()
  const rel = relative(cwd, abs)
  const isOutside = rel === '' ? false : rel.startsWith('..')
  if (isOutside) {
    pushLog('error', `Target directory '${abs}' does not exist`)
    return { success: false, message: `Target directory '${abs}' does not exist` }
  }

  pushLog('info', `Target directory '${abs}' does not exist; creating`)
  try {
    await ensureDir(fsService, abs)
    return { success: true }
  } catch (err) {
    pushLog('error', `Failed to create target directory '${abs}': ${String(err)}`)
    return {
      success: false,
      message: `Target directory '${abs}' does not exist and could not be created`,
    }
  }
}

async function executeUpdate(params: {
  target: string
  source?: string | null | undefined
  abs: string
  fsService: FileSystemService
  options?: UpdateOptions | undefined
}) {
  const { target, source, abs, fsService } = params

  const { pushLog } = createLogger(params.options?.minLogLevel as LogEntry['level'] | undefined)
  pushLog('info', 'Starting updateCommand')

  const targetCheck = await ensureTargetDirectoryExists(fsService, abs, pushLog)
  if (!targetCheck.success) return targetCheck

  try {
    let datasetRoot =
      (params.options && (params.options as { datasetRoot?: string }).datasetRoot) ||
      getKnowledgeHubDatasetPath(fsService)
    if (datasetRoot === '') datasetRoot = fsService.currentWorkingDirectory()

    if (source) {
      return await updateFromSource({
        source,
        target,
        abs,
        datasetRoot,
        fsService,
        options: params.options,
        pushLog,
      })
    }

    return await updateAllRegistries({
      target,
      abs,
      datasetRoot,
      fsService,
      options: params.options,
      pushLog,
    })
  } catch (err) {
    return { success: false, message: (err as Error)?.message ?? String(err) }
  }
}
