import { Command } from 'commander'
import { loadConfigWithOverrides, type Config } from '../config-utils'
import { validatePackageStructure } from './package/validators'
import { generateManifestMetadata } from './package/metadata'
import { createPackageZip } from './package/zip-creator'
import { fileSystemService, type FileSystemService } from '@pair/content-ops'
import path from 'path'
import type { AssetRegistryConfig } from './install'

export interface PackageMetadata {
  name: string
  version: string
  description?: string
  timestamp: string
  registries: string[]
}

export interface PackageOptions {
  output?: string
  sourceDir?: string
  config?: string
  verbose?: boolean
  name?: string
  version?: string
  description?: string
  author?: string
}

export interface PackageContext {
  sourceDir: string
  outputPath: string
  metadata: PackageMetadata
}

// Exit codes
export const EXIT_SUCCESS = 0
export const EXIT_VALIDATION_ERROR = 1
export const EXIT_PACKAGING_ERROR = 2

async function loadAndValidateConfig(options: PackageOptions, projectRoot: string) {
  try {
    return loadConfigWithOverrides(fileSystemService, {
      ...(options.config && { customConfigPath: options.config }),
      projectRoot,
    })
  } catch (error) {
    console.error('❌ Config loading failed:', error instanceof Error ? error.message : error)
    process.exit(EXIT_VALIDATION_ERROR)
  }
}

async function validateConfig(config: Config, projectRoot: string) {
  const validation = await validatePackageStructure(config, projectRoot, fileSystemService)
  if (!validation.valid) {
    console.error('❌ Validation failed:')
    validation.errors.forEach(err => console.error(`  - ${err}`))
    process.exit(EXIT_VALIDATION_ERROR)
  }
}

async function prepareOutputDir(outputDir: string, outputPath: string) {
  try {
    if (!fileSystemService.existsSync(outputDir)) {
      await fileSystemService.mkdir(outputDir, { recursive: true })
    }
  } catch (error) {
    console.error(
      `❌ Cannot create output directory: ${outputDir}`,
      error instanceof Error ? error.message : error,
    )
    process.exit(EXIT_PACKAGING_ERROR)
  }

  try {
    fileSystemService.accessSync(outputDir)
  } catch {
    console.error(`❌ Output directory is not writable: ${outputDir}`)
    process.exit(EXIT_PACKAGING_ERROR)
  }

  if (fileSystemService.existsSync(outputPath)) {
    console.warn(`⚠️  Overwriting existing file: ${outputPath}`)
  }
}

async function displayProgress(message: string, verbose?: boolean) {
  if (verbose) console.log(message)
}

export function formatFileSize(bytes: number): string {
  const sizeKB = (bytes / 1024).toFixed(2)
  const sizeMB = (bytes / (1024 * 1024)).toFixed(2)
  return bytes >= 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`
}

async function displayPackageSuccess(outputPath: string, fileService: FileSystemService) {
  const stats = await fileService.stat(outputPath)
  const sizeDisplay = formatFileSize(stats.size)

  console.log(`✅ Package created: ${outputPath}`)
  console.log(`   Size: ${sizeDisplay}`)

  if (stats.size > 100 * 1024 * 1024) {
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)
    console.warn(`⚠️  Large package size (${sizeMB} MB) - consider reviewing content`)
  }
}

async function executePackage(options: PackageOptions): Promise<void> {
  const projectRoot = options.sourceDir || process.cwd()

  await displayProgress('📦 Starting package creation...', options.verbose)
  await displayProgress(`   Source: ${projectRoot}`, options.verbose)

  // Load and validate
  await displayProgress('🔍 Loading configuration...', options.verbose)
  const result = await loadAndValidateConfig(options, projectRoot)

  await displayProgress('✓ Validating package structure...', options.verbose)
  await validateConfig(result.config, projectRoot)

  // Generate manifest
  await displayProgress('📋 Generating manifest metadata...', options.verbose)
  const registries: AssetRegistryConfig[] = Object.values(result.config.asset_registries)
  const registryNames = registries.map(r => r.source || '').filter(Boolean)
  const cliParams = {
    ...(options.name && { name: options.name }),
    ...(options.version && { version: options.version }),
    ...(options.description && { description: options.description }),
    ...(options.author && { author: options.author }),
  }
  const manifest = generateManifestMetadata(registryNames, cliParams)

  // Prepare output
  const outputPath =
    options.output || path.join(projectRoot, 'dist', `kb-package-${manifest.created_at}.zip`)
  const outputDir = path.dirname(outputPath)

  await displayProgress(`📁 Preparing output directory: ${outputDir}`, options.verbose)
  await prepareOutputDir(outputDir, outputPath)

  // Create ZIP
  await displayProgress('🗜️  Creating ZIP archive...', options.verbose)
  await displayProgress(`   Packaging ${registryNames.length} registries`, options.verbose)

  try {
    await createPackageZip({ projectRoot, registries, manifest, outputPath }, fileSystemService)
    await displayPackageSuccess(outputPath, fileSystemService)
  } catch (error) {
    console.error('❌ ZIP creation failed:', error instanceof Error ? error.message : error)
    process.exit(EXIT_PACKAGING_ERROR)
  }
}

export function packageCommand(program: Command): void {
  program
    .command('package')
    .description('Package KB content into validated ZIP file for distribution')
    .option('-o, --output <path>', 'Output ZIP file path (default: kb-package.zip)')
    .option(
      '-s, --source-dir <path>',
      'Source directory to package (default: current directory)',
    )
    .option('-c, --config <path>', 'Path to config.json file')
    .option('--name <name>', 'Package name for manifest')
    .option('--version <version>', 'Package version for manifest')
    .option('--description <description>', 'Package description for manifest')
    .option('--author <author>', 'Package author for manifest')
    .option('-v, --verbose', 'Enable verbose logging', false)
    .addHelpText(
      'after',
      `
Examples:
  $ pair package                                   Package current directory
  $ pair package -o dist/kb-v1.0.0.zip            Package with custom output path
  $ pair package -s ./kb-content -o kb.zip        Package specific source directory
  $ pair package --name "My KB" --version 1.0.0   Package with metadata
  $ pair package --verbose                         Package with detailed logging

Usage Notes:
  • Validates KB structure before packaging (.pair directory required)
  • Creates manifest with package metadata
  • Output ZIP includes all KB content and assets
  • Validates required files and directory structure
`,
    )
    .action(async (options: PackageOptions) => {
      try {
        await executePackage(options)
      } catch (error) {
        console.error('Package failed:', error instanceof Error ? error.message : error)
        process.exit(1)
      }
    })
}
