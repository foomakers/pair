export interface ManifestMetadata {
  name: string
  version: string
  description: string
  author: string
  tags: string[]
  license: string
  created_at: string
  registries: string[]
  contentChecksum?: string
}

export type PartialManifestMetadata = Partial<Omit<ManifestMetadata, 'created_at' | 'registries'>>

function defaultManifestFields(): Pick<
  ManifestMetadata,
  'name' | 'version' | 'description' | 'author' | 'tags' | 'license'
> {
  return {
    name: 'kb-package',
    version: '1.0.0',
    description: 'Knowledge base package',
    author: 'unknown',
    tags: [],
    license: 'MIT',
  }
}

/**
 * Generate manifest metadata for ZIP package
 * Merges CLI params with defaults
 * Precedence: CLI params > defaults
 */
export function generateManifestMetadata(
  registries: string[],
  cliParams: PartialManifestMetadata = {},
): ManifestMetadata {
  const defaults = defaultManifestFields()
  return {
    name: cliParams.name ?? defaults.name,
    version: cliParams.version ?? defaults.version,
    description: cliParams.description ?? defaults.description,
    author: cliParams.author ?? defaults.author,
    tags: cliParams.tags ?? defaults.tags,
    license: cliParams.license ?? defaults.license,
    created_at: new Date().toISOString(),
    registries,
  }
}

/**
 * Commander.js metadata for package command
 */
export const packageCommandMetadata = {
  name: 'package',
  description: 'Package KB content into validated ZIP file for distribution',
  usage: 'pair package [options]',
  examples: [
    'pair package                                   # Package current directory',
    'pair package -o dist/kb-v1.0.0.zip            # Package with custom output path',
    'pair package -s ./kb-content -o kb.zip        # Package specific source directory',
    'pair package --name "My KB" --version 1.0.0   # Package with metadata',
    'pair package --layout source                   # Package from source layout',
    'pair package --skip-registries adoption        # Skip adoption registry',
    'pair package --root /my/kb                     # Set custom root for link relativization',
    'pair package --log-level debug                 # Package with detailed logging',
    'pair package --interactive                      # Create package with guided prompts',
    'pair package --interactive --name "my-kb"       # Interactive with pre-filled name',
    'pair package --tags "ai,devops" --license MIT   # Package with tags and license',
  ],
  options: [
    { flags: '-o, --output <path>', description: 'Output ZIP file path (default: kb-package.zip)' },
    {
      flags: '-s, --source-dir <path>',
      description: 'Source directory to package (default: current directory)',
    },
    { flags: '-c, --config <path>', description: 'Path to config.json file' },
    { flags: '--name <name>', description: 'Package name for manifest' },
    { flags: '--pkg-version <version>', description: 'Package version for manifest' },
    { flags: '--description <description>', description: 'Package description for manifest' },
    { flags: '--author <author>', description: 'Package author for manifest' },
    {
      flags: '--layout <mode>',
      description: 'KB layout to package: source or target (default: target)',
    },
    {
      flags: '--skip-registries <names>',
      description: 'Comma-separated registry names to exclude from packaging',
    },
    {
      flags: '--root <path>',
      description: 'Root path for link relativization (default: .pair/)',
    },
    {
      flags: '-l, --log-level <level>',
      description: 'Set minimum log level (debug|info|warn|error)',
    },
    {
      flags: '-i, --interactive',
      description: 'Enter interactive mode with guided prompts for package metadata',
    },
    {
      flags: '--tags <tags>',
      description: 'Comma-separated tags for the package (e.g., "ai,devops,testing")',
    },
    {
      flags: '--license <license>',
      description: 'Package license (default: MIT)',
    },
  ],
  notes: [
    'Validates KB structure before packaging (.pair directory required)',
    'Creates manifest with package metadata',
    'Output ZIP includes all KB content and assets',
    'Target layout transforms target→source based on config mappings',
    'Absolute links transformed to relative paths (relative to --root)',
  ],
} as const
