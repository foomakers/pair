/** Commander.js metadata for the tokens command. */
export const tokensCommandMetadata = {
  name: 'tokens',
  description: 'Count words and approximate tokens of the markdown the agents load, per area',
  usage: 'pair-cli tokens [options]',
  examples: [
    'pair-cli tokens                        # every area, current directory',
    'pair-cli tokens --area skills          # one area',
    'pair-cli tokens --json > base.json     # record a baseline',
    'pair-cli tokens --baseline base.json   # delta vs that baseline',
    'pair-cli tokens --root ../other --json # machine-readable report',
  ],
  options: [
    { flags: '--root <dir>', description: 'Project root (default: current directory)' },
    {
      flags: '--area <name>',
      description:
        'Only this area: templates|adoption|adr|decision-log|skills|guidelines|agent-context',
    },
    { flags: '--json', description: 'Output as JSON' },
    {
      flags: '--baseline <file>',
      description:
        'A previous `--json` report, resolved against the current directory (not --root); adds the per-area and total delta against it',
    },
    {
      flags: '-l, --log-level <level>',
      description: 'Set minimum log level (debug|info|warn|error)',
    },
  ],
  notes: [
    'words = whitespace-separated count; tokens = ceil(characters / 4), an approximation — no tokenizer is used',
    'Only .md files count; an unreadable one is skipped with a warning on stderr',
    'Exit code 0: success; 1: error (e.g. unknown --area)',
  ],
} as const
