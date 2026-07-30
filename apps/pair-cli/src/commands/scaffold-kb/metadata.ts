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
  // One note per line: each entry is rendered as its own bullet by `pair scaffold-kb --help`,
  // so a note must never be a sentence fragment continued in the next entry.
  notes: [
    'Creates a pure KB repo: .pair/knowledge/ + .skills/ (no .pair/adoption/)',
    'Generates pair.config.json, README.md, .gitignore and scripts/release.sh',
    'The release script wraps the existing `pair package` command — no new release mechanism',
    'GitHub host also generates .github/workflows/release.yml (tag v* → release with ZIP)',
    '--host is never inferred from the git remote: GitHub is the default',
    'Pass --host generic for GitLab, Bitbucket or self-hosted: release script, no workflow',
    'Switching --host leaves the previous host files in place: the report names them',
    'Idempotent: re-running keeps authored KB content and asks before regenerating its own files',
    'Refuses to scaffold into a configured project (.pair/adoption/ present), even with --force',
    'Consumers install with: install --source <git-url-or-path>',
    '--source <zip> is not yet equivalent (shares the KB cache slot — foomakers/pair#395)',
    'Human-facing report only: no --json output (interactive command; ask if you need it)',
  ],
} as const
