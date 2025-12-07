import { relative, isAbsolute, join, dirname } from 'path'
import { convertToRelative, detectSourceType, SourceType } from '@pair/content-ops'
import { FileSystemService } from '@pair/content-ops'
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
  calculatePaths,
  getKnowledgeHubDatasetPath,
  calculatePathType,
  loadConfigWithOverrides,
} from '../config-utils'
import {
  installKB,
  installKBFromLocalZip,
  installKBFromLocalDirectory,
} from '../kb-manager/kb-installer'

// Define types for asset registry configuration
export interface AssetRegistryConfig {
  source?: string
  behavior: Behavior
  include?: string[]
  target_path: string
  description: string
}

export type InstallOptions = CommandOptions & {
  baseTarget?: string
  linkStyle?: 'relative' | 'absolute' | 'auto'
}

export interface InstallContext {
  fsService: FileSystemService
  datasetRoot: string
  options?: InstallOptions
  pushLog: (level: LogEntry['level'], message: string) => void
}

function calculateAbsoluteTarget(
  registryConfig: AssetRegistryConfig,
  options: InstallOptions | undefined,
  type: 'file' | 'dir',
  fsService: FileSystemService,
): string {
  const targetPath = registryConfig.target_path || registryConfig.source || '.'
  const targetFolder = type === 'file' ? dirname(targetPath) : targetPath

  return options?.baseTarget
    ? fsService.resolve(options.baseTarget, targetFolder)
    : fsService.resolve(fsService.currentWorkingDirectory(), targetFolder)
}

async function checkTargetEmptiness(
  absTarget: string,
  registryConfig: AssetRegistryConfig,
  context: InstallContext,
  pushLog: (level: LogEntry['level'], message: string) => void,
): Promise<boolean> {
  const sourcePath = join(context.datasetRoot, registryConfig.source || '')
  const type = await calculatePathType(context.fsService, sourcePath)
  const targetPath = type === 'file' ? join(absTarget, registryConfig.source || '') : absTarget
  const check = await ensureTargetIsEmpty(context.fsService, targetPath)
  if (!check.ok) {
    // For 'add' behavior, allow installing into existing directories
    if (registryConfig.behavior === 'add') {
      return true
    }

    // Check if we're in bundle mode and can allow in-place installation
    if (await isBundleModeAllowed(absTarget, registryConfig, context)) {
      return true
    }

    pushLog('error', check.message!)
    return false
  }
  return true
}

async function isBundleModeAllowed(
  absTarget: string,
  registryConfig: AssetRegistryConfig,
  context: InstallContext,
): Promise<boolean> {
  try {
    const cwd = context.fsService.currentWorkingDirectory()
    // Only allow in-place acceptance when datasetRoot equals the fs cwd
    // (bundle-mode). Compare against the registry's source path so we
    // only skip conflicts when the installation target aligns with the
    // dataset source being copied from.
    if (context.datasetRoot && context.datasetRoot === cwd) {
      const fullSourcePath = context.fsService.resolve(
        context.datasetRoot,
        registryConfig.source || '.',
      )
      return absTarget === fullSourcePath || absTarget.startsWith(fullSourcePath + '/')
    }
  } catch {
    // Fall through to error handling
  }
  return false
}

/**
 * Install a single registry to the target location
 */
async function installSingleRegistry(
  registryName: string,
  registryConfig: AssetRegistryConfig,
  context: InstallContext,
): Promise<void> {
  const { fsService, datasetRoot, options, pushLog } = context

  if (registryConfig.behavior === 'skip') {
    pushLog('info', `Skipping registry ${registryName} due to skip behavior`)
    return
  }

  const sourcePath = join(datasetRoot, registryConfig.source || '')
  if (!fsService.exists(sourcePath)) {
    pushLog(
      'info',
      `Skipping registry ${registryName} due to source path does not exist: ${sourcePath}`,
    )
    return
  }

  pushLog(
    'info',
    `Installing registry ${registryName} to ${registryConfig.target_path} with behavior: ${registryConfig.behavior}`,
  )

  const type = await calculatePathType(fsService, sourcePath)
  const absTarget = calculateAbsoluteTarget(registryConfig, options, type, fsService)
  await ensureDir(fsService, absTarget)

  const shouldProceed = await checkTargetEmptiness(absTarget, registryConfig, context, pushLog)
  if (!shouldProceed) {
    return
  }

  await copyRegistryFiles({
    fsService,
    datasetRoot,
    registryConfig,
    absTarget,
    pushLog,
  })
}

