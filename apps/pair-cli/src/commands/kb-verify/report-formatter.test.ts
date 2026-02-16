import { describe, it, expect } from 'vitest'
import { formatHumanReadable, formatJSON } from './report-formatter'
import type { VerificationReport } from './report-formatter'

describe('formatHumanReadable', () => {
  it('formats report with all checks passing', () => {
    const report: VerificationReport = {
      package: 'test-package.zip',
      timestamp: '2025-01-01T12:00:00Z',
      checks: {
        checksum: {
          status: 'PASS',
          expected: 'abc123',
          actual: 'abc123',
          algorithm: 'SHA-256',
        },
        structure: {
          status: 'PASS',
          requiredPaths: ['knowledge', 'adoption'],
          missingPaths: [],
        },
        manifest: {
          status: 'PASS',
          errors: [],
        },
      },
      overall: 'PASS',
    }

    const output = formatHumanReadable(report)

    expect(output).toContain('Package Verification Report')
    expect(output).toContain('Package:   test-package.zip')
    expect(output).toContain('Checksum (SHA-256): PASS')
    expect(output).toContain('Structure: PASS')
    expect(output).toContain('Manifest: PASS')
    expect(output).toContain('Overall Result: PASS')
    expect(output).not.toContain('Expected:')
    expect(output).not.toContain('Missing paths:')
  })

  it('formats report with checksum failure', () => {
    const report: VerificationReport = {
      package: 'test-package.zip',
      timestamp: '2025-01-01T12:00:00Z',
      checks: {
        checksum: {
          status: 'FAIL',
          expected: 'abc123',
          actual: 'def456',
          algorithm: 'SHA-256',
        },
        structure: {
          status: 'PASS',
          requiredPaths: ['knowledge'],
          missingPaths: [],
        },
        manifest: {
          status: 'PASS',
          errors: [],
        },
      },
      overall: 'FAIL',
    }

    const output = formatHumanReadable(report)

    expect(output).toContain('Checksum (SHA-256): FAIL')
    expect(output).toContain('Expected: abc123')
    expect(output).toContain('Actual:   def456')
    expect(output).toContain('Overall Result: FAIL')
  })

  it('formats report with structure failure', () => {
    const report: VerificationReport = {
      package: 'test-package.zip',
      timestamp: '2025-01-01T12:00:00Z',
      checks: {
        checksum: {
          status: 'PASS',
          expected: 'abc123',
          actual: 'abc123',
          algorithm: 'SHA-256',
        },
        structure: {
          status: 'FAIL',
          requiredPaths: ['knowledge', 'adoption', 'guidelines'],
          missingPaths: ['adoption', 'guidelines'],
        },
        manifest: {
          status: 'PASS',
          errors: [],
        },
      },
      overall: 'FAIL',
    }

    const output = formatHumanReadable(report)

    expect(output).toContain('Structure: FAIL')
    expect(output).toContain('Missing paths: adoption, guidelines')
    expect(output).toContain('Overall Result: FAIL')
  })

  it('formats report with manifest failure', () => {
    const report: VerificationReport = {
      package: 'test-package.zip',
      timestamp: '2025-01-01T12:00:00Z',
      checks: {
        checksum: {
          status: 'PASS',
          expected: 'abc123',
          actual: 'abc123',
          algorithm: 'SHA-256',
        },
        structure: {
          status: 'PASS',
          requiredPaths: ['knowledge'],
          missingPaths: [],
        },
        manifest: {
          status: 'FAIL',
          errors: ['Missing or invalid field: name', 'Missing or invalid field: version'],
        },
      },
      overall: 'FAIL',
    }

    const output = formatHumanReadable(report)

    expect(output).toContain('Manifest: FAIL')
    expect(output).toContain('- Missing or invalid field: name')
    expect(output).toContain('- Missing or invalid field: version')
    expect(output).toContain('Overall Result: FAIL')
  })

  it('formats report with all checks failing', () => {
    const report: VerificationReport = {
      package: 'bad-package.zip',
      timestamp: '2025-01-01T12:00:00Z',
      checks: {
        checksum: {
          status: 'FAIL',
          expected: 'abc123',
          actual: 'wrong',
          algorithm: 'SHA-256',
        },
        structure: {
          status: 'FAIL',
          requiredPaths: ['knowledge'],
          missingPaths: ['knowledge'],
        },
        manifest: {
          status: 'FAIL',
          errors: ['Manifest is not a valid object'],
        },
      },
      overall: 'FAIL',
    }

    const output = formatHumanReadable(report)

    expect(output).toContain('Checksum (SHA-256): FAIL')
    expect(output).toContain('Structure: FAIL')
    expect(output).toContain('Manifest: FAIL')
    expect(output).toContain('Overall Result: FAIL')
  })

  it('includes separator lines', () => {
    const report: VerificationReport = {
      package: 'test.zip',
      timestamp: '2025-01-01T12:00:00Z',
      checks: {
        checksum: { status: 'PASS', expected: 'a', actual: 'a', algorithm: 'SHA-256' },
        structure: { status: 'PASS', requiredPaths: [], missingPaths: [] },
        manifest: { status: 'PASS', errors: [] },
      },
      overall: 'PASS',
    }

    const output = formatHumanReadable(report)

    expect(output).toContain('='.repeat(60))
  })
})

