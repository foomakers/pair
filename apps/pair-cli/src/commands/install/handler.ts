import type { InstallCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { dirname, join } from 'path'
import chalk from 'chalk'
import {
  loadConfigWithOverrides,
  resolveDatasetRoot,
  ensureDir,
  type LoadConfigOptions,
  type SourceDeclarationOutcome,
} from '#config'
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
  reconcileSkillNameRegistry,
  resolveEffectiveDatasetRoot,
  writeProjectLlmsTxt,
  resolveWorkingPathOverride,
  type RegistryConfig,
} from '#registry'
import { applyLinkTransformation } from '../update-link/logic'
import type { HttpClientService } from '@pair/content-ops'
import { type SkillNameMap, type SkillLinkPathMap } from '@pair/content-ops'
import {
  createCliPresenter,
  exitCodeFor,
  tallyRegistries,
  SKIP_NOT_SHIPPED,
  SKIP_UNKNOWN_REGISTRY,
  type CliPresenter,
  type RegistryResult,
} from '#ui'
import { emitVersionDriftHint, recordInstalledVersion } from '../kb-info/version-hint'

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
 *
 * Returns the process exit code, so what the summary says and what automation reads can
 * never disagree (US-396 AC5): non-zero only when a registry the source actually ships
 * failed, or when the run installed nothing at all.
 */
export async function handleInstallCommand(
  config: InstallCommandConfig,
  fs: FileSystemService,
  options?: InstallHandlerOptions,
): Promise<number> {
  const logLevel =
    (config as unknown as { logLevel?: LogEntry['level'] }).logLevel ??
    options?.minLogLevel ??
    'info'
  const { pushLog } = createLogger(logLevel as LogEntry['level'])
  const presenter = options?.presenter ?? createCliPresenter(pushLog)

  try {
    if (config.resolution === 'list-targets') {
      await listTargets(fs, options)
      return 0
    }
    return await runInstall({
      fs,
      config: config as InstallableConfig,
      options,
      pushLog,
      presenter,
    })
  } catch (err) {
    pushLog('error', `Installation failed: ${String(err)}`)
    throw err
  }
}

