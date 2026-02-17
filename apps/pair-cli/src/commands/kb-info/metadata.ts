/**
 * Commander.js metadata for kb-info command
 */
export const kbInfoCommandMetadata = {
  name: 'kb-info',
  description: 'Display metadata from a KB package ZIP file',
  usage: 'pair kb-info <package-path> [options]',
  examples: [
    'pair kb-info my-kb.zip                          # Display package metadata',
    'pair kb-info my-kb.zip --json                    # Output as JSON',
    'pair kb-info dist/kb-v1.0.0.zip                  # Inspect specific package',
  ],
  options: [
    { flags: '--json', description: 'Output package metadata as JSON' },
    {
      flags: '-l, --log-level <level>',
      description: 'Set minimum log level (debug|info|warn|error)',
    },
  ],
  notes: [
    'Reads manifest.json from the KB package ZIP without extracting full content',
    'Displays organizational metadata when present in manifest',
    'Exit code 0: success, 1: error (file not found, invalid ZIP, missing manifest)',
  ],
} as const
