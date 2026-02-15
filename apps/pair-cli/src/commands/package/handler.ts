import type { PackageCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { loadConfigWithOverrides } from '#config'
import { validatePackageStructure } from './validators'
import { generateManifestMetadata } from './metadata'
import { createPackageZip } from './zip-creator'
import {
  extractRegistries,
  filterRegistries,
  validateSkipList,
  type RegistryConfig,
} from '#registry'
import path from 'path'
import { logger, setLogLevel } from '@pair/content-ops'

async function loadAndValidate(
  config: PackageCommandConfig,
  fs: FileSystemService,
  projectRoot: string,
) {
  if (config.logLevel) setLogLevel(config.logLevel)
  logger.debug('🔍 Loading configuration...')
  // When sourceDir is provided, skip base config to avoid requiring all default registries
  const result = loadConfigWithOverrides(fs, { projectRoot, skipBaseConfig: !!config.sourceDir })

  logger.debug('✓ Validating package structure...')
  const validation = await validatePackageStructure(result.config, projectRoot, fs)
  if (!validation.valid) {
    const message = `Validation failed:\n${validation.errors.join('\n')}`
    console.error('❌', message)
    throw new Error(message)
  }

  return result
}

async function prepareOutput(outputPath: string, fs: FileSystemService) {
  const outputDir = path.dirname(outputPath)

  if (!fs.existsSync(outputDir)) {
    await fs.mkdir(outputDir, { recursive: true })
  }

  try {
    fs.accessSync(outputDir)
  } catch {
    throw new Error(`Output directory is not writable: ${outputDir}`)
  }

  if (fs.existsSync(outputPath)) {
    console.warn(`⚠️  Overwriting existing file: ${outputPath}`)
  }
}

async function createAndReportZip(params: {
  config: PackageCommandConfig
  projectRoot: string
  registries: RegistryConfig[]
  manifest: ReturnType<typeof generateManifestMetadata>
  outputPath: string
  fs: FileSystemService
}) {
  const { config, projectRoot, registries, manifest, outputPath, fs } = params

  logger.debug('🗜️  Creating ZIP archive...')
  logger.debug(`   Packaging ${registries.length} registries`)

  await createPackageZip(
    { projectRoot, registries, manifest, outputPath, ...(config.root && { root: config.root }), ...(config.layout && { layout: config.layout }) },
    fs,
  )

  const stats = await fs.stat(outputPath)
  const sizeKB = (stats.size / 1024).toFixed(2)
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)
  const sizeDisplay = stats.size >= 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`

  logger.info(`✅ Package created: ${outputPath}`)
  logger.info(`   Size: ${sizeDisplay}`)

  if (stats.size > 100 * 1024 * 1024) {
    logger.warn(`⚠️  Large package size (${sizeMB} MB) - consider reviewing content`)
  }
}

function buildCliParams(config: PackageCommandConfig) {
  return {
    ...(config.name && { name: config.name }),
    ...(config.version && { version: config.version }),
    ...(config.description && { description: config.description }),
    ...(config.author && { author: config.author }),
  }
}

/**
 * Handles the package command execution.
 * Processes PackageCommandConfig to create KB packages.
 */
export async function handlePackageCommand(
  config: PackageCommandConfig,
  fs: FileSystemService,
): Promise<void> {
  const projectRoot = config.sourceDir || fs.currentWorkingDirectory()

  logger.debug('📦 Starting package creation...')
  logger.debug(`   Source: ${projectRoot}`)

  const result = await loadAndValidate(config, fs, projectRoot)

  logger.debug('📋 Generating manifest metadata...')
  const allRegistries = extractRegistries(result.config)

  // Apply skip-registries filter
  if (config.skipRegistries) {
    const invalid = validateSkipList(allRegistries, config.skipRegistries)
    for (const name of invalid) {
      logger.warn(`Registry '${name}' not found in config, ignoring`)
    }
  }
  const filtered = filterRegistries(allRegistries, config.skipRegistries)
  const registries = Object.values(filtered)
  const registryNames = registries.map(r => r.source || '').filter(Boolean)
  const manifest = generateManifestMetadata(registryNames, buildCliParams(config))

  // Resolve output path - if relative, make it relative to current working directory
  const outputPath = config.output
    ? path.resolve(config.output)
    : path.join(projectRoot, 'dist', `kb-package-${manifest.created_at}.zip`)

  logger.debug(`📁 Preparing output directory: ${path.dirname(outputPath)}`)
  await prepareOutput(outputPath, fs)

  await createAndReportZip({ config, projectRoot, registries, manifest, outputPath, fs })
}
