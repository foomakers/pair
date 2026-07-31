export const kbValidateMetadata = {
  name: 'kb-validate',
  description: 'Validate Knowledge Base structure and manifest',
  // No positional argument: the KB path is `--path <path>` (excess positionals are
  // rejected CLI-wide, see cli.ts `allowExcessArguments(false)`).
  usage: 'pair kb-validate [options]',
  examples: [
    'pair kb-validate',
    'pair kb-validate --path ./my-kb',
    'pair kb-validate --layout source',
    'pair kb-validate --strict',
    'pair kb-validate --skip-registries adoption,agents',
  ],
  options: [
    {
      flags: '--path <path>',
      description: 'Path to knowledge base directory (defaults to current directory)',
    },
    {
      flags: '--layout <mode>',
      description: 'KB layout to validate: source or target (default: target)',
    },
    {
      flags: '--strict',
      description: 'Enable strict validation (checks external links via HTTP HEAD)',
    },
    {
      flags: '--ignore-config',
      description: 'Skip config-based registry structure validation',
    },
    {
      flags: '--skip-registries <names>',
      description: 'Comma-separated registry names to exclude from validation',
    },
  ],
  notes: [
    'Validates .pair directory structure',
    'Returns exit code 0 if valid, 1 if errors found, 2 if validation fails',
    'Target layout validation skips symlink targets',
    'Use --strict for external link validation (requires network)',
  ],
} as const