describe('formatJSON', () => {
  it('outputs valid JSON', () => {
    const report: VerificationReport = {
      package: 'test-package.zip',
      timestamp: '2025-01-01T12:00:00Z',
      checks: {
        checksum: {
          status: 'PASS',
          expected: 'abc123',
          actual: 'abc123',
          algorithm: 'SHA-256',
        },
        structure: {
          status: 'PASS',
          requiredPaths: ['knowledge'],
          missingPaths: [],
        },
        manifest: {
          status: 'PASS',
          errors: [],
        },
      },
      overall: 'PASS',
    }

    const output = formatJSON(report)

    expect(() => JSON.parse(output)).not.toThrow()
  })

  it('preserves all report data', () => {
    const report: VerificationReport = {
      package: 'test-package.zip',
      timestamp: '2025-01-01T12:00:00Z',
      checks: {
        checksum: {
          status: 'FAIL',
          expected: 'abc123',
          actual: 'def456',
          algorithm: 'SHA-256',
        },
        structure: {
          status: 'FAIL',
          requiredPaths: ['knowledge', 'adoption'],
          missingPaths: ['adoption'],
        },
        manifest: {
          status: 'FAIL',
          errors: ['Missing or invalid field: name'],
        },
      },
      overall: 'FAIL',
    }

    const output = formatJSON(report)
    const parsed = JSON.parse(output)

    expect(parsed.package).toBe('test-package.zip')
    expect(parsed.timestamp).toBe('2025-01-01T12:00:00Z')
    expect(parsed.checks.checksum.status).toBe('FAIL')
    expect(parsed.checks.checksum.expected).toBe('abc123')
    expect(parsed.checks.checksum.actual).toBe('def456')
    expect(parsed.checks.structure.missingPaths).toEqual(['adoption'])
    expect(parsed.checks.manifest.errors).toEqual(['Missing or invalid field: name'])
    expect(parsed.overall).toBe('FAIL')
  })

  it('formats JSON with indentation', () => {
    const report: VerificationReport = {
      package: 'test.zip',
      timestamp: '2025-01-01T12:00:00Z',
      checks: {
        checksum: { status: 'PASS', expected: 'a', actual: 'a', algorithm: 'SHA-256' },
        structure: { status: 'PASS', requiredPaths: [], missingPaths: [] },
        manifest: { status: 'PASS', errors: [] },
      },
      overall: 'PASS',
    }

    const output = formatJSON(report)

    // JSON.stringify with indent=2 produces multi-line output
    expect(output.split('\n').length).toBeGreaterThan(1)
    expect(output).toContain('  ') // Should have indentation
  })
})
