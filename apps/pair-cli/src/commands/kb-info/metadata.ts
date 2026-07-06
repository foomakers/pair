/**
 * Commander.js metadata for kb-info command
 */
export const kbInfoCommandMetadata = {
  name: 'kb-info',
  description: 'Display KB package metadata, or check installed vs current KB version',
  usage: 'pair kb-info [package-path] [options]',
  examples: [
    'pair kb-info my-kb.zip                          # Display package metadata',
    'pair kb-info my-kb.zip --json                    # Output as JSON',
    'pair kb-info dist/kb-v1.0.0.zip                  # Inspect specific package',
    'pair kb-info                                     # Check installed vs current KB version',
    'pair kb-info --json                              # Version check, JSON output',
    'pair kb-info --source /path/to/kb                # Version check against a custom source',
  ],
  options: [
    {
      flags: '[package-path]',
      description: 'Path to a KB package ZIP file (omit for version check)',
    },
    { flags: '--json', description: 'Output metadata or version-check result as JSON' },
    {
      flags: '--source <path|url>',
      description: 'KB source to resolve the current version from (version-check mode only)',
    },
    {
      flags: '-l, --log-level <level>',
      description: 'Set minimum log level (debug|info|warn|error)',
    },
  ],
  notes: [
    'With a package-path: reads manifest.json from the KB package ZIP without extracting full content',
    "Without a package-path: compares the project's installed KB version against the current one",
    'Version check is metadata-only — never performs migration',
    'Exit code 0: success (including drift/unknown/unavailable); 1: error',
  ],
} as const
