import { resolve, relative, dirname } from 'path'
import { FileSystemService } from '@pair/content-ops'
import { Behavior } from '@pair/content-ops'
import {
  parseTargetAndSource,
  createLogger,
  ensureDir,
  CommandOptions,
  LogEntry,
} from './command-utils'
import * as commandUtils from './command-utils'
import {
  getKnowledgeHubDatasetPath as getKnowledgeHubDatasetPath,
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

export type InstallOptions = CommandOptions

// Context object to reduce function parameters
interface InstallContext {
  fsService: FileSystemService
  datasetRoot: string
  options?: InstallOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}

// Context for registry target processing
interface RegistryTargetContext {
  target: string
  abs: string
  assetRegistries: Record<string, AssetRegistryConfig>
  datasetRoot: string
  fsService: FileSystemService
  options?: InstallOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}

// Context for installation execution
interface InstallationContext {
  source?: string | undefined
  target?: string | undefined
  abs: string
  datasetRoot: string
  fsService: FileSystemService
  options?: InstallOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}

/**
 * Install a single registry to its target location
 */
async function installSingleRegistry(
  registryName: string,
  registryConfig: AssetRegistryConfig,
  context: InstallContext,
): Promise<void> {
  const { fsService, datasetRoot, options, pushLog } = context

  pushLog(
    'info',
    `Installing registry ${registryName} to ${registryConfig.target_path} with behavior: ${registryConfig.behavior}`,
  )

  const targetPath = registryConfig.target_path || registryName
  const absTarget = options?.baseTarget
    ? resolve(options.baseTarget, targetPath)
    : resolve(targetPath)

  await ensureDir(fsService, absTarget)
  const check = await ensureTargetIsEmpty(fsService, absTarget)
  if (!check.ok) {
    pushLog('error', check.message!)
    return Promise.resolve().then(() => {
      return Promise.reject(new Error(check.message))
    })
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
  const fullSourcePath = resolve(datasetRoot, registryConfig.source || '.')
  const monorepoRoot = dirname(dirname(process.cwd()))
  const relativeSourcePath = relative(monorepoRoot, fullSourcePath)
  const fullTargetPath = resolve(process.cwd(), absTarget)
  const relativeTargetPath = relative(monorepoRoot, fullTargetPath)

  const optionsToPass = copyOptions || {
    defaultBehavior: registryConfig.behavior as Behavior,
    folderBehavior:
      registryConfig.include && registryConfig.include.length > 0
        ? Object.fromEntries(
            (registryConfig.include || []).map(path => [path, registryConfig.behavior as Behavior]),
          )
        : undefined,
  }

  await commandUtils.doCopyAndUpdateLinks(fsService, {
    source: relativeSourcePath,
    target: relativeTargetPath,
    datasetRoot: monorepoRoot,
    options: optionsToPass,
  })

  pushLog('info', `Successfully installed ${String(registryConfig.target_path || '')}`)
}

/**
 * Install using default targets from config
 */
async function installWithDefaults(
  fsService: FileSystemService,
  options?: InstallOptions,
): Promise<{ success: boolean; message?: string; target?: string; logs?: LogEntry[] }> {
  const { logs, pushLog } = createLogger(options?.minLogLevel as LogEntry['level'] | undefined)

  pushLog('info', 'Starting installWithDefaults')

  try {
    const { assetRegistries, datasetRoot } = loadConfigAndAssetRegistries(fsService, options)

    // Validate all targets before performing any copies to avoid partial installs
    const entries = Object.entries(assetRegistries) as Array<[string, AssetRegistryConfig]>
    const precheck = await ensureAllTargetsAreEmptyForEntries(fsService, entries, options)
    if (!precheck.ok) {
      const msg = precheck.message || 'destination exists'
      pushLog('error', msg)
      return { success: false, message: msg }
    }

    // Install each registry to its default target
    for (const [registryName, registryConfig] of entries) {
      const context: InstallContext = {
        fsService,
        datasetRoot,
        options,
        pushLog,
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
  const datasetRoot = getKnowledgeHubDatasetPath()
  return { assetRegistries, datasetRoot }
}

async function ensureTargetIsEmpty(
  fsService: FileSystemService,
  absTarget: string,
): Promise<{ ok: boolean; message?: string }> {
  const exists = await fsService.exists(absTarget)
  if (!exists) return { ok: true }
  const entries = await fsService.readdir(absTarget).catch(() => [])
  if (entries && entries.length > 0)
    return { ok: false, message: `Destination already exists: ${absTarget}` }
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

// No additional registry validation is required in the simplified CLI flow.

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

// Context object for registry installation
interface RegistryInstallContext {
  registryName: string
  registryConfig: AssetRegistryConfig
  customTarget: string
  datasetRoot: string
  fsService: FileSystemService
  options: InstallOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}

// Context object for source installation
interface SourceInstallContext {
  source?: string
  target?: string
  abs: string
  datasetRoot: string
  fsService: FileSystemService
  options: InstallOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}

// Context object for registry installation handling
interface RegistryHandlerContext {
  target?: string
  abs: string
  datasetRoot: string
  fsService: FileSystemService
  options: InstallOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}

// Context object for multiple registries installation
interface MultiRegistryContext {
  registries: Array<[string, AssetRegistryConfig]>
  target: string
  datasetRoot: string
  fsService: FileSystemService
  options?: InstallOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}

/**
 * Install a single registry with custom target
 */
export async function installRegistryWithCustomTarget(
  context: RegistryInstallContext,
): Promise<void> {
  const { registryName, registryConfig, customTarget, datasetRoot, fsService, options, pushLog } =
    context
  const behavior = registryConfig.behavior || 'mirror'

  pushLog(
    'info',
    `Installing registry ${registryName} to ${customTarget} with behavior: ${behavior}`,
  )

  const absTarget = options?.baseTarget
    ? resolve(options.baseTarget, customTarget)
    : resolve(customTarget)
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
 * dry-run behavior removed from CLI
 */

async function handleSourceInstallation(context: SourceInstallContext): Promise<{
  success: boolean
  target: string
  message?: string
  logs?: LogEntry[]
}> {
  const { source, target, abs, datasetRoot, fsService, pushLog } = context

  try {
    pushLog('info', `Installing from source: ${source} to ${target}`)

    // proceed with copy/update

    await commandUtils.doCopyAndUpdateLinks(fsService, {
      source: source!,
      target: target!,
      datasetRoot: datasetRoot,
      options: {
        defaultBehavior: 'mirror',
      },
    })
    pushLog('info', 'copyPathAndUpdateLinks finished')
    return { success: true, target: abs }
  } catch (err) {
    pushLog('error', `Failed to install from source: ${String(err)}`)
    return { success: false, target: abs, message: `install-failed: ${String(err)}` }
  }
}

/**
 * Determine the actual target path for a registry
 */
function determineTargetPath(target: string, registryName: string, targetPath: string): string {
  if (target === '.' || target === './') {
    return targetPath.startsWith('/') ? targetPath.slice(1) : targetPath
  }
  if (target === registryName || target === targetPath) {
    return targetPath.startsWith('/') ? targetPath.slice(1) : targetPath
  }
  return target
}

/**
 * Install multiple registries
 */
async function installRegistries(context: MultiRegistryContext): Promise<void> {
  const { registries, target, datasetRoot, fsService, pushLog, options } = context
  // Pre-validate all targets for the registries to avoid partial copies
  const precheck = await ensureAllTargetsAreEmptyForEntries(fsService, registries, options)
  if (!precheck.ok) {
    pushLog('error', precheck.message!)
    throw new Error(precheck.message)
  }

  for (const entry of registries) {
    await processRegistryEntry({ entry, target, datasetRoot, fsService, options, pushLog })
  }
}

/**
 * Ensure all target directories for the provided registry entries exist and are empty.
 * Returns { ok: boolean, message?: string }
 */
export async function ensureAllTargetsAreEmptyForEntries(
  fsService: FileSystemService,
  entries: Array<[string, AssetRegistryConfig]>,
  options?: InstallOptions,
): Promise<{ ok: boolean; message?: string }> {
  // Resolve all absolute targets first so we can detect overlaps (ancestor/descendant)
  const resolved: Array<{ registryName: string; absTarget: string }> = entries.map(
    ([registryName, registryConfig]) => {
      const targetPath = registryConfig.target_path || registryName
      const absTarget = options?.baseTarget
        ? resolve(options.baseTarget, targetPath)
        : resolve(targetPath)
      return { registryName, absTarget }
    },
  )

  // Precheck overlaps and baseTarget existence using a small helper to keep
  // this function's complexity under the lint threshold.
  const precheck = await precheckOverlapsAndBaseTarget(fsService, options, resolved)
  if (precheck) return precheck

  // No overlaps detected; ensure existing targets are empty
  for (const { absTarget } of resolved) {
    const exists = await fsService.exists(absTarget)
    if (!exists) continue
    const check = await ensureTargetIsEmpty(fsService, absTarget)
    if (!check.ok) return { ok: false, message: check.message || 'destination exists' }
  }

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

interface ProcessRegistryEntryContext {
  entry: [string, AssetRegistryConfig]
  target: string
  datasetRoot: string
  fsService: FileSystemService
  options?: InstallOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}

async function processRegistryEntry(context: ProcessRegistryEntryContext) {
  const { entry, target, datasetRoot, fsService, options, pushLog } = context
  const [registryName, registryConfig] = entry
  const reg = registryConfig
  const behavior = reg.behavior || 'mirror'
  const targetPath = reg.target_path || registryName

  pushLog('info', `Installing asset registry: ${registryName} with behavior: ${behavior}`)

  const actualTargetPath = determineTargetPath(target, registryName, targetPath)
  const destPath = actualTargetPath
  const copyOptions = buildCopyOptions(reg)

  try {
    // determine absolute target path
    const absTarget = options?.baseTarget
      ? resolve(options.baseTarget, destPath)
      : resolve(destPath)
    await copyRegistryFiles({
      fsService,
      datasetRoot,
      registryConfig: reg,
      absTarget,
      pushLog,
      copyOptions,
    })
    pushLog('info', `Successfully installed ${registryName} to ${destPath}`)
  } catch (err) {
    pushLog('error', `Failed to install ${registryName}: ${String(err)}`)
  }
}

/**
 * Find matching registry based on target
 */
function findMatchingRegistry(
  target: string,
  assetRegistries: Record<string, AssetRegistryConfig>,
): [string, AssetRegistryConfig] | null {
  return Object.entries(assetRegistries).find(([name, reg]) => {
    const registry = reg as AssetRegistryConfig
    return name === target || registry.target_path === target
  }) as [string, AssetRegistryConfig] | null
}

/**
 * Validate dataset root
 */
function validateDatasetRoot(
  datasetRoot: string,
  abs: string,
): { success: boolean; target: string; message?: string } | null {
  if (!datasetRoot) {
    return {
      success: false,
      target: abs,
      message: 'datasetRoot not provided and no source specified',
    }
  }
  return null
}

/**
 * Process registry target and return appropriate result
 */
async function processRegistryTarget(
  context: RegistryTargetContext,
): Promise<{ success: boolean; target: string; message?: string }> {
  const { target, abs, assetRegistries, datasetRoot, fsService, options, pushLog } = context

  if (target === '.' || target === './') {
    pushLog('info', 'Installing all registries to their default target paths')
    const result = await installWithDefaults(fsService, options)
    return result.message
      ? { success: result.success, target: abs, message: result.message }
      : { success: result.success, target: abs }
  }

  const matchingRegistry = findMatchingRegistry(target, assetRegistries)

  if (matchingRegistry) {
    const multiContext: MultiRegistryContext = {
      registries: [matchingRegistry],
      target,
      datasetRoot,
      fsService,
      options,
      pushLog,
    }
    await installRegistries(multiContext)
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
 * Handle installation from knowledge-hub dataset using asset registries
 */
async function handleRegistryInstallation(context: RegistryHandlerContext): Promise<{
  success: boolean
  target: string
  message?: string
  logs?: LogEntry[]
}> {
  const { target, abs, datasetRoot, fsService, options, pushLog } = context

  try {
    const validation = validateDatasetRoot(datasetRoot, abs)
    if (validation) return validation

    pushLog('info', `Installing from knowledge-hub dataset: ${datasetRoot} to ${target}`)

    const loaderOpts: { customConfigPath?: string } = {}
    if (options?.customConfigPath) loaderOpts.customConfigPath = options.customConfigPath
    const loader = loadConfigWithOverrides(fsService, loaderOpts)
    const config = loader.config
    const assetRegistries = config.asset_registries || {}

    const result = await processRegistryTarget({
      target: target!,
      abs,
      assetRegistries,
      datasetRoot,
      fsService,
      options,
      pushLog,
    })

    pushLog('info', 'All asset registries processed')
    return result
  } catch (err) {
    pushLog('error', `Failed to install from knowledge-hub: ${String(err)}`)
    return { success: false, target: abs, message: `install-failed: ${String(err)}` }
  }
}

// The CLI does not accept programmatic registry overrides; it uses the configured
// asset registries and an optional custom config file when provided.

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

  const abs = resolve(target)

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
async function executeInstallation(context: InstallationContext): Promise<{
  success: boolean
  target: string
  message?: string
  logs?: LogEntry[]
}> {
  const { source, target, abs, datasetRoot, fsService, options, pushLog } = context

  if (source) {
    const sourceContext: SourceInstallContext = {
      source,
      target: target!,
      abs,
      datasetRoot,
      fsService,
      options,
      pushLog,
    }
    return await handleSourceInstallation(sourceContext)
  } else {
    const registryContext: RegistryHandlerContext = {
      target: target!,
      abs,
      datasetRoot,
      fsService,
      options,
      pushLog,
    }
    return await handleRegistryInstallation(registryContext)
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

  // If baseTarget is provided in options (e.g., resolved against INIT_CWD), use it
  const resolvedTarget = options?.baseTarget || target

  // Validate and prepare target
  const targetValidation = await validateAndPrepareTarget(
    resolvedTarget || undefined,
    fsService,
    () => {},
  )
  if (!targetValidation.success) {
    return targetValidation
  }

  const abs = targetValidation.abs!
  const datasetRoot = getKnowledgeHubDatasetPath()
  // Ensure downstream install flows know the resolved base target so all
  // registry target checks happen relative to this folder before any copies
  // are executed. Don't mutate the original options object; create a shallow
  // copy and set baseTarget to the resolved absolute path.
  const execOptions: InstallOptions = { ...(options || {}), baseTarget: abs }

  return await performInstallation({
    source: source || undefined,
    target: resolvedTarget || undefined,
    abs,
    datasetRoot,
    fsService,
    options: execOptions,
  })
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
  try {
    const { logs, pushLog } = createLogger(options?.minLogLevel as LogEntry['level'] | undefined)
    pushLog('info', 'Starting installCommand')

    // Execute installation
    const result = await executeInstallation({
      source,
      target,
      abs,
      datasetRoot,
      fsService,
      options,
      pushLog,
    })

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
  } catch (err) {
    return { success: false, message: (err as Error)?.message ?? String(err), target: context.abs }
  }
}