async function copyRegistryFiles(params: {
  fsService: FileSystemService
  datasetRoot: string
  registryConfig: AssetRegistryConfig
  absTarget: string
  pushLog: (level: LogEntry['level'], message: string) => void
  copyOptions?: Record<string, unknown>
}) {
  const { fsService, datasetRoot, registryConfig, absTarget, pushLog, copyOptions } = params

  const pathType = await calculatePathType(
    fsService,
    join(datasetRoot, registryConfig.source || ''),
  )
  const fullTargetPath =
    pathType === 'file' ? join(absTarget, registryConfig.target_path || '') : absTarget

  const paths = calculatePaths(fsService, datasetRoot, fullTargetPath, registryConfig.source)
  logDiagnosticsIfEnabled(paths)

  const optionsToPass = copyOptions || buildCopyOptionsForRegistry(registryConfig)
  // Use convertToRelative to normalize relative paths consistently with content-ops
  let sourceToPass =
    paths.relativeSourcePath ?? convertToRelative(paths.monorepoRoot, paths.fullSourcePath)
  let targetToPass =
    paths.relativeTargetPath ?? convertToRelative(paths.monorepoRoot, paths.fullTargetPath)

  // Preserve previous relative() behavior: if convertToRelative returned './' (same dir),
  // convert it to '' so downstream callers that expect an empty string continue to work.
  if (sourceToPass === './') sourceToPass = ''
  if (targetToPass === './') targetToPass = ''

  await doCopyAndUpdateLinks(fsService, {
    source: sourceToPass,
    target: targetToPass,
    datasetRoot: paths.monorepoRoot,
    options: optionsToPass,
  })

  pushLog('info', `Successfully installed ${String(registryConfig.target_path || '')}`)
}

function logDiagnosticsIfEnabled(paths: ReturnType<typeof calculatePaths>) {
  const diagEnv = process.env['PAIR_DIAG']
  const DIAG = diagEnv === '1' || diagEnv === 'true'
  if (!DIAG) return

  try {
    console.error('[diag] copyRegistryFiles values:')
    console.error('[diag] fullSourcePath=', paths.fullSourcePath)
    console.error('[diag] cwd=', paths.cwd)
    console.error('[diag] monorepoRoot=', paths.monorepoRoot)
    console.error('[diag] relativeSourcePath=', paths.relativeSourcePath)
    console.error('[diag] fullTargetPath=', paths.fullTargetPath)
    console.error('[diag] relativeTargetPath=', paths.relativeTargetPath)
  } catch (e) {
    console.error('[diag] error emitting diagnostics', String(e))
  }
}

function buildCopyOptionsForRegistry(registryConfig: AssetRegistryConfig): Record<string, unknown> {
  return {
    defaultBehavior: registryConfig.behavior as Behavior,
    folderBehavior:
      registryConfig.include && registryConfig.include.length > 0
        ? Object.fromEntries(
            (registryConfig.include || []).map(path => [path, registryConfig.behavior as Behavior]),
          )
        : undefined,
  }
}

/**
 * Install using default targets from config
 */
/**
 * Normalize dataset root to absolute path if needed
 */
function normalizeDatasetRoot(fsService: FileSystemService, datasetRoot: string): string {
  let normalized = datasetRoot
  // Convert to absolute path if it's a relative path
  if (normalized && !normalized.startsWith('/') && !normalized.match(/^\w:[\\/]/)) {
    normalized = fsService.resolve(fsService.rootModuleDirectory(), normalized)
  }
  return normalized
}

