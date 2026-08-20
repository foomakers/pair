import type { InstallCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { dirname } from 'path'
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
  type CliPresenter,
  type RegistryResult,
} from '#ui'
import {
  declaredButUnknownResults,
  finalizeRegistryCopy,
  reportDeclaredButUnknown,
  reportNotShipped,
  reportSourceDeclaration,
} from '../registry-run'
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
  const { datasetRoot, registries, baseTarget, sourceDeclaration, resolution } =
    await setupInstallContext(fs, config, options)
  // A source that ships a broken config never aborts the install: it is reported — on the
  // console, not only in the diagnostics log nobody reads — and the consumer's own
  // resolution stands (US-396).
  reportSourceDeclaration({ declaration: sourceDeclaration, resolution, presenter })
  await emitVersionDriftHint({ fs, datasetRoot, baseTarget, presenter })
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

/**
 * `--list-targets` describes the install that `--list-targets` is asked about, so it must
 * resolve configuration the way that install does: from the project being installed into,
 * with the `config.json` fallback off. Resolving from the CLI module dir printed the
 * CLI-default targets while `install` wrote to the project-overridden ones — the one
 * command whose whole job is to say where content lands, disagreeing with the command that
 * lands it (US-396).
 *
 * A source KB declaration is deliberately NOT read here: `--list-targets` names no source
 * (the parser drops every other flag), and layer 2 may not state `targets` anyway.
 */
async function listTargets(
  fs: FileSystemService,
  options: InstallHandlerOptions | undefined,
): Promise<void> {
  const configOptions: LoadConfigOptions = {
    projectRoot: options?.baseTarget || fs.currentWorkingDirectory(),
    projectConfigOnly: true,
  }
  if (options?.config) configOptions.customConfigPath = options.config
  const configContent = loadConfigWithOverrides(fs, configOptions)
  const registries = extractRegistries(configContent.config)

  console.log(`\n  ${chalk.bold('Asset Registries')}\n`)
  for (const [name, reg] of Object.entries(registries)) printTarget(name, reg)
}

function printTarget(name: string, reg: RegistryConfig): void {
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

type InstallableConfig = Exclude<InstallCommandConfig, { resolution: 'list-targets' }>

/**
 * A named source (`--source`, `--url`, `--git`) declares its own registries; the default
 * source does not — reading a declaration there would change the official path's
 * behaviour for no gain (US-396).
 */
function namesItsOwnSource(config: InstallableConfig): boolean {
  return config.resolution !== 'default'
}

/**
 * `projectRoot` is the directory being installed INTO — never the CLI's own module dir,
 * which is what the loader would default to. In the released (CJS) layout those are two
 * different places, and defaulting meant the consuming project's own `pair.config.json`
 * was never read: AC4 held in tests only (US-396).
 */
function resolveConfigOptions(
  config: InstallableConfig,
  datasetRoot: string,
  projectRoot: string,
  options?: InstallHandlerOptions,
): LoadConfigOptions {
  return {
    projectRoot,
    projectConfigOnly: true,
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
  resolution: string
}> {
  const datasetRoot = await resolveDatasetRoot(fs, config, {
    cliVersion: options?.cliVersion,
    httpClient: options?.httpClient,
    // `--no-kb` has to reach THIS reader too: the pre-flight honouring it only skips the warm
    // fetch, and the command would otherwise download the KB the user just refused.
    kb: (config as { kb?: boolean }).kb,
  })
  const baseTarget = options?.baseTarget || config.target || fs.currentWorkingDirectory()
  const configContent = loadConfigWithOverrides(
    fs,
    resolveConfigOptions(config, datasetRoot, baseTarget, options),
  )

  const registries = extractRegistries(configContent.config)
  const workingPathOverride = resolveWorkingPathOverride(configContent.config)
  const validation = validateAllRegistries(registries, workingPathOverride)
  if (!validation.valid) {
    throw new Error(validation.errors.join('; ') || 'Invalid registry configuration')
  }

  return {
    datasetRoot,
    registries,
    baseTarget,
    resolution: configContent.source,
    ...(configContent.sourceDeclaration && {
      sourceDeclaration: configContent.sourceDeclaration,
    }),
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
  skillLinkPathMap?: SkillLinkPathMap | undefined
  result: RegistryResult
}> {
  const { fs, registryName, registryConfig, presenter, index, total } = ctx
  const {
    source: datasetPath,
    target: effectiveTarget,
    effectiveDatasetRoot,
  } = resolveRegistryIO(ctx)

  presenter.registryStart({
    name: registryName,
    index,
    total,
    source: datasetPath,
    target: effectiveTarget,
  })
  // Decided BEFORE anything is created: a source that ships nothing must leave no trace
  // in the consumer's project, not even the empty parent directories `ensureDir` makes.
  if (!(await fs.exists(datasetPath))) {
    return { result: reportNotShipped(ctx, { effectiveTarget, datasetPath }) }
  }

  await ensureDir(fs, dirname(effectiveTarget))
  const copyResult = await doCopyAndUpdateLinks(fs, {
    source: datasetPath,
    target: effectiveTarget,
    datasetRoot: effectiveDatasetRoot,
    options: buildCopyOptions(registryConfig),
  })

  if (copyResult['skipped']) {
    return { result: reportNotShipped(ctx, { effectiveTarget, datasetPath }) }
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
  const allResults = [
    ...results,
    ...reportDeclaredButUnknown(declaredButUnknownResults(context.sourceDeclaration), presenter),
  ]
  const tally = tallyRegistries(allResults)

  await reconcileSkillNameRegistry(
    { fs, baseTarget, pushLog },
    registries,
    skillNameMap,
    skillLinkPathMap,
  )

  if (options?.linkStyle) {
    await applyLinkTransformation(fs, { linkStyle: options.linkStyle }, pushLog, 'install')
  }

  // Both gated on something having been installed: a run that installed NOTHING must not
  // write a project index for content that is not there, nor claim the source's version.
  if (tally.ok > 0) {
    await writeProjectLlmsTxt(fs, baseTarget, pushLog)
    // A partial install is not an installed KB either: recording the version anyway would
    // silence the drift hint while a registry is missing, and the re-run aborts on
    // 'already exists'.
    if (tally.failed === 0) await recordInstalledVersion({ fs, datasetRoot, baseTarget })
  }

  presenter.summary(allResults, 'install', Date.now() - startTime)
  return exitCodeFor(tally)
}
