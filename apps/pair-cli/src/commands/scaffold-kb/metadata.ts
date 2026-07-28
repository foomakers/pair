/**
 * Commander.js metadata for scaffold-kb command
 */
export const scaffoldKbMetadata = {
  name: 'scaffold-kb',
  description: 'Scaffold an external knowledge base repository (pure KB + release script)',
  usage: 'pair scaffold-kb [path] [options]',
  examples: [
    'pair scaffold-kb                          # Scaffold a KB repo in the current directory',
    'pair scaffold-kb ../acme-kb               # Scaffold into another directory',
    'pair scaffold-kb ../acme-kb --name "Acme KB"  # Set the KB name explicitly',
    'pair scaffold-kb --host generic            # Non-GitHub host: release script only',
    'pair scaffold-kb --force                   # Regenerate scaffold-owned files without asking',
  ],
  options: [
    {
      flags: '[path]',
      description: 'Target directory for the KB repo (default: current directory)',
    },
    {
      flags: '--name <name>',
      description: 'KB name (default: derived from the target directory name)',
    },
    {
      flags: '--host <host>',
      description: 'Code host for release automation: github or generic (default: github)',
    },
    {
      flags: '-f, --force',
      description: 'Regenerate scaffold-owned files without confirmation',
    },
  ],
  notes: [
    'Creates a pure KB repo: .pair/knowledge/ + .skills/ (no .pair/adoption/)',
    'Generates pair.config.json, README.md, .gitignore and scripts/release.sh',
    'The release script wraps the existing `pair package` command — no new release mechanism',
    'GitHub host also generates .github/workflows/release.yml (tag v* → release with ZIP)',
    'Idempotent: re-running keeps authored KB content and asks before regenerating its own files',
  ],
} as const