async function installWithDefaults(
  fsService: FileSystemService,
  options?: InstallOptions,
): Promise<{ success: boolean; message?: string; target?: string; logs?: LogEntry[] }> {
  const { logs, pushLog } = createLogger(options?.minLogLevel as LogEntry['level'] | undefined)
  pushLog('info', 'Starting installWithDefaults')
  try {
    const { assetRegistries, datasetRoot: rawDatasetRoot } = loadConfigAndAssetRegistries(
      fsService,
      options,
    )
    const datasetRoot = normalizeDatasetRoot(fsService, rawDatasetRoot)
    const entries = Object.entries(assetRegistries) as Array<[string, AssetRegistryConfig]>
    const precheck = await ensureAllTargetsAreEmptyForEntries(
      fsService,
      entries,
      options,
      datasetRoot,
    )
    if (!precheck.ok) {
      const msg = precheck.message || 'destination exists'
      pushLog('error', msg)
      return { success: false, message: msg }
    }
    for (const [registryName, registryConfig] of entries) {
      const context: InstallContext = {
        fsService,
        datasetRoot,
        pushLog,
        ...(options && { options }),
      }
      await installSingleRegistry(registryName, registryConfig as AssetRegistryConfig, context)
    }
    pushLog('info', 'installWithDefaults completed')
    return { success: true, target: 'defaults', logs }
  } catch (err) {
    pushLog('error', `install-failed: ${String(err)}`)
    return { success: false, message: `install-failed: ${String(err)}` }
  }
}

/**
 * Load config (with overrides) and return asset registries plus dataset root.
 * Extracted to keep installWithDefaults / installWithOverrides small.
 */
function loadConfigAndAssetRegistries(fsService: FileSystemService, options?: InstallOptions) {
  const loaderOpts: { customConfigPath?: string } = {}
  if (options?.customConfigPath) loaderOpts.customConfigPath = options.customConfigPath
  const loader = loadConfigWithOverrides(fsService, loaderOpts)
  const config = loader.config
  const assetRegistries = config.asset_registries || {}
  if (!assetRegistries || Object.keys(assetRegistries).length === 0) {
    throw new Error('no asset registries found in config')
  }
  let datasetRoot = options?.datasetRoot || getKnowledgeHubDatasetPath(fsService)
  if (datasetRoot === '') datasetRoot = fsService.currentWorkingDirectory()
  return { assetRegistries, datasetRoot }
}

async function ensureTargetIsEmpty(
  fsService: FileSystemService,
  targetPath: string,
): Promise<{ ok: boolean; message?: string }> {
  const exists = await fsService.exists(targetPath)
  if (!exists) return { ok: true }
  const folderEntries = await fsService.readdir(targetPath).catch(() => [])
  const fileEntries = await fsService.readFile(targetPath).catch(() => [])
  if (folderEntries.length > 0 || fileEntries.length > 0)
    return { ok: false, message: `Destination already exists: ${targetPath}` }
  return { ok: true }
}

/**
 * Return an overlapping/conflict message when any ancestor/descendant targets
 * or exact duplicates are found, otherwise null.
 */
function detectOverlappingTargets(resolved: Array<{ registryName: string; absTarget: string }>) {
  for (let i = 0; i < resolved.length; i++) {
    for (let j = 0; j < resolved.length; j++) {
      if (i === j) continue
      const a = resolved[i]!.absTarget
      const b = resolved[j]!.absTarget
      if (a === b) {
        return `Conflicting registry targets: '${a}' is used by multiple registries`
      }
      const rel = relative(a, b)
      if (rel && !rel.startsWith('..') && !rel.startsWith('/')) {
        return `Overlapping registry targets: '${a}' is an ancestor of '${b}'`
      }
    }
  }
  return null
}

async function precheckOverlapsAndBaseTarget(
  fsService: FileSystemService,
  options: InstallOptions | undefined,
  resolved: Array<{ registryName: string; absTarget: string }>,
): Promise<{ ok: false; message: string } | null> {
  const overlapMsg = detectOverlappingTargets(resolved)
  if (!overlapMsg) return null

  // If any of the targets (or the provided baseTarget) exist and are non-empty,
  // prefer returning a Destination already exists message.
  if (await anyNonEmptyTargetExists(fsService, options?.baseTarget, resolved)) {
    const path = (options && options.baseTarget) || resolved[0]?.absTarget
    return { ok: false, message: `Destination already exists: ${path}` }
  }

  return { ok: false, message: overlapMsg }
}

