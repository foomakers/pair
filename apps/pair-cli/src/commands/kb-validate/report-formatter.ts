import chalk from 'chalk'
import type { StructureValidationResult } from './structure-validator'
import type { LinkValidationResult } from './link-checker'
import type { MetadataValidationResult } from './metadata-validator'

/**
 * Exit codes for validation
 */
export enum ValidationExitCode {
  Success = 0,
  ErrorsFound = 1,
  ValidationFailed = 2,
}

/**
 * Aggregated validation results
 */
export interface ValidationReport {
  structure: StructureValidationResult | null
  links: LinkValidationResult[]
  metadata: MetadataValidationResult[]
  summary: {
    totalErrors: number
    totalWarnings: number
    hasErrors: boolean
  }
  exitCode: ValidationExitCode
}

/**
 * Aggregates validation results and determines exit code
 */
export function createValidationReport(results: {
  structure?: StructureValidationResult
  links?: LinkValidationResult[]
  metadata?: MetadataValidationResult[]
}): ValidationReport {
  const { structure = null, links = [], metadata = [] } = results

  let totalErrors = 0
  let totalWarnings = 0

  // Count structure errors/warnings
  if (structure) {
    for (const reg of structure.registries) {
      totalErrors += reg.errors.length
      totalWarnings += reg.warnings.length
    }
  }

  // Count link errors/warnings
  for (const link of links) {
    totalErrors += link.errors.length
    totalWarnings += link.warnings.length
  }

  // Count metadata errors/warnings
  for (const meta of metadata) {
    totalErrors += meta.errors.length
    totalWarnings += meta.warnings.length
  }

  const hasErrors = totalErrors > 0

  // Determine exit code
  const exitCode = hasErrors ? ValidationExitCode.ErrorsFound : ValidationExitCode.Success

  return {
    structure,
    links,
    metadata,
    summary: {
      totalErrors,
      totalWarnings,
      hasErrors,
    },
    exitCode,
  }
}

/**
 * Formats structure validation section
 */
function formatStructureSection(structure: StructureValidationResult): string[] {
  const lines: string[] = []
  lines.push(chalk.bold('Structure Validation:'))

  for (const reg of structure.registries) {
    const status = reg.valid ? chalk.green('✓') : chalk.red('✗')
    lines.push(`  ${status} ${reg.registry}`)
    lines.push(...formatIssues(reg.errors, reg.warnings))
  }

  lines.push('')
  return lines
}

/**
 * Formats link validation section
 */
function formatLinkSection(links: LinkValidationResult[]): string[] {
  const lines: string[] = []
  lines.push(chalk.bold('Link Validation:'))

  for (const link of links) {
    if (link.errors.length > 0 || link.warnings.length > 0) {
      lines.push(`  ${link.file}`)
      lines.push(...formatIssues(link.errors, link.warnings))
    }
  }

  lines.push('')
  return lines
}

/**
 * Formats metadata validation section
 */
function formatMetadataSection(metadata: MetadataValidationResult[]): string[] {
  const lines: string[] = []
  lines.push(chalk.bold('Metadata Validation:'))

  for (const meta of metadata) {
    if (meta.errors.length > 0 || meta.warnings.length > 0) {
      lines.push(`  ${meta.file}`)
      lines.push(...formatIssues(meta.errors, meta.warnings))
    }
  }

  lines.push('')
  return lines
}

/**
 * Formats errors and warnings
 */
function formatIssues(errors: string[], warnings: string[]): string[] {
  const lines: string[] = []

  for (const error of errors) {
    lines.push(chalk.red(`    ERROR: ${error}`))
  }

  for (const warning of warnings) {
    lines.push(chalk.yellow(`    WARNING: ${warning}`))
  }

  return lines
}

/**
 * Formats validation report as colored terminal output
 */
export function formatReport(report: ValidationReport): string {
  const lines: string[] = []

  lines.push(chalk.bold('KB Validation Report'))
  lines.push(chalk.dim('='.repeat(60)))
  lines.push('')

  if (report.structure) {
    lines.push(...formatStructureSection(report.structure))
  }

  if (report.links.length > 0) {
    lines.push(...formatLinkSection(report.links))
  }

  if (report.metadata.length > 0) {
    lines.push(...formatMetadataSection(report.metadata))
  }

  // Summary
  lines.push(chalk.dim('='.repeat(60)))
  lines.push(chalk.bold('Summary:'))
  const errCount = report.summary.totalErrors
  const warnCount = report.summary.totalWarnings
  lines.push(`  Errors:   ${errCount > 0 ? chalk.red(errCount) : chalk.green(errCount)}`)
  lines.push(`  Warnings: ${warnCount > 0 ? chalk.yellow(warnCount) : chalk.green(warnCount)}`)
  lines.push('')

  const statusLine =
    report.exitCode === ValidationExitCode.Success
      ? chalk.green('✓ Validation passed')
      : chalk.red('✗ Validation failed')
  lines.push(statusLine)

  return lines.join('\n')
}
