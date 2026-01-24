import type { PackageCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { loadConfigWithOverrides } from '../../config-utils'
import { validatePackageStructure } from './validators'
import { generateManifestMetadata } from './metadata'
import { createPackageZip } from './zip-creator'
import { extractRegistries, type RegistryConfig } from '../../registry'
import path from 'path'

async function loadAndValidate(
  config: PackageCommandConfig,
  fs: FileSystemService,
  projectRoot: string,
) {
  if (config.verbose) console.log('🔍 Loading configuration...')
  const result = loadConfigWithOverrides(fs, { projectRoot })

  if (config.verbose) console.log('✓ Validating package structure...')
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

  if (config.verbose) {
    console.log('🗜️  Creating ZIP archive...')
    console.log(`   Packaging ${registries.length} registries`)
  }

  await createPackageZip({ projectRoot, registries, manifest, outputPath }, fs)

  const stats = await fs.stat(outputPath)
  const sizeKB = (stats.size / 1024).toFixed(2)
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)
  const sizeDisplay = stats.size >= 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`

  console.log(`✅ Package created: ${outputPath}`)
  console.log(`   Size: ${sizeDisplay}`)

  if (stats.size > 100 * 1024 * 1024) {
    console.warn(`⚠️  Large package size (${sizeMB} MB) - consider reviewing content`)
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

  if (config.verbose) {
    console.log('📦 Starting package creation...')
    console.log(`   Source: ${projectRoot}`)
  }

  const result = await loadAndValidate(config, fs, projectRoot)

  if (config.verbose) console.log('📋 Generating manifest metadata...')
  const registries = Object.values(extractRegistries(result.config))
  const registryNames = registries.map(r => r.source || '').filter(Boolean)
  const manifest = generateManifestMetadata(registryNames, buildCliParams(config))

  const outputPath =
    config.output || path.join(projectRoot, 'dist', `kb-package-${manifest.created_at}.zip`)

  if (config.verbose) console.log(`📁 Preparing output directory: ${path.dirname(outputPath)}`)
  await prepareOutput(outputPath, fs)

  await createAndReportZip({ config, projectRoot, registries, manifest, outputPath, fs })
}