async function anyNonEmptyTargetExists(
  fsService: FileSystemService,
  baseTarget: string | undefined,
  resolved: Array<{ registryName: string; absTarget: string }>,
): Promise<boolean> {
  if (baseTarget) {
    const baseExists = await fsService.exists(baseTarget)
    if (baseExists) {
      const baseCheck = await ensureTargetIsEmpty(fsService, baseTarget).catch(() => ({
        ok: false,
      }))
      if (!baseCheck.ok) return true
    }
  }

  for (const { absTarget } of resolved) {
    // if target exists and is non-empty, return true
    const exists = await fsService.exists(absTarget)
    if (!exists) continue
    const check = await ensureTargetIsEmpty(fsService, absTarget).catch(() => ({ ok: false }))
    if (!check.ok) return true
  }

  return false
}

/**
 * Build copy options for registry installation
 */
function buildCopyOptions(registryConfig: AssetRegistryConfig): Record<string, unknown> {
  const behavior = registryConfig.behavior || 'mirror'
  const include = registryConfig.include || []

  const copyOptions: Record<string, unknown> = {
    defaultBehavior: behavior,
  }

  // For selective behavior, set folder behaviors for included folders
  if (include.length > 0 && behavior === 'mirror') {
    copyOptions['folderBehavior'] = {}
    // Only mirror the included folders
    include.forEach((folder: string) => {
      ;(copyOptions['folderBehavior'] as Record<string, string>)[folder] = 'mirror'
    })
    // Set default to 'skip' for non-included folders
    copyOptions['defaultBehavior'] = 'skip'
  }

  return copyOptions
}

export interface InstallRegistryContext {
  fsService: FileSystemService
  options: InstallOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}

/**
 * Install a single registry with custom target
 */
export async function installRegistryWithCustomTarget(
  registryEntry: [string, AssetRegistryConfig],
  customTarget: string,
  datasetRoot: string,
  context: InstallRegistryContext,
): Promise<void> {
  const [registryName, registryConfig] = registryEntry
  const { fsService, options, pushLog } = context
  const behavior = registryConfig.behavior || 'mirror'

  if (behavior === 'skip') {
    pushLog('info', `Skipping registry ${registryName} due to skip behavior`)
    return
  }

  pushLog(
    'info',
    `Installing registry ${registryName} to ${customTarget} with behavior: ${behavior}`,
  )

  const absTarget = options?.baseTarget
    ? fsService.resolve(options.baseTarget, customTarget)
    : fsService.resolve(fsService.currentWorkingDirectory(), customTarget)
  await ensureDir(fsService, absTarget)

  const copyOptions = buildCopyOptions(registryConfig)
  await copyRegistryFiles({
    fsService,
    datasetRoot,
    registryConfig,
    absTarget,
    pushLog,
    copyOptions,
  })
  pushLog('info', `Successfully installed ${registryName}`)
}

/**
 * Check if bundle mode allows skipping emptiness check for a target
 */
function shouldSkipEmptinessCheckInBundleMode(
  fsService: FileSystemService,
  absTarget: string,
  registryConfig: AssetRegistryConfig,
  datasetRoot: string,
): boolean {
  if (datasetRoot !== fsService.currentWorkingDirectory()) return false
  try {
    const fullSourcePath = fsService.resolve(datasetRoot, registryConfig.source || '.')
    return absTarget === fullSourcePath || absTarget.startsWith(fullSourcePath + '/')
  } catch {
    return false
  }
}

/**
 * Check emptiness for mirror behavior registries
 */
async function checkTargetsEmptinessForMirrorRegistries(
  fsService: FileSystemService,
  resolved: Array<{
    registryName: string
    absTarget: string
    registryConfig: AssetRegistryConfig
  }>,
  datasetRoot?: string,
): Promise<{ ok: boolean; message?: string }> {
  for (const { absTarget, registryConfig } of resolved) {
    // Only check emptiness for behaviors that require empty targets
    if (registryConfig.behavior !== 'mirror') continue

    // Skip emptiness check in bundle mode if target is within source
    if (
      datasetRoot &&
      shouldSkipEmptinessCheckInBundleMode(fsService, absTarget, registryConfig, datasetRoot)
    ) {
      continue
    }

    const exists = await fsService.exists(absTarget)
    if (!exists) continue
    const check = await ensureTargetIsEmpty(fsService, absTarget)
    if (!check.ok) return { ok: false, message: check.message || 'destination exists' }
  }

  return { ok: true }
}

/**
 * Ensure all target directories for the provided registry entries exist and are empty.
 * Returns { ok: boolean, message?: string }
 */
