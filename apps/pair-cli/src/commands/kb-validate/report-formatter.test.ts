import { describe, it, expect } from 'vitest'
import type { StructureValidationResult } from './structure-validator'
import type { LinkValidationResult } from './link-checker'
import type { MetadataValidationResult } from './metadata-validator'
import { createValidationReport, formatReport, ValidationExitCode } from './report-formatter'

describe('createValidationReport', () => {
  it('should create report with exit code 0 when no errors', () => {
    const structure: StructureValidationResult = {
      valid: true,
      registries: [
        {
          registry: 'skills',
          valid: true,
          errors: [],
          warnings: [],
        },
      ],
    }

    const report = createValidationReport({ structure })

    expect(report.exitCode).toBe(ValidationExitCode.Success)
    expect(report.summary.totalErrors).toBe(0)
    expect(report.summary.hasErrors).toBe(false)
  })

  it('should create report with exit code 1 when structure has errors', () => {
    const structure: StructureValidationResult = {
      valid: false,
      registries: [
        {
          registry: 'skills',
          valid: false,
          errors: ['Path does not exist: /kb/.skills'],
          warnings: [],
        },
      ],
    }

    const report = createValidationReport({ structure })

    expect(report.exitCode).toBe(ValidationExitCode.ErrorsFound)
    expect(report.summary.totalErrors).toBe(1)
    expect(report.summary.hasErrors).toBe(true)
  })

  it('should create report with exit code 1 when links have errors', () => {
    const links: LinkValidationResult[] = [
      {
        file: '/kb/README.md',
        valid: false,
        errors: ['Broken internal link: ./missing.md'],
        warnings: [],
      },
    ]

    const report = createValidationReport({ links })

    expect(report.exitCode).toBe(ValidationExitCode.ErrorsFound)
    expect(report.summary.totalErrors).toBe(1)
    expect(report.summary.hasErrors).toBe(true)
  })

  it('should create report with exit code 1 when metadata has errors', () => {
    const metadata: MetadataValidationResult[] = [
      {
        file: '/kb/.skills/bootstrap.md',
        valid: false,
        errors: ['Missing required frontmatter field: name'],
        warnings: [],
      },
    ]

    const report = createValidationReport({ metadata })

    expect(report.exitCode).toBe(ValidationExitCode.ErrorsFound)
    expect(report.summary.totalErrors).toBe(1)
    expect(report.summary.hasErrors).toBe(true)
  })

  it('should aggregate errors from multiple sources', () => {
    const structure: StructureValidationResult = {
      valid: false,
      registries: [
        {
          registry: 'skills',
          valid: false,
          errors: ['Error 1'],
          warnings: [],
        },
      ],
    }

    const links: LinkValidationResult[] = [
      {
        file: '/kb/README.md',
        valid: false,
        errors: ['Error 2', 'Error 3'],
        warnings: [],
      },
    ]

    const metadata: MetadataValidationResult[] = [
      {
        file: '/kb/.skills/bootstrap.md',
        valid: false,
        errors: ['Error 4'],
        warnings: [],
      },
    ]

    const report = createValidationReport({ structure, links, metadata })

    expect(report.summary.totalErrors).toBe(4)
    expect(report.exitCode).toBe(ValidationExitCode.ErrorsFound)
  })

  it('should aggregate warnings from multiple sources', () => {
    const structure: StructureValidationResult = {
      valid: true,
      registries: [
        {
          registry: 'skills',
          valid: true,
          errors: [],
          warnings: ['Warning 1'],
        },
      ],
    }

    const links: LinkValidationResult[] = [
      {
        file: '/kb/README.md',
        valid: true,
        errors: [],
        warnings: ['Warning 2'],
      },
    ]

    const metadata: MetadataValidationResult[] = [
      {
        file: '/kb/.pair/adoption/tech-stack.md',
        valid: true,
        errors: [],
        warnings: ['Warning 3'],
      },
    ]

    const report = createValidationReport({ structure, links, metadata })

    expect(report.summary.totalWarnings).toBe(3)
    expect(report.summary.totalErrors).toBe(0)
    expect(report.exitCode).toBe(ValidationExitCode.Success)
  })

  it('should handle empty results', () => {
    const report = createValidationReport({})

    expect(report.summary.totalErrors).toBe(0)
    expect(report.summary.totalWarnings).toBe(0)
    expect(report.exitCode).toBe(ValidationExitCode.Success)
  })
})

