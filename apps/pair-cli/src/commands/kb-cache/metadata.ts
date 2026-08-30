/** Commander.js metadata for the kb-cache command. */
export const kbCacheCommandMetadata = {
  name: 'kb-cache',
  description: 'Inspect and prune the shared KB cache under ~/.pair/kb',
  usage: 'pair-cli kb-cache [list|prune] [options]',
  examples: [
    'pair-cli kb-cache                      # same as list',
    'pair-cli kb-cache list                 # every slot: kind, label, size',
    'pair-cli kb-cache list --json          # machine-readable inventory',
    'pair-cli kb-cache prune --dry-run      # what prune WOULD remove',
    'pair-cli kb-cache prune                # remove the stale slots',
  ],
  options: [
    { flags: '[action]', description: 'list (default) or prune' },
    { flags: '--json', description: 'Output as JSON' },
    { flags: '--dry-run', description: 'prune only: report what would be removed, delete nothing' },
    {
      flags: '-l, --log-level <level>',
      description: 'Set minimum log level (debug|info|warn|error)',
    },
  ],
  notes: [
    'The cache is machine-wide and shared by every project: ~/.pair/kb (or $PAIR_KB_CACHE_DIR)',
    'prune removes: official KB slots of other CLI versions, .bak backups, abandoned .tmp-<pid> stages, and pre-#395 git clones at the root',
    'prune NEVER removes an external slot — one per source you installed from, and nothing here can tell which you still need',
    'Exit code 0: success; 1: error',
  ],
} as const
