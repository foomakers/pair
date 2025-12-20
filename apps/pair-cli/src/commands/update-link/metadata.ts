export const updateLinkMetadata = {
  name: 'update-link',
  description: 'Validate and update links in installed Knowledge Base content',
  usage: 'pair update-link [options]',
  examples: [
    'pair update-link                      # Validate and convert links to relative paths',
    'pair update-link --dry-run            # Preview changes without modifying files',
    'pair update-link --absolute           # Convert all links to absolute paths',
    'pair update-link --verbose            # Show detailed processing logs',
  ],
  options: [
    { flags: '--relative', description: 'Convert all links to relative paths (default)' },
    { flags: '--absolute', description: 'Convert all links to absolute paths' },
    { flags: '--dry-run', description: 'Show what would be changed without modifying files' },
    { flags: '--verbose', description: 'Show detailed processing information' },
  ],
  notes: [
    'Default behavior converts all links to relative paths',
    'Creates automatic backup before modifications',
    'Skips external URLs and mailto links',
    'Processes all markdown files in .pair/ directory',
    'See also: docs/getting-started/05-cli-update-link.md',
  ],
} as const
