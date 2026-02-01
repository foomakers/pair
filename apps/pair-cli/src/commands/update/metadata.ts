export const updateMetadata = {
  name: 'update',
  description: 'Update documentation and assets from Knowledge Base source',
  usage: 'pair update [target] [options]',
  examples: [
    'pair update                                     # Update from default source',
    'pair update --source https://example.com/kb.zip # Update from remote URL',
    'pair update --source /absolute/path/to/kb      # Update from local directory',
    'pair update --source ./relative/kb             # Update from relative path',
    'pair update --offline --source /local/kb       # Update offline mode',
    'pair update --list-targets                     # List available targets',
  ],
  options: [
    { flags: '[target]', description: 'Target folder (omit to use defaults from config)' },
    { flags: '-c, --config <file>', description: 'Path to config file' },
    {
      flags: '--source <path|url>',
      description: 'KB source: URL (http/https), absolute path, or relative path',
    },
    { flags: '--offline', description: 'Prevent network access (requires local --source)' },
    { flags: '--list-targets', description: 'List available target folders and descriptions' },
    {
      flags: '--link-style <style>',
      description: 'Link style: relative, absolute, or auto (default: auto-detect)',
    },
    { flags: '--persist-backup', description: 'Keep backup files after successful update' },
    {
      flags: '--auto-rollback',
      description: 'Automatically restore from backup on error (default: true)',
      defaultValue: true,
    },
  ],
  notes: [
    'Default source: monorepo uses packages/knowledge-hub/dataset/',
    'Release mode: downloads from GitHub release ZIP',
    '--source accepts: http(s) URLs, absolute paths, relative paths',
    'Relative paths resolved from current working directory',
    '--offline requires explicit local --source path',
    'Creates automatic backup before update',
  ],
} as const