export async function ensureAllTargetsAreEmptyForEntries(
  fsService: FileSystemService,
  entries: Array<[string, AssetRegistryConfig]>,
  options?: InstallOptions,
  datasetRoot?: string,
): Promise<{ ok: boolean; message?: string }> {
  // Resolve all absolute targets first so we can detect overlaps (ancestor/descendant)
  const resolved: Array<{
    registryName: string
    absTarget: string
    registryConfig: AssetRegistryConfig
  }> = entries.map(([registryName, registryConfig]) => {
    const targetPath = registryConfig.target_path || registryName
    const absTarget = options?.baseTarget
      ? fsService.resolve(options.baseTarget, targetPath)
      : fsService.resolve(fsService.currentWorkingDirectory(), targetPath)
    return { registryName, absTarget, registryConfig }
  })

  // Precheck overlaps and baseTarget existence using a small helper to keep
  // this function's complexity under the lint threshold.
  const precheck = await precheckOverlapsAndBaseTarget(fsService, options, resolved)
  if (precheck) return precheck

  // No overlaps detected; ensure existing targets are empty
  const emptinessCheck = await checkTargetsEmptinessForMirrorRegistries(
    fsService,
    resolved,
    datasetRoot,
  )
  if (!emptinessCheck.ok) return emptinessCheck

  return { ok: true }
}

/**
 * Convert a technical precheck message into a user-friendly message.
 */
function friendlyInstallMessage(m?: string): string {
  const msg = m || ''
  if (
    msg.includes('Overlapping registry targets') ||
    msg.includes('Conflicting registry targets')
  ) {
    return `${msg}. This usually happens when registries try to write into nested folders under the same base target. Try one of the following: use --use-defaults to install registries to their configured default locations, specify a different target folder (for a single registry pass the registry name as the target), or remove/rename the conflicting folders and try again.`
  }
  if (msg.includes('Destination already exists')) {
    return `${msg}. The destination already contains files — remove or choose a different target, or run again after cleaning the target folder.`
  }
  return msg
}

export async function installCommand(
  fsService: FileSystemService,
  args: string[],
  options?: InstallOptions,
) {
  const { target, source } = parseTargetAndSource(args)

  // Handle special modes first
  const specialMode = await handleSpecialModes(fsService, options)
  if (specialMode.handled) {
    return specialMode.result
  }

  const resolvedTarget = options?.baseTarget || target || undefined

  return await executeInstall(fsService, resolvedTarget, source || undefined, options)
}

async function executeInstall(
  fsService: FileSystemService,
  resolvedTarget: string | undefined,
  source: string | undefined,
  options?: InstallOptions,
) {
  // Validate and prepare target
  const targetValidation = await validateAndPrepareTarget(resolvedTarget, fsService, () => {})
  if (!targetValidation.success) {
    return {
      success: false,
      message: targetValidation.message || 'Target validation failed',
      target: resolvedTarget || '',
    }
  }

  const abs = targetValidation.abs!
  let datasetRoot = options?.datasetRoot || getKnowledgeHubDatasetPath(fsService)
  if (datasetRoot === '') datasetRoot = fsService.currentWorkingDirectory()
  // Use the normalized dataset root
  datasetRoot = normalizeDatasetRoot(fsService, datasetRoot)

  const context: {
    source: string | undefined
    target: string | undefined
    abs: string
    datasetRoot: string
    fsService: FileSystemService
    options?: InstallOptions
  } = {
    source: source || undefined,
    target: resolvedTarget,
    abs,
    datasetRoot,
    fsService,
    options: { ...(options || {}), baseTarget: abs },
  }
  return await performInstallation(context)
}

/**
 * Extracted helper to perform the installation and format results. This keeps
 * `installCommand` small so lint rules on max-lines and complexity are met.
 */
async function performInstallation(context: {
  source: string | undefined
  target: string | undefined
  abs: string
  datasetRoot: string
  fsService: FileSystemService
  options?: InstallOptions
}): Promise<{ success: boolean; target: string; message?: string; logs?: LogEntry[] }> {
  const { source, target, abs, datasetRoot, fsService, options } = context

  const { logs, pushLog } = createLogger(options?.minLogLevel as LogEntry['level'] | undefined)
  pushLog('info', 'Starting installCommand')

  try {
    const result = await executeInstallation({
      source,
      target,
      abs,
      datasetRoot,
      fsService,
      pushLog,
      ...(options && { options }),
    })

    // Apply link transformation if requested
    if (result.success && options?.linkStyle) {
      await applyLinkTransformation(fsService, options, pushLog, 'install')
    }

    return processInstallationResult(result, logs, options)
  } catch (err) {
    return { success: false, message: (err as Error)?.message ?? String(err), target: context.abs }
  }
}

