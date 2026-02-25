import type { KbValidateCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { logger } from '@pair/content-ops'
import { loadConfigWithOverrides } from '#config'
import {
  extractRegistries,
  filterRegistries,
  validateSkipList,
  collectLayoutFiles,
  type LayoutMode,
  type RegistryConfig,
} from '#registry'
import { validateStructure } from './structure-validator'
import { validateLinks } from './link-checker'
import { validateMetadata } from './metadata-validator'
import { createValidationReport, formatReport, ValidationExitCode } from './report-formatter'

function loadRegistries(
  config: KbValidateCommandConfig,
  fs: FileSystemService,
  kbPath: string,
): Record<string, RegistryConfig> {
  if (config.ignoreConfig) return {}

  const result = loadConfigWithOverrides(fs, { projectRoot: kbPath })
  let registries = extractRegistries(result.config)

  if (config.skipRegistries) {
    const invalid = validateSkipList(registries, config.skipRegistries)
    for (const name of invalid) {
      logger.warn(`Registry '${name}' not found in config, ignoring`)
    }
  }

  registries = filterRegistries(registries, config.skipRegistries)

  if (Object.keys(registries).length === 0) {
    logger.warn('No registries to validate')
  }

  return registries
}

async function collectFiles(
  registries: Record<string, RegistryConfig>,
  layout: LayoutMode,
  kbPath: string,
  fs: FileSystemService,
): Promise<string[]> {
  const allFiles: string[] = []
  for (const [, registryConfig] of Object.entries(registries)) {
    const files = await collectLayoutFiles({
      registry: registryConfig,
      layout,
      baseDir: kbPath,
      fs,
    })
    allFiles.push(...files)
  }
  return allFiles
}

/**
 * Handles the kb-validate command execution.
 * Validates KB structure, links, and metadata using layout.ts utilities.
 */
export async function handleKbValidateCommand(
  config: KbValidateCommandConfig,
  fs: FileSystemService,
): Promise<void> {
  const kbPath = config.path || fs.currentWorkingDirectory()
  const layout: LayoutMode = config.layout || 'target'

  const pairDir = `${kbPath}/.pair`
  if (!(await fs.exists(pairDir))) {
    throw new Error(`Invalid KB: missing .pair directory at ${pairDir}`)
  }

  const registries = loadRegistries(config, fs, kbPath)

  const structure = !config.ignoreConfig
    ? await validateStructure({ registries, layout, baseDir: kbPath, fs })
    : undefined

  const allFiles = await collectFiles(registries, layout, kbPath, fs)
  const mdFiles = allFiles.filter(f => f.endsWith('.md'))

  const links = await validateLinks({
    baseDir: kbPath,
    files: mdFiles,
    fs,
    ...(config.strict !== undefined && { strict: config.strict }),
  })

  const metadata = await validateMetadata({
    baseDir: kbPath,
    skillFiles: mdFiles.filter(f => f.endsWith('SKILL.md')),
    adoptionFiles: allFiles.filter(f => f.includes('/adoption/') && f.endsWith('.md')),
    fs,
  })

  const report = createValidationReport({ ...(structure && { structure }), links, metadata })
  const output = formatReport(report)
  console.log(output)

  if (report.exitCode !== ValidationExitCode.Success) {
    throw new Error(`Validation failed with ${report.summary.totalErrors} error(s)`)
  }
}
