import { resolve, relative, dirname, join } from 'path'
import { FileSystemService } from '@pair/content-ops'
import { Behavior } from '@pair/content-ops'
import {
  parseTargetAndSource,
  createLogger,
  ensureDir,
  doCopyAndUpdateLinks,
  CommandOptions,
  LogEntry,
} from './command-utils'
import { getKnowledgeHubDatasetPath, loadConfigWithOverrides } from '../config-utils'

// Define types for asset registry configuration
interface AssetRegistryConfig {
  source?: string
  behavior: Behavior
  include?: string[]
  target_path: string
  description: string
}

export type UpdateOptions = CommandOptions

// Context for source-based updates
interface SourceUpdateContext {
  source: string
  target: string
  abs: string
  datasetRoot: string
  fsService: FileSystemService
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
 * Update using default targets from config
 */
async function updateWithDefaults(
  fsService: FileSystemService,
  options?: UpdateOptions,
): Promise<{ success: boolean; message?: string; target?: string; logs?: LogEntry[] }> {
  const { logs, pushLog } = createLogger(options?.minLogLevel as LogEntry['level'] | undefined)

  pushLog('info', 'Starting updateWithDefaults')

  try {
    const assetRegistries = loadAssetRegistriesForUpdate(fsService)

    if (Object.keys(assetRegistries).length === 0) {
      return { success: false, message: 'no asset registries found in config' }
    }
    let datasetRoot =
      (options && (options as { datasetRoot?: string }).datasetRoot) ||
      getKnowledgeHubDatasetPath(fsService)

    // If upstream helper returned empty string to signal a bundle layout,
    // interpret that as the FileSystemService's current working directory
    // so we don't accidentally resolve paths against the real process.cwd().
    if (datasetRoot === '') datasetRoot = fsService.currentWorkingDirectory()

    // Update each registry to its default target
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

    pushLog('info', 'updateWithDefaults completed')
    return { success: true, target: 'defaults', logs }
  } catch (err) {
    pushLog('error', `updateWithDefaults failed: ${String(err)}`)
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

async function updateSingleRegistryFromDefaults(ctx: UpdateDefaultsCtx) {
  const { fsService, datasetRoot, pushLog, registryName, reg } = ctx
  const behavior = reg.behavior || 'mirror'
  const targetPath = reg.target_path || registryName
  const include = reg.include || []
  const sourcePath = reg.source || '.'

  pushLog('info', `Updating registry ${registryName} to ${targetPath} with behavior: ${behavior}`)

  const absTarget = resolve(targetPath)
  await ensureDir(fsService, absTarget)

  // Perform update unconditionally (no dry-run support)

  // Build the full source path
  const fullSourcePath = resolve(datasetRoot, sourcePath)
  const cwd = fsService.currentWorkingDirectory()
  const relativeSourcePath = fullSourcePath
  const fullTargetPath = resolve(cwd, absTarget)
  const relativeTargetPath = fullTargetPath

  await doCopyAndUpdateLinks(fsService, {
    source: relativeSourcePath,
    target: relativeTargetPath,
    datasetRoot: '/',
    options: {
      defaultBehavior: behavior as Behavior,
      folderBehavior:
        include.length > 0
          ? Object.fromEntries(include.map(path => [path, behavior as Behavior]))
          : undefined,
    },
  })
  pushLog('info', `Successfully updated ${registryName}`)
}

/**
 * Update from a specific source to target
 */
async function updateFromSource(context: SourceUpdateContext): Promise<{
  success: boolean
  target: string
  message?: string
  logs?: LogEntry[]
  dryRun?: boolean
}> {
  const { source, target, abs, datasetRoot, fsService, pushLog } = context
  try {
    // Perform update unconditionally (no dry-run support)

    const cwd = fsService.currentWorkingDirectory()
    pushLog('info', `Copying/updating from ${source} to ${target} (datasetRoot: ${cwd})`)
    const fullSourcePath = resolve(datasetRoot, source)
    const relativeSourcePath = fullSourcePath
    const fullTargetPath = resolve(cwd, target)
    const relativeTargetPath = fullTargetPath

    await doCopyAndUpdateLinks(fsService, {
      source: relativeSourcePath,
      target: relativeTargetPath,
      datasetRoot: '/',
      options: {
        defaultBehavior: 'mirror',
      },
    })
    pushLog('info', 'copyPathAndUpdateLinks finished')
    return { success: true, target: abs }
  } catch (err) {
    return { success: false, target: abs, message: `update-failed: ${String(err)}` }
  }
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
  try {
    if (!datasetRoot) {
      return {
        success: false,
        target: abs,
        message: 'datasetRoot not provided and no source specified',
      }
    }

    pushLog('info', `Updating from knowledge-hub dataset: ${datasetRoot} to ${target}`)

    // Perform update unconditionally (no dry-run support)

    // Delegate the registry processing to a shared helper
    await processAssetRegistries({ target, datasetRoot, fsService, options, pushLog })

    pushLog('info', 'All asset registries processed')
    return { success: true, target: abs, logs: [] }
  } catch (err) {
    pushLog('error', `Failed to update from knowledge-hub: ${String(err)}`)
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

  const effectiveTarget = calculateEffectiveTarget({
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

function calculateEffectiveTarget(context: {
  registryName: string
  registryConfig: AssetRegistryConfig
  target: string
}) {
  const { registryName, registryConfig, target } = context

  // For explicit target updates, if a base 'target' was provided by the
  // caller, combine it with the registry's configured target_path so each
  // registry ends up under the provided base unless the registry target is absolute.
  const regTargetPath =
    (registryConfig && (registryConfig as AssetRegistryConfig).target_path) || registryName
  const effectiveTarget = regTargetPath
    ? regTargetPath.startsWith('/')
      ? regTargetPath
      : resolve(target, regTargetPath)
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
  const subFullSourcePath = resolve(datasetRoot, subSourcePath)

  // Check if source exists
  if (!(await fsService.exists(subFullSourcePath))) {
    pushLog('warn', `Included folder ${subSourcePath} does not exist in dataset, skipping`)
    return
  }

  const cwd = fsService.currentWorkingDirectory()
  const subRelativeSourcePath = subFullSourcePath
  const subTargetPath = join(effectiveTarget, cleanFolder)
  const subFullTargetPath = resolve(cwd, subTargetPath)
  const subRelativeTargetPath = subFullTargetPath

  // Ensure the destination directory exists
  await ensureDir(fsService, dirname(subFullTargetPath))

  const subCopyOptions: Record<string, unknown> = {
    defaultBehavior: 'mirror',
  }
  await doCopyAndUpdateLinks(fsService, {
    source: subRelativeSourcePath,
    target: subRelativeTargetPath,
    datasetRoot: '/',
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
  const fullSourcePath = resolve(datasetRoot, sourcePath)
  const effectiveTarget = calculateEffectiveTarget({ registryName, registryConfig, target })
  const fullTargetPath = resolve(cwd, effectiveTarget)

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
    relativeSourcePath: fullSourcePath,
    fullTargetPath,
    relativeTargetPath: fullTargetPath,
    monorepoRoot: '/',
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

  const abs = resolve(fsService.currentWorkingDirectory(), target)

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
        pushLog,
      })
    }

    return await updateAllRegistries({ target, abs, datasetRoot, fsService, pushLog })
  } catch (err) {
    return { success: false, message: (err as Error)?.message ?? String(err) }
  }
}