/**
 * Process installation result and format for return
 */
function processInstallationResult(
  result: { success: boolean; target: string; message?: string },
  logs: LogEntry[],
  options?: InstallOptions,
): { success: boolean; target: string; message?: string; logs?: LogEntry[] } {
  // Convert technical precheck errors into user-friendly guidance
  if (!result.success && result.message) {
    result.message = friendlyInstallMessage(String(result.message))
    // Print debug dump only when minLogLevel is debug/trace
    const minLevel = options?.minLogLevel as LogEntry['level'] | undefined
    if (minLevel === 'debug' || minLevel === 'trace') {
      console.error('DEBUG: installCommand result failing:', JSON.stringify(result))
    }
  }

  return formatResult(result, logs)
}

/**
 * Handle special installation modes (useDefaults)
 */
async function handleSpecialModes(
  fsService: FileSystemService,
  options?: InstallOptions,
): Promise<{
  handled: boolean
  result?: { success: boolean; target?: string; message?: string; logs?: LogEntry[] }
}> {
  // Handle useDefaults mode when requested through options
  if (options?.useDefaults) {
    return { handled: true, result: await installWithDefaults(fsService, options) }
  }
  return { handled: false }
}

/**
 * Validate target and prepare installation directory
 */
async function validateAndPrepareTarget(
  target: string | undefined,
  fsService: FileSystemService,
  pushLog: (level: LogEntry['level'], message: string) => void,
): Promise<{ success: boolean; abs?: string; message?: string }> {
  if (!target) {
    return {
      success: false,
      message:
        'no target provided. Use --use-defaults to install all registries to their default targets, or specify a registry name to install only that registry',
    }
  }

  const abs =
    target && !isAbsolute(target)
      ? fsService.resolve(fsService.currentWorkingDirectory(), target)
      : fsService.resolve(target || '')

  // Validate target path
  if (!abs || abs === '/' || abs === '') {
    return { success: false, message: 'invalid target path' }
  }

  await ensureDir(fsService, abs)
  pushLog('info', `Ensured target directory ${abs}`)

  return { success: true, abs }
}

/**
 * Execute the installation based on source or registry mode
 */
async function executeInstallation(context: {
  source: string | undefined
  target: string | undefined
  abs: string
  datasetRoot: string
  fsService: FileSystemService
  options?: InstallOptions
  pushLog: (level: LogEntry['level'], message: string) => void
}): Promise<{
  success: boolean
  target: string
  message?: string
  logs?: LogEntry[]
}> {
  const { source, target, abs, datasetRoot, fsService, options, pushLog } = context

  if (source) {
    return await handleSourceInstallation({
      source,
      target: target!,
      abs,
      datasetRoot,
      fsService,
      pushLog,
    })
  } else {
    return await handleRegistryInstallation({
      target: target!,
      abs,
      datasetRoot,
      fsService,
      pushLog,
      ...(options && { options }),
    })
  }
}

/**
 * Handle installation from knowledge-hub dataset using asset registries
 */
async function handleRegistryInstallation(context: {
  target: string
  abs: string
  datasetRoot: string
  fsService: FileSystemService
  options?: InstallOptions
  pushLog: (level: LogEntry['level'], message: string) => void
}): Promise<{
  success: boolean
  target: string
  message?: string
  logs?: LogEntry[]
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

    pushLog('info', `Installing from knowledge-hub dataset: ${datasetRoot} to ${target}`)

    const loaderOpts: { customConfigPath?: string } = {}
    if (options?.customConfigPath) loaderOpts.customConfigPath = options.customConfigPath
    const loader = loadConfigWithOverrides(fsService, loaderOpts)
    const config = loader.config
    const assetRegistries = config.asset_registries || {}

    const result = await processRegistryTarget({
      target,
      abs,
      assetRegistries,
      datasetRoot,
      fsService,
      pushLog,
      ...(options && { options }),
    })

    pushLog('info', 'All asset registries processed')
    return result
  } catch (err) {
    pushLog('error', `Failed to install from knowledge-hub: ${String(err)}`)
    return { success: false, target: abs, message: `install-failed: ${String(err)}` }
  }
}

