import type { KbValidateCommandConfig } from './parser'
import type { FileSystemService } from '@pair/content-ops'
import { logger } from '@pair/content-ops'
import { loadConfigWithOverrides } from '#config'
import {
  type Config,
  extractRegistries,
  filterRegistries,
  validateSkipList,
  collectLayoutFiles,
  type LayoutMode,
  type RegistryConfig,
} from '#registry'
import { validateStructure } from './structure-validator'
import { validateLinks, describeInvalidOptionalLinkPatterns } from './link-checker'
import { validateMetadata } from './metadata-validator'
import { createValidationReport, formatReport, ValidationExitCode } from './report-formatter'
import { resolveOptionalLinkPatterns } from './optional-link-config'

/**
 * Loads the project config once per run. `--ignore-config` means "consult no
 * config at all", so it yields null and every config-derived input (registries,
 * optional link patterns) falls back to what the CLI passed.
 */
function loadKbConfig(
  config: KbValidateCommandConfig,
  fs: FileSystemService,
  kbPath: string,
): Config | null {
  if (config.ignoreConfig) return null
  return loadConfigWithOverrides(fs, { projectRoot: kbPath }).config
}

function loadRegistries(
  config: KbValidateCommandConfig,
  loadedConfig: Config | null,
): Record<string, RegistryConfig> {
  if (loadedConfig === null) return {}

  let registries = extractRegistries(loadedConfig)

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
 * Optional link patterns of this run (US-188), with their diagnostics.
 *
 * The diagnostics are RETURNED, not just logged, so they reach the report as
 * run-level warnings: a warning that only went to the log would leave the report
 * footer printing `Warnings: 0` on a run that just reported a config typo.
 *
 * They deliberately travel on BOTH channels, so each run-level diagnostic is
 * emitted twice: once on stderr the moment it is detected (immediacy — a long
 * validation run should not sit on a config typo until the report prints, and
 * `validateLinks` is used by callers that never build a report), and once in the
 * report's `Configuration:` section, where it is counted in the `Warnings:`
 * total. Each channel logs its own: the config-shape ones here, the
 * malformed-pattern ones inside `validateLinks` when it compiles them —
 * `describeInvalidOptionalLinkPatterns` re-derives the latter from the SAME
 * message source, so the two channels cannot drift. Documented as a design
 * choice in the CLI reference (`kb-validate` → Optional link patterns).
 */
function resolveOptionalLinks(
  config: KbValidateCommandConfig,
  loadedConfig: Config | null,
): { patterns: string[]; runWarnings: string[] } {
  const { patterns, warnings } = resolveOptionalLinkPatterns(
    loadedConfig,
    config.optionalLinkPatterns,
  )
  for (const warning of warnings) {
    logger.warn(warning)
  }
  return { patterns, runWarnings: [...warnings, ...describeInvalidOptionalLinkPatterns(patterns)] }
}

/** Frontmatter checks: skills are the SKILL.md files, adoption the files under /adoption/. */
function validateKbMetadata(params: {
  allFiles: string[]
  mdFiles: string[]
  kbPath: string
  fs: FileSystemService
}): ReturnType<typeof validateMetadata> {
  const { allFiles, mdFiles, kbPath, fs } = params
  return validateMetadata({
    baseDir: kbPath,
    skillFiles: mdFiles.filter(f => f.endsWith('SKILL.md')),
    adoptionFiles: allFiles.filter(f => f.includes('/adoption/') && f.endsWith('.md')),
    fs,
  })
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

  const loadedConfig = loadKbConfig(config, fs, kbPath)
  const registries = loadRegistries(config, loadedConfig)
  const { patterns: optionalLinkPatterns, runWarnings } = resolveOptionalLinks(config, loadedConfig)

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
    ...(optionalLinkPatterns.length > 0 && { optionalLinkPatterns }),
  })

  const metadata = await validateKbMetadata({ allFiles, mdFiles, kbPath, fs })

  const report = createValidationReport({
    ...(structure && { structure }),
    links,
    metadata,
    runWarnings,
  })
  const output = formatReport(report)
  console.log(output)

  if (report.exitCode !== ValidationExitCode.Success) {
    throw new Error(`Validation failed with ${report.summary.totalErrors} error(s)`)
  }
}
