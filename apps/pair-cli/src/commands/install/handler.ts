import type { InstallCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { dirname } from 'path'
import {
  loadConfigWithOverrides,
  getKnowledgeHubDatasetPath,
  getKnowledgeHubDatasetPathWithFallback,
  ensureDir,
} from '#config'

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
  distributeToSecondaryTargets,
  stripMarkersFromTarget,
  type RegistryConfig,
} from '#registry'
import { applyLinkTransformation } from '../update-link/logic'
import type { HttpClientService } from '@pair/content-ops'
import { type SkillNameMap, rewriteSkillReferences, walkMarkdownFiles } from '@pair/content-ops'
import { installKBFromLocalZip } from '#kb-manager/kb-installer'

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

  try {
    const { datasetRoot, registries, baseTarget } = await setupInstallContext(fs, config, options)
    await validateInstallContext(fs, registries, baseTarget)
    await executeInstall({ fs, datasetRoot, registries, baseTarget, options, pushLog })
    pushLog('info', 'Installation completed successfully')
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
  const datasetRoot = await resolveDatasetRoot(fs, config, options)
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

async function postCopyOps(ctx: {
  fs: FileSystemService
  registryConfig: RegistryConfig
  effectiveTarget: string
  datasetPath: string
  baseTarget: string
}): Promise<void> {
  const { fs, registryConfig, effectiveTarget, datasetPath, baseTarget } = ctx
  const canonicalTarget = registryConfig.targets.find(t => t.mode === 'canonical')
  if (await fs.exists(effectiveTarget)) {
    const stat = await fs.stat(effectiveTarget)
    if (!stat.isDirectory()) {
      await stripMarkersFromTarget(fs, effectiveTarget, canonicalTarget?.transform)
    }
  }
  if (registryConfig.targets.length > 1) {
    await distributeToSecondaryTargets({
      fileService: fs,
      sourcePath: datasetPath,
      targets: registryConfig.targets,
      baseTarget,
    })
  }
}

async function installRegistry(ctx: {
  fs: FileSystemService
  registryName: string
  registryConfig: RegistryConfig
  datasetRoot: string
  baseTarget: string
  pushLog: (level: LogEntry['level'], message: string) => void
}): Promise<SkillNameMap | undefined> {
  const { fs, registryName, registryConfig, datasetRoot, baseTarget, pushLog } = ctx
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

  // For flatten+prefix registries (skills), use baseTarget as the effective
  // datasetRoot so that link re-rooting correctly maps source paths to target paths.
  const effectiveDatasetRoot =
    registryConfig.flatten || registryConfig.prefix ? baseTarget : datasetRoot

  pushLog('info', `Installing '${registryName}' from '${datasetPath}' to '${effectiveTarget}'`)
  const result = await doCopyAndUpdateLinks(fs, {
    source: datasetPath,
    target: effectiveTarget,
    datasetRoot: effectiveDatasetRoot,
    options: copyOptions,
  })

  await postCopyOps({ fs, registryConfig, effectiveTarget, datasetPath, baseTarget })
  pushLog('info', `Successfully installed registry '${registryName}'`)
  return result['skillNameMap'] as SkillNameMap | undefined
}

async function executeInstall(context: {
  fs: FileSystemService
  datasetRoot: string
  registries: Record<string, RegistryConfig>
  baseTarget: string
  options: InstallHandlerOptions | undefined
  pushLog: (level: LogEntry['level'], message: string) => void
}): Promise<void> {
  const { fs, datasetRoot, registries, baseTarget, options, pushLog } = context
  const accumulatedSkillNameMap: SkillNameMap = new Map()

  await forEachRegistry(registries, async (registryName, registryConfig) => {
    const skillNameMap = await installRegistry({
      fs,
      registryName,
      registryConfig,
      datasetRoot,
      baseTarget,
      pushLog,
    })
    if (skillNameMap) {
      for (const [k, v] of skillNameMap) accumulatedSkillNameMap.set(k, v)
    }
  })

  if (accumulatedSkillNameMap.size > 0) {
    await applySkillRefsToNonSkillRegistries(
      { fs, baseTarget, pushLog },
      registries,
      accumulatedSkillNameMap,
    )
  }

  if (options?.linkStyle) {
    await applyLinkTransformation(fs, { linkStyle: options.linkStyle }, pushLog, 'install')
  }
}

/**
 * Applies skill reference rewrites to non-skills registries (e.g., AGENTS.md)
 * using the accumulated skillNameMap from skills registry processing.
 */
async function applySkillRefsToNonSkillRegistries(
  context: {
    fs: FileSystemService
    baseTarget: string
    pushLog: (level: LogEntry['level'], message: string) => void
  },
  registries: Record<string, RegistryConfig>,
  skillNameMap: SkillNameMap,
): Promise<void> {
  const { fs, baseTarget, pushLog } = context

  for (const [, config] of Object.entries(registries)) {
    if (config.flatten || config.prefix) continue

    for (const targetCfg of config.targets) {
      if (targetCfg.mode === 'symlink') continue
      const target = baseTarget
        ? fs.resolve(baseTarget, targetCfg.path)
        : fs.resolve(targetCfg.path)
      await rewriteSkillRefsInTarget(fs, target, skillNameMap, pushLog)
    }
  }
}

async function rewriteSkillRefsInTarget(
  fs: FileSystemService,
  target: string,
  skillNameMap: SkillNameMap,
  pushLog: (level: LogEntry['level'], message: string) => void,
): Promise<void> {
  if (!(await fs.exists(target))) return

  const stat = await fs.stat(target)
  const files: string[] = stat.isDirectory()
    ? await walkMarkdownFiles(target, fs)
    : target.endsWith('.md')
      ? [target]
      : []

  for (const filePath of files) {
    const content = await fs.readFile(filePath)
    const rewritten = rewriteSkillReferences(content, skillNameMap)
    if (rewritten !== content) {
      await fs.writeFile(filePath, rewritten)
      pushLog('info', `Skill reference rewriter: updated ${filePath}`)
    }
  }
}

/**
 * Resolve dataset root based on install config resolution strategy
 */
async function resolveDatasetRoot(
  fs: FileSystemService,
  config: InstallCommandConfig,
  options?: InstallHandlerOptions,
): Promise<string> {
  const version = options?.cliVersion || '0.0.0'

  switch (config.resolution) {
    case 'default':
      return getKnowledgeHubDatasetPath(fs)

    case 'remote':
      return getKnowledgeHubDatasetPathWithFallback({
        fsService: fs,
        version,
        ...(options?.httpClient && { httpClient: options.httpClient }),
        customUrl: config.url,
      })

    case 'local':
      if (config.path.endsWith('.zip')) {
        return installKBFromLocalZip(version, config.path, fs)
      }
      return config.path
  }
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

  // Check for overlapping targets
  const overlapping = detectOverlappingTargets(targets)
  if (overlapping.length > 0) {
    return {
      valid: false,
      error: `Overlapping registry targets detected: ${overlapping.join('; ')}`,
    }
  }

  // Check all targets are empty (for mirror behavior)
  const emptyCheck = await checkTargetsEmptiness(targets, fs)
  if (!emptyCheck.valid && emptyCheck.errors.length > 0) {
    const errorMsg = emptyCheck.errors.map(e => `${e.registry}: ${e.error}`).join('; ')
    return { valid: false, error: errorMsg }
  }

  return { valid: true }
}
