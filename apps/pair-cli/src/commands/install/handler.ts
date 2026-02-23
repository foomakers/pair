import type { InstallCommandConfig } from './parser'
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
  detectOverlappingTargets,
  checkTargetsEmptiness,
  doCopyAndUpdateLinks,
  buildCopyOptions,
  postCopyOps,
  applySkillRefsToNonSkillRegistries,
  resolveEffectiveDatasetRoot,
  writeProjectLlmsTxt,
  type RegistryConfig,
} from '#registry'
import { applyLinkTransformation } from '../update-link/logic'
import type { HttpClientService } from '@pair/content-ops'
import { type SkillNameMap } from '@pair/content-ops'
import { createCliPresenter, type CliPresenter, type RegistryResult } from '#ui'

/**
 * Install options for handler
 */
interface InstallHandlerOptions {
  baseTarget?: string
  linkStyle?: 'relative' | 'absolute' | 'auto'
  config?: string
  minLogLevel?: LogEntry['level']
  httpClient?: HttpClientService
  cliVersion?: string
  presenter?: CliPresenter
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
  const logLevel =
    (config as unknown as { logLevel?: LogEntry['level'] }).logLevel ??
    options?.minLogLevel ??
    'info'
  const { pushLog } = createLogger(logLevel as LogEntry['level'])
  const presenter = options?.presenter ?? createCliPresenter(pushLog)

  try {
    const { datasetRoot, registries, baseTarget } = await setupInstallContext(fs, config, options)
    await validateInstallContext(fs, registries, baseTarget)
    await executeInstall({ fs, datasetRoot, registries, baseTarget, options, pushLog, presenter })
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

async function installRegistry(ctx: {
  fs: FileSystemService
  registryName: string
  registryConfig: RegistryConfig
  datasetRoot: string
  baseTarget: string
  pushLog: (level: LogEntry['level'], message: string) => void
  presenter: CliPresenter
  index: number
  total: number
}): Promise<{ skillNameMap?: SkillNameMap | undefined; result: RegistryResult }> {
  const { fs, registryName, registryConfig, datasetRoot, baseTarget, presenter, index, total } = ctx
  const resolved = resolveRegistryPaths({
    name: registryName,
    config: registryConfig,
    datasetRoot,
    fs,
    baseTarget,
  })
  const datasetPath = resolved.source
  const effectiveTarget = resolved.target
  await ensureDir(fs, dirname(effectiveTarget))
  const copyOptions = buildCopyOptions(registryConfig)

  const effectiveDatasetRoot = resolveEffectiveDatasetRoot(registryConfig, baseTarget, datasetRoot)

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
    options: copyOptions,
  })

  await postCopyOps({ fs, registryConfig, effectiveTarget, datasetPath, baseTarget })
  presenter.registryDone(registryName)
  return {
    skillNameMap: copyResult['skillNameMap'] as SkillNameMap | undefined,
    result: { name: registryName, target: effectiveTarget, ok: true },
  }
}

type InstallContext = {
  fs: FileSystemService
  datasetRoot: string
  registries: Record<string, RegistryConfig>
  baseTarget: string
  options: InstallHandlerOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
  presenter: CliPresenter
}

async function installAllRegistries(ctx: InstallContext): Promise<{
  results: RegistryResult[]
  skillNameMap: SkillNameMap
}> {
  const { fs, datasetRoot, registries, baseTarget, pushLog, presenter } = ctx
  const accumulated: SkillNameMap = new Map()
  const total = Object.keys(registries).length

  const results = await forEachRegistry(registries, async (registryName, registryConfig, index) => {
    const out = await installRegistry({
      fs,
      registryName,
      registryConfig,
      datasetRoot,
      baseTarget,
      pushLog,
      presenter,
      index,
      total,
    })
    if (out.skillNameMap) {
      for (const [k, v] of out.skillNameMap) accumulated.set(k, v)
    }
    return out.result
  })
  return { results, skillNameMap: accumulated }
}

async function executeInstall(context: InstallContext): Promise<void> {
  const { fs, registries, baseTarget, options, pushLog, presenter } = context
  const total = Object.keys(registries).length
  const startTime = Date.now()

  presenter.startOperation('install', total)

  const { results, skillNameMap } = await installAllRegistries(context)

  if (skillNameMap.size > 0) {
    await applySkillRefsToNonSkillRegistries({ fs, baseTarget, pushLog }, registries, skillNameMap)
  }
  if (options?.linkStyle) {
    await applyLinkTransformation(fs, { linkStyle: options.linkStyle }, pushLog, 'install')
  }

  await writeProjectLlmsTxt(fs, baseTarget, pushLog)

  presenter.summary(results, 'install', Date.now() - startTime)
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

  const overlapping = detectOverlappingTargets(targets)
  if (overlapping.length > 0) {
    return {
      valid: false,
      error: `Overlapping registry targets detected: ${overlapping.join('; ')}`,
    }
  }

  const emptyCheck = await checkTargetsEmptiness(targets, fs)
  if (!emptyCheck.valid && emptyCheck.errors.length > 0) {
    const errorMsg = emptyCheck.errors.map(e => `${e.registry}: ${e.error}`).join('; ')
    return { valid: false, error: errorMsg }
  }

  return { valid: true }
}
