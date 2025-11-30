import { Command } from 'commander'
import { loadConfigWithOverrides, type Config } from '../config-utils'
import { validatePackageStructure } from './package/validators'
import { generateManifestMetadata } from './package/metadata'
import { createPackageZip } from './package/zip-creator'
import { fileSystemService } from '@pair/content-ops'
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

async function executePackage(options: PackageOptions): Promise<void> {
  const projectRoot = options.sourceDir || process.cwd()

  // Load and validate
  const result = await loadAndValidateConfig(options, projectRoot)
  await validateConfig(result.config, projectRoot)

  // Generate manifest
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
  await prepareOutputDir(outputDir, outputPath)

  // Create ZIP
  try {
    await createPackageZip({ projectRoot, registries, manifest, outputPath }, fileSystemService)
    console.log(`✅ Package created: ${outputPath}`)
  } catch (error) {
    console.error('❌ ZIP creation failed:', error instanceof Error ? error.message : error)
    process.exit(EXIT_PACKAGING_ERROR)
  }
}

export function packageCommand(program: Command): void {
  program
    .command('package')
    .description('Package KB content into a validated ZIP file for distribution')
    .option('-o, --output <path>', 'Output ZIP file path')
    .option(
      '-s, --source-dir <path>',
      'Source directory to package (defaults to current directory)',
    )
    .option('-c, --config <path>', 'Path to config.json file')
    .option('--name <name>', 'Package name for manifest')
    .option('--version <version>', 'Package version for manifest')
    .option('--description <description>', 'Package description for manifest')
    .option('--author <author>', 'Package author for manifest')
    .option('-v, --verbose', 'Enable verbose logging', false)
    .action(async (options: PackageOptions) => {
      try {
        await executePackage(options)
      } catch (error) {
        console.error('Package failed:', error instanceof Error ? error.message : error)
        process.exit(1)
      }
    })
}
