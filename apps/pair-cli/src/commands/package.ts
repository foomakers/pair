import { Command } from 'commander'
import { loadConfigWithOverrides } from '../config-utils'
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

async function executePackage(options: PackageOptions): Promise<void> {
  const projectRoot = options.sourceDir || process.cwd()

  const result = loadConfigWithOverrides(fileSystemService, {
    ...(options.config && { customConfigPath: options.config }),
    projectRoot,
  })

  const validation = await validatePackageStructure(result.config, projectRoot, fileSystemService)
  if (!validation.valid) {
    console.error('Validation failed:', validation.errors.join(', '))
    process.exit(1)
  }

  const registries: AssetRegistryConfig[] = Object.values(result.config.asset_registries)
  const registryNames = registries.map(r => r.source || '').filter(Boolean)

  const cliParams = {
    ...(options.name && { name: options.name }),
    ...(options.version && { version: options.version }),
    ...(options.description && { description: options.description }),
    ...(options.author && { author: options.author }),
  }
  const manifest = generateManifestMetadata(registryNames, cliParams)

  const outputPath =
    options.output || path.join(projectRoot, 'dist', `kb-package-${manifest.created_at}.zip`)

  await createPackageZip({ projectRoot, registries, manifest, outputPath }, fileSystemService)

  console.log(`✅ Package created: ${outputPath}`)
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
