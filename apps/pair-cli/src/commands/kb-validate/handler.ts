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
import { validateLinks } from './link-checker'
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
 * Optional link patterns of this run (US-188), with the diagnostics produced
 * while reading them from config.
 *
 * No module that detects a run-level diagnostic logs it: they are all returned,
 * and this handler is the single place that owns the output channels, so each
 * one reaches BOTH — stderr (visible without scrolling back through the report)
 * and the report's `Configuration:` section, where it is counted in the
 * `Warnings:` total. A diagnostic that only reached the log would leave the
 * footer printing `Warnings: 0` on a run that just reported a config typo.
 * Documented as a design choice in the CLI reference (`kb-validate` → Optional
 * link patterns).
 */
function resolveOptionalLinks(
  config: KbValidateCommandConfig,
  loadedConfig: Config | null,
): { patterns: string[]; warnings: string[] } {
  return resolveOptionalLinkPatterns(loadedConfig, config.optionalLinkPatterns)
}

/**
 * `--ignore-config` resolves NO registry, so no file is collected and nothing —
 * structure, links, metadata — is actually checked: the run exits 0 having
 * validated zero files. Left silent, that reads exactly like a clean run of a
 * validation tool, which is the one thing it must never read like. Returned like
 * every other run-level diagnostic, so the caller logs it AND carries it into
 * the report's `Configuration:` section.
 */
function describeNoConfigRun(loadedConfig: Config | null): string[] {
  if (loadedConfig !== null) return []
  return [
    '--ignore-config: no config consulted, so no registry resolved — zero files collected, nothing validated (structure, links and metadata all skipped)',
  ]
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
 * The run-level diagnostics of this run: logged once here on stderr, and returned
 * so the report counts them once under `Configuration:` — the two channels every
 * such diagnostic travels on (see `resolveOptionalLinks`).
 */
function emitRunNotices(sources: string[][]): string[] {
  const notices = sources.flat()
  for (const notice of notices) {
    logger.warn(notice)
  }
  return notices
}

/** A KB is a directory with a `.pair/` in it; anything else is a usage error. */
async function assertKbRoot(kbPath: string, fs: FileSystemService): Promise<void> {
  const pairDir = `${kbPath}/.pair`
  if (!(await fs.exists(pairDir))) {
    throw new Error(`Invalid KB: missing .pair directory at ${pairDir}`)
  }
}

/** Prints the report and turns a failing exit code into the thrown CLI failure. */
function emitReport(report: ReturnType<typeof createValidationReport>): void {
  console.log(formatReport(report))
  if (report.exitCode !== ValidationExitCode.Success) {
    throw new Error(`Validation failed with ${report.summary.totalErrors} error(s)`)
  }
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

  await assertKbRoot(kbPath, fs)

  const loadedConfig = loadKbConfig(config, fs, kbPath)
  const registries = loadRegistries(config, loadedConfig)
  const { patterns: optionalLinkPatterns, warnings: configWarnings } = resolveOptionalLinks(
    config,
    loadedConfig,
  )

  const structure = !config.ignoreConfig
    ? await validateStructure({ registries, layout, baseDir: kbPath, fs })
    : undefined

  const allFiles = await collectFiles(registries, layout, kbPath, fs)
  const mdFiles = allFiles.filter(f => f.endsWith('.md'))

  const { results: links, diagnostics: patternDiagnostics } = await validateLinks({
    baseDir: kbPath,
    files: mdFiles,
    fs,
    ...(config.strict !== undefined && { strict: config.strict }),
    ...(optionalLinkPatterns.length > 0 && { optionalLinkPatterns }),
  })

  const runNotices = emitRunNotices([
    describeNoConfigRun(loadedConfig),
    configWarnings,
    patternDiagnostics,
  ])

  const metadata = await validateKbMetadata({ allFiles, mdFiles, kbPath, fs })

  emitReport(
    createValidationReport({
      ...(structure && { structure }),
      links,
      metadata,
      runWarnings: runNotices,
    }),
  )
}