describe('formatReport', () => {
  it('should format report with success message', () => {
    const structure: StructureValidationResult = {
      valid: true,
      registries: [
        {
          registry: 'skills',
          valid: true,
          errors: [],
          warnings: [],
        },
      ],
    }

    const report = createValidationReport({ structure })
    const formatted = formatReport(report)

    expect(formatted).toContain('KB Validation Report')
    expect(formatted).toContain('✓ skills')
    expect(formatted).toContain('Errors:   0')
    expect(formatted).toContain('Warnings: 0')
    expect(formatted).toContain('✓ Validation passed')
  })

  it('should format report with errors', () => {
    const structure: StructureValidationResult = {
      valid: false,
      registries: [
        {
          registry: 'skills',
          valid: false,
          errors: ['Path does not exist'],
          warnings: [],
        },
      ],
    }

    const report = createValidationReport({ structure })
    const formatted = formatReport(report)

    expect(formatted).toContain('✗ skills')
    expect(formatted).toContain('ERROR: Path does not exist')
    expect(formatted).toContain('Errors:   1')
    expect(formatted).toContain('✗ Validation failed')
  })

  it('should format report with warnings', () => {
    const structure: StructureValidationResult = {
      valid: true,
      registries: [
        {
          registry: 'skills',
          valid: true,
          errors: [],
          warnings: ['Directory is empty'],
        },
      ],
    }

    const report = createValidationReport({ structure })
    const formatted = formatReport(report)

    expect(formatted).toContain('WARNING: Directory is empty')
    expect(formatted).toContain('Warnings: 1')
  })

  it('should format link validation results', () => {
    const links: LinkValidationResult[] = [
      {
        file: '/kb/README.md',
        valid: false,
        errors: ['Broken internal link: ./missing.md'],
        warnings: [],
      },
    ]

    const report = createValidationReport({ links })
    const formatted = formatReport(report)

    expect(formatted).toContain('Link Validation:')
    expect(formatted).toContain('/kb/README.md')
    expect(formatted).toContain('ERROR: Broken internal link: ./missing.md')
  })

  it('should format metadata validation results', () => {
    const metadata: MetadataValidationResult[] = [
      {
        file: '/kb/.skills/bootstrap.md',
        valid: false,
        errors: ['Missing required frontmatter field: name'],
        warnings: [],
      },
    ]

    const report = createValidationReport({ metadata })
    const formatted = formatReport(report)

    expect(formatted).toContain('Metadata Validation:')
    expect(formatted).toContain('/kb/.skills/bootstrap.md')
    expect(formatted).toContain('ERROR: Missing required frontmatter field: name')
  })

  it('should format comprehensive report', () => {
    const structure: StructureValidationResult = {
      valid: false,
      registries: [
        {
          registry: 'skills',
          valid: false,
          errors: ['Structure error'],
          warnings: ['Structure warning'],
        },
      ],
    }

    const links: LinkValidationResult[] = [
      {
        file: '/kb/README.md',
        valid: false,
        errors: ['Link error'],
        warnings: ['Link warning'],
      },
    ]

    const metadata: MetadataValidationResult[] = [
      {
        file: '/kb/.skills/bootstrap.md',
        valid: false,
        errors: ['Metadata error'],
        warnings: ['Metadata warning'],
      },
    ]

    const report = createValidationReport({ structure, links, metadata })
    const formatted = formatReport(report)

    expect(formatted).toContain('Structure Validation:')
    expect(formatted).toContain('Link Validation:')
    expect(formatted).toContain('Metadata Validation:')
    expect(formatted).toContain('Errors:   3')
    expect(formatted).toContain('Warnings: 3')
  })

  it('should skip sections with no issues', () => {
    const links: LinkValidationResult[] = [
      {
        file: '/kb/README.md',
        valid: true,
        errors: [],
        warnings: [],
      },
    ]

    const report = createValidationReport({ links })
    const formatted = formatReport(report)

    // Should not show files with no errors or warnings
    expect(formatted).not.toContain('/kb/README.md')
  })
})
