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
    'pair kb-validate --optional-link-patterns "../../apps/**,../../packages/**"',
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
      description:
        'Zero tolerance: optional link patterns are discarded, every missing link target is an error',
    },
    {
      flags: '--ignore-config',
      description:
        'Consult no config: no registries resolve, so no files are collected or validated',
    },
    {
      flags: '--skip-registries <names>',
      description: 'Comma-separated registry names to exclude from validation',
    },
    {
      flags: '--optional-link-patterns <patterns>',
      description:
        'Comma-separated globs whose missing link targets are warnings, not errors (merged with link_validation.optional_link_patterns)',
    },
  ],
  notes: [
    'Validates .pair directory structure',
    'Returns exit code 0 if valid, 1 if errors found, 2 if validation fails',
    'Target layout validation skips symlink targets',
    'No network requests are made: external http/https links are never fetched, with or without --strict',
    'Optional link patterns downgrade MISSING targets to warnings; --strict overrides them back to errors',
  ],
} as const
