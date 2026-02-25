/**
 * Commander.js metadata for kb-verify command
 */
export const kbVerifyCommandMetadata = {
  name: 'kb-verify',
  description: 'Verify KB package integrity using checksum, structure, and manifest validation',
  usage: 'pair kb-verify <package-path> [options]',
  examples: [
    'pair kb-verify kb-package.zip                  # Verify package with human-readable output',
    'pair kb-verify kb-package.zip --json            # Verify with JSON output',
    'pair kb-verify dist/kb-v1.0.0.zip               # Verify package at specific path',
  ],
  options: [
    { flags: '<package-path>', description: 'Path to the KB package ZIP file' },
    { flags: '--json', description: 'Output verification report as JSON' },
    {
      flags: '-l, --log-level <level>',
      description: 'Set minimum log level (debug|info|warn|error)',
    },
  ],
  notes: [
    'Verification checks: checksum (SHA-256), structure (registry directories), manifest (required fields)',
    'Exit code 0: all checks pass, 1: any check fails or error',
    'Checksum verification detects content tampering or corruption',
  ],
} as const
