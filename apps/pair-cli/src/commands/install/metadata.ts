export const installMetadata = {
  name: 'install',
  description: 'Install documentation and assets from Knowledge Base source',
  usage: 'pair install [target] [options]',
  examples: [
    'pair install                                    # Install from default source',
    'pair install --source https://github.com/org/repo/releases/download/v1.0/kb.zip',
    'pair install --source /absolute/path/to/kb     # Install from local directory',
    'pair install --source ./relative/path/to/kb    # Install from relative directory',
    'pair install --offline --source /local/kb      # Install offline from local source',
    'pair install --list-targets                    # List available asset registries',
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
      description: 'Link style: relative, absolute, or auto (default: relative)',
    },
  ],
  notes: [
    'Default source: monorepo uses packages/knowledge-hub/dataset/',
    'Release mode: downloads from GitHub release ZIP',
    '--source accepts: http(s) URLs, absolute paths, relative paths',
    'Relative paths resolved from current working directory',
    '--offline requires explicit local --source path',
  ],
} as const