async function runInstall(ctx: {
  fs: FileSystemService
  config: InstallableConfig
  options: InstallHandlerOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
  presenter: CliPresenter
}): Promise<number> {
  const { fs, config, options, pushLog, presenter } = ctx
  const { datasetRoot, registries, baseTarget, sourceDeclaration } = await setupInstallContext(
    fs,
    config,
    options,
  )
  // A source that ships a broken config never aborts the install: it is reported and the
  // consumer's own resolution stands (US-396).
  if (sourceDeclaration?.warning) pushLog('warn', sourceDeclaration.warning)
  await emitVersionDriftHint({ fs, datasetRoot, baseTarget, presenter })
  validateDatasetContent(fs, datasetRoot, registries)
  await validateInstallContext(fs, registries, baseTarget)
  return executeInstall({
    fs,
    datasetRoot,
    registries,
    baseTarget,
    options,
    pushLog,
    presenter,
    ...(sourceDeclaration && { sourceDeclaration }),
  })
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

/**
 * A named source (`--source`, `--url`, `--git`) declares its own registries; the default
 * source does not — reading a declaration there would change the official path's
 * behaviour for no gain (US-396).
 */
function namesItsOwnSource(config: InstallableConfig): boolean {
  return config.resolution !== 'default'
}

function resolveConfigOptions(
  config: InstallableConfig,
  datasetRoot: string,
  options?: InstallHandlerOptions,
): LoadConfigOptions {
  return {
    ...(options?.config && { customConfigPath: options.config }),
    ...(namesItsOwnSource(config) && { sourceRoot: datasetRoot }),
  }
}

async function setupInstallContext(
  fs: FileSystemService,
  config: InstallableConfig,
  options?: InstallHandlerOptions,
): Promise<{
  datasetRoot: string
  registries: Record<string, RegistryConfig>
  baseTarget: string
  sourceDeclaration?: SourceDeclarationOutcome | undefined
}> {
  const datasetRoot = await resolveDatasetRoot(fs, config, {
    cliVersion: options?.cliVersion,
    httpClient: options?.httpClient,
    // `--no-kb` has to reach THIS reader too: the pre-flight honouring it only skips the warm
    // fetch, and the command would otherwise download the KB the user just refused.
    kb: (config as { kb?: boolean }).kb,
  })
  const configContent = loadConfigWithOverrides(
    fs,
    resolveConfigOptions(config, datasetRoot, options),
  )

  const registries = extractRegistries(configContent.config)
  const workingPathOverride = resolveWorkingPathOverride(configContent.config)
  const validation = validateAllRegistries(registries, workingPathOverride)
  if (!validation.valid) {
    throw new Error(validation.errors.join('; ') || 'Invalid registry configuration')
  }

  const baseTarget = options?.baseTarget || config.target || fs.currentWorkingDirectory()
  return {
    datasetRoot,
    registries,
    baseTarget,
    ...(configContent.sourceDeclaration && {
      sourceDeclaration: configContent.sourceDeclaration,
    }),
  }
}

/**
 * Registries the source declared that this CLI has no definition for: named as skipped
 * with their own reason, never silently dropped (US-396 edge case: newer KB, older CLI).
 */
function declaredButUnknownResults(
  declaration: SourceDeclarationOutcome | undefined,
  baseTarget: string,
  presenter: CliPresenter,
): RegistryResult[] {
  if (!declaration) return []
  return declaration.unknownRegistries.map(name => {
    presenter.registrySkipped(name, SKIP_UNKNOWN_REGISTRY)
    return { name, target: baseTarget, status: 'skipped' as const, reason: SKIP_UNKNOWN_REGISTRY }
  })
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

async function finalizeRegistryCopy(
  ctx: RegistryInstallCtx,
  paths: { effectiveTarget: string; datasetPath: string },
): Promise<void> {
  const { fs, registryConfig, baseTarget } = ctx
  await postCopyOps({ fs, registryConfig, baseTarget, ...paths })
}

async function installRegistry(ctx: RegistryInstallCtx): Promise<{
  skillNameMap?: SkillNameMap | undefined
  skillLinkPathMap?: SkillLinkPathMap | undefined
  result: RegistryResult
}> {
  const { fs, registryName, registryConfig, pushLog, presenter, index, total } = ctx
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

  // Absent is not failed: the source simply does not contain this registry, and there is
  // nothing to copy. Only a registry that IS shipped and breaks is a failure (US-396 AC1/AC2).
  if (copyResult['skipped']) {
    pushLog('debug', `Registry '${registryName}' has no source at ${datasetPath}`)
    presenter.registrySkipped(registryName, SKIP_NOT_SHIPPED)
    return {
      result: {
        name: registryName,
        target: effectiveTarget,
        status: 'skipped',
        reason: SKIP_NOT_SHIPPED,
      },
    }
  }

  await finalizeRegistryCopy(ctx, { effectiveTarget, datasetPath })
  presenter.registryDone(registryName)
  return {
    skillNameMap: copyResult['skillNameMap'] as SkillNameMap | undefined,
    skillLinkPathMap: copyResult['skillLinkPathMap'] as SkillLinkPathMap | undefined,
    result: { name: registryName, target: effectiveTarget, status: 'ok' },
  }
}

/**
 * One broken registry must not abort the ones after it: it is reported as failed, the run
 * continues, and the exit code carries the failure out (US-396 AC2).
 */
async function installRegistryOrReportFailure(ctx: RegistryInstallCtx): Promise<{
  skillNameMap?: SkillNameMap | undefined
  skillLinkPathMap?: SkillLinkPathMap | undefined
  result: RegistryResult
}> {
  try {
    return await installRegistry(ctx)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ctx.presenter.registryError(ctx.registryName, message)
    const target = resolveTarget(ctx.registryName, ctx.registryConfig, ctx.fs, ctx.baseTarget)
    return { result: { name: ctx.registryName, target, status: 'failed', error: message } }
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
  sourceDeclaration?: SourceDeclarationOutcome | undefined
}

async function installAllRegistries(ctx: InstallContext): Promise<{
  results: RegistryResult[]
  skillNameMap: SkillNameMap
  skillLinkPathMap: SkillLinkPathMap
}> {
  const { fs, datasetRoot, registries, baseTarget, pushLog, presenter } = ctx
  const accumulated: SkillNameMap = new Map()
  const accumulatedLinkMap: SkillLinkPathMap = new Map()
  const total = Object.keys(registries).length

  const results = await forEachRegistry(registries, async (registryName, registryConfig, index) => {
    const out = await installRegistryOrReportFailure({
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
    if (out.skillLinkPathMap) {
      for (const [k, v] of out.skillLinkPathMap) accumulatedLinkMap.set(k, v)
    }
    return out.result
  })
  return { results, skillNameMap: accumulated, skillLinkPathMap: accumulatedLinkMap }
}

async function executeInstall(context: InstallContext): Promise<number> {
  const { fs, datasetRoot, registries, baseTarget, options, pushLog, presenter } = context
  const total = Object.keys(registries).length
  const startTime = Date.now()

  presenter.startOperation('install', total)

  const { results, skillNameMap, skillLinkPathMap } = await installAllRegistries(context)

  await reconcileSkillNameRegistry(
    { fs, baseTarget, pushLog },
    registries,
    skillNameMap,
    skillLinkPathMap,
  )

  if (options?.linkStyle) {
    await applyLinkTransformation(fs, { linkStyle: options.linkStyle }, pushLog, 'install')
  }

  await writeProjectLlmsTxt(fs, baseTarget, pushLog)
  await recordInstalledVersion({ fs, datasetRoot, baseTarget })

  const allResults = [
    ...results,
    ...declaredButUnknownResults(context.sourceDeclaration, baseTarget, presenter),
  ]
  presenter.summary(allResults, 'install', Date.now() - startTime)
  return exitCodeFor(tallyRegistries(allResults))
}
