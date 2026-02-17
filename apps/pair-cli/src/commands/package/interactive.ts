import { input, confirm } from '@inquirer/prompts'
import type { FileSystemService } from '@pair/content-ops'
import type { PackageCommandConfig } from './parser'
import { resolveDefaults, readGitConfig, readPackageJsonDefaults } from './defaults-resolver'
import type { ResolvedMetadata } from './defaults-resolver'
import { readPreferences, savePreferences } from './preferences'
import { validatePackageName, validateVersion, parseTagsInput } from './input-validators'
import { formatPreview } from './preview'
import { loadConfigWithOverrides } from '#config'
import { extractRegistries } from '#registry'
import { logger } from '@pair/content-ops'
import path from 'path'

class InteractiveCancelledError extends Error {
  constructor() {
    super('Package creation cancelled')
    this.name = 'InteractiveCancelledError'
  }
}

/**
 * Run the interactive package creation flow.
 * Returns merged PackageCommandConfig on success, or null if user aborts.
 */
function buildDefaults(config: PackageCommandConfig, fs: FileSystemService) {
  const projectRoot = config.sourceDir || fs.currentWorkingDirectory()
  const gitConfig = readGitConfig()
  const packageJson = readPackageJsonDefaults(projectRoot, fs)
  const prefs = readPreferences(fs)
  return {
    projectRoot,
    defaults: resolveDefaults({
      cliFlags: buildCliFlagsSource(config),
      packageJson,
      gitConfig,
      preferences: prefs?.packageMetadata,
    }),
  }
}

function mergeMetadataIntoConfig(
  config: PackageCommandConfig,
  metadata: ResolvedMetadata,
): PackageCommandConfig {
  return {
    ...config,
    name: metadata.name,
    version: metadata.version,
    description: metadata.description,
    author: metadata.author,
    tags: metadata.tags,
    license: metadata.license,
  }
}

/**
 * Run the interactive package creation flow.
 * Returns merged PackageCommandConfig on success, or null if user aborts.
 */
export async function runInteractiveFlow(
  config: PackageCommandConfig,
  fs: FileSystemService,
): Promise<PackageCommandConfig | null> {
  if (!process.stdout.isTTY) {
    throw new Error('Interactive mode requires a terminal (TTY)')
  }

  const { projectRoot, defaults } = buildDefaults(config, fs)

  try {
    const metadata = await collectMetadata(defaults)
    const previewInfo = getPreviewInfo(config, projectRoot, fs)
    console.log(formatPreview({ metadata, ...previewInfo }))

    const confirmed = await confirm({ message: 'Create package?', default: true })
    if (!confirmed) {
      console.log('Package creation cancelled')
      return null
    }

    await savePreferences({ packageMetadata: metadata, updatedAt: new Date().toISOString() }, fs)
    return mergeMetadataIntoConfig(config, metadata)
  } catch (error: unknown) {
    if (isExitPromptError(error) || error instanceof InteractiveCancelledError) {
      console.log('Package creation cancelled')
      return null
    }
    throw error
  }
}

async function collectMetadata(defaults: ResolvedMetadata): Promise<ResolvedMetadata> {
  const name = await input({
    message: 'Package name:',
    default: defaults.name,
    validate: validatePackageName,
  })

  const version = await input({
    message: 'Version:',
    default: defaults.version,
    validate: validateVersion,
  })

  const description = await input({
    message: 'Description:',
    default: defaults.description,
  })

  const author = await input({
    message: 'Author:',
    default: defaults.author,
  })

  const tagsRaw = await input({
    message: 'Tags (comma-separated):',
    default: defaults.tags.length > 0 ? defaults.tags.join(', ') : '',
  })

  const license = await input({
    message: 'License:',
    default: defaults.license,
  })

  return {
    name,
    version,
    description: description || defaults.description,
    author: author || defaults.author,
    tags: parseTagsInput(tagsRaw),
    license: license || defaults.license,
  }
}

function buildCliFlagsSource(config: PackageCommandConfig): Partial<ResolvedMetadata> {
  const flags: Partial<ResolvedMetadata> = {}
  if (config.name) flags.name = config.name
  if (config.version) flags.version = config.version
  if (config.description) flags.description = config.description
  if (config.author) flags.author = config.author
  if (config.tags.length > 0) flags.tags = config.tags
  if (config.license !== 'MIT') flags.license = config.license
  return flags
}

function getPreviewInfo(
  config: PackageCommandConfig,
  projectRoot: string,
  fs: FileSystemService,
): { registries: string[]; fileCount: number; outputPath: string } {
  try {
    const result = loadConfigWithOverrides(fs, { projectRoot, skipBaseConfig: !!config.sourceDir })
    const allRegistries = extractRegistries(result.config)
    const registries = Object.values(allRegistries)
      .map(r => r.source || '')
      .filter(Boolean)
    const fileCount = registries.length * 10 // rough estimate

    const outputPath = config.output
      ? path.resolve(config.output)
      : path.join(projectRoot, 'dist', 'kb-package.zip')

    return { registries, fileCount, outputPath }
  } catch {
    logger.debug('Could not load config for preview, using defaults')
    return { registries: [], fileCount: 0, outputPath: config.output || 'kb-package.zip' }
  }
}

function isExitPromptError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'ExitPromptError') return true
  return false
}