/**
 * Process registry target and return appropriate result
 */
async function processRegistryTarget(context: {
  target: string
  abs: string
  assetRegistries: Record<string, AssetRegistryConfig>
  datasetRoot: string
  fsService: FileSystemService
  options?: InstallOptions
  pushLog: (level: LogEntry['level'], message: string) => void
}): Promise<{ success: boolean; target: string; message?: string }> {
  const { target, abs, assetRegistries, datasetRoot, fsService, options, pushLog } = context

  if (target === '.' || target === './') {
    pushLog('info', 'Installing all registries to their default target paths')

    const result = await installWithDefaults(fsService, options)
    return result.message
      ? { success: result.success, target: abs, message: result.message }
      : { success: result.success, target: abs }
  }

  const matchingRegistry = Object.entries(assetRegistries).find(([name, reg]) => {
    const registry = reg as AssetRegistryConfig
    return name === target || registry.target_path === target
  }) as [string, AssetRegistryConfig] | undefined

  if (matchingRegistry) {
    const [registryName, registryConfig] = matchingRegistry
    await installRegistryWithCustomTarget([registryName, registryConfig], target, datasetRoot, {
      fsService,
      options,
      pushLog,
    })
    return { success: true, target: abs }
  } else {
    pushLog('info', `Target '${target}' doesn't match any registry, using default targets`)
    const result = await installWithDefaults(fsService, options)
    return result.message
      ? { success: result.success, target: abs, message: result.message }
      : { success: result.success, target: abs }
  }
}

/**
 * Execute installation based on detected source type
 */
async function executeSourceInstallation(
  sourceType: string,
  context: {
    source: string
    target: string
    abs: string
    datasetRoot: string
    fsService: FileSystemService
    pushLog: (level: LogEntry['level'], message: string) => void
  },
): Promise<void> {
  const { source, target, abs, datasetRoot, fsService, pushLog } = context

  if (sourceType === SourceType.REMOTE_URL) {
    const version = 'custom'
    await installKB(version, abs, source, { fs: fsService })
    pushLog('info', 'Remote URL installation finished')
  } else if (sourceType === SourceType.LOCAL_ZIP) {
    const version = 'local-zip'
    await installKBFromLocalZip(version, source, { fs: fsService })
    pushLog('info', 'Local ZIP installation finished')
  } else if (sourceType === SourceType.LOCAL_DIRECTORY) {
    const version = 'local-dir'
    await installKBFromLocalDirectory(version, source, { fs: fsService })
    pushLog('info', 'Local directory installation finished')
  } else {
    // Fallback to copy (for other sources)
    await doCopyAndUpdateLinks(fsService, {
      source: source,
      target: target,
      datasetRoot: datasetRoot,
      options: {
        defaultBehavior: 'mirror',
      },
    })
    pushLog('info', 'copyPathAndUpdateLinks finished')
  }
}

/**
 * Handle installation from source
 */
async function handleSourceInstallation(context: {
  source: string
  target: string
  abs: string
  datasetRoot: string
  fsService: FileSystemService
  pushLog: (level: LogEntry['level'], message: string) => void
}): Promise<{
  success: boolean
  target: string
  message?: string
}> {
  const { source, pushLog, abs } = context

  try {
    pushLog('info', `Installing from source: ${source} to ${context.target}`)

    // Detect source type and execute installation
    const sourceType = detectSourceType(source)
    pushLog('info', `Detected source type: ${sourceType}`)
    await executeSourceInstallation(sourceType, context)

    return { success: true, target: abs }
  } catch (err) {
    pushLog('error', `Failed to install from source: ${String(err)}`)
    return { success: false, target: abs, message: `install-failed: ${String(err)}` }
  }
}

/**
 * Format the final result with optional logs
 */
function formatResult(
  result: {
    success: boolean
    target: string
    message?: string
    logs?: LogEntry[]
  },
  logs: LogEntry[],
): { success: boolean; target: string; message?: string; logs?: LogEntry[] } {
  return { ...result, logs }
}
