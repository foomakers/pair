import type { InstallCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { dirname, join } from 'path'
import chalk from 'chalk'
import { loadConfigWithOverrides, resolveDatasetRoot, ensureDir } from '#config'
import { createLogger, type LogEntry } from '#diagnostics'
import {
  extractRegistries,
  validateAllRegistries,
  resolveTarget,
  resolveRegistryPaths,
  forEachRegistry,
  detectOverlappingTargets,
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
    if (config.resolution === 'list-targets') {
      return listTargets(fs, options)
    }
    const { datasetRoot, registries, baseTarget } = await setupInstallContext(
      fs,
      config as InstallableConfig,
      options,
    )
    validateDatasetContent(fs, datasetRoot, registries)
    await validateInstallContext(fs, registries, baseTarget)
    await executeInstall({ fs, datasetRoot, registries, baseTarget, options, pushLog, presenter })
  } catch (err) {
    pushLog('error', `Installation failed: ${String(err)}`)
    throw err
  }
}

async function listTargets(
  fs: FileSystemService,
  options: InstallHandlerOptions | undefined,
): Promise<void> {
  const configOptions: { customConfigPath?: string; projectRoot?: string } = {}
  if (options?.config) configOptions.customConfigPath = options.config
  const configContent = loadConfigWithOverrides(fs, configOptions)
  const registries = extractRegistries(configContent.config)

  console.log(`\n  ${chalk.bold('Asset Registries')}\n`)
  for (const [name, reg] of Object.entries(registries)) {
    const target = reg.targets?.[0]
    const targetPath = target ? (target as { path: string }).path : '(none)'
    const behavior = (reg as { behavior?: string }).behavior ?? 'unknown'
    const description = (reg as { description?: string }).description ?? ''
    console.log(`  ${chalk.cyan(name)}`)
    console.log(`    target:   ${targetPath}`)
    console.log(`    behavior: ${behavior}`)
    if (description) console.log(`    ${chalk.dim(description)}`)
    console.log()
  }
}

type InstallableConfig = Exclude<InstallCommandConfig, { resolution: 'list-targets' }>

async function setupInstallContext(
  fs: FileSystemService,
  config: InstallableConfig,
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

function validateDatasetContent(
  fs: FileSystemService,
  datasetRoot: string,
  registries: Record<string, RegistryConfig>,
): void {
  // Match resolveRegistryPaths logic: check direct name path first, then config.source
  const hasContent = Object.entries(registries).some(
    ([name, reg]) =>
      fs.existsSync(join(datasetRoot, name)) || fs.existsSync(join(datasetRoot, reg.source)),
  )
  if (!hasContent) {
    const sources = Object.values(registries)
      .map(r => r.source)
      .join(', ')
    throw new Error(`Dataset root has no content for configured registries (expected: ${sources})`)
  }
}

async function validateInstallContext(
  fs: FileSystemService,
  registries: Record<string, RegistryConfig>,
  baseTarget: string,
): Promise<void> {
  const targets: Record<string, string> = {}
  for (const [name, config] of Object.entries(registries)) {
    const target = resolveTarget(name, config, fs, baseTarget)
    targets[name] = target
    if (fs.existsSync(target)) {
      throw new Error(
        `Target '${target}' already exists. Project already installed. Use 'pair update' to update.`,
      )
    }
  }
  const overlapping = detectOverlappingTargets(targets)
  if (overlapping.length > 0) {
    throw new Error(`Overlapping registry targets detected: ${overlapping.join('; ')}`)
  }
}

type RegistryInstallCtx = {
  fs: FileSystemService
  registryName: string
  registryConfig: RegistryConfig
  datasetRoot: string
  baseTarget: string
  pushLog: (level: LogEntry['level'], message: string) => void
  presenter: CliPresenter
  index: number
  total: number
}

function resolveRegistryIO(ctx: RegistryInstallCtx) {
  const { registryName, registryConfig, datasetRoot, fs, baseTarget } = ctx
  const resolved = resolveRegistryPaths({
    name: registryName,
    config: registryConfig,
    datasetRoot,
    fs,
    baseTarget,
  })
  const effectiveDatasetRoot = resolveEffectiveDatasetRoot(registryConfig, baseTarget, datasetRoot)
  return { source: resolved.source, target: resolved.target, effectiveDatasetRoot }
}

async function installRegistry(ctx: RegistryInstallCtx): Promise<{
  skillNameMap?: SkillNameMap | undefined
  result: RegistryResult
}> {
  const { fs, registryName, registryConfig, baseTarget, pushLog, presenter, index, total } = ctx
  const {
    source: datasetPath,
    target: effectiveTarget,
    effectiveDatasetRoot,
  } = resolveRegistryIO(ctx)
  await ensureDir(fs, dirname(effectiveTarget))

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

  if (copyResult['skipped']) {
    pushLog('warn', `Registry '${registryName}' skipped: source not found at ${datasetPath}`)
    return { result: { name: registryName, target: effectiveTarget, ok: false } }
  }

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
