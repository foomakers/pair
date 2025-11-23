import { Command } from 'commander'

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
}

export interface PackageContext {
  sourceDir: string
  outputPath: string
  metadata: PackageMetadata
}

export function packageCommand(program: Command): void {
  program
    .command('package')
    .description('Package KB content into a validated ZIP file for distribution')
    .option('-o, --output <path>', 'Output ZIP file path', './kb-package.zip')
    .option('-s, --source-dir <path>', 'Source directory to package (defaults to dataset root)')
    .option('-c, --config <path>', 'Path to config.json file')
    .option('-v, --verbose', 'Enable verbose logging', false)
    .action(async (options: PackageOptions) => {
      // Placeholder implementation for GREEN phase
      console.log('Package command registered', options)
    })
}
