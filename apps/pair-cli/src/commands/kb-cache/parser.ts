export interface KbCacheCommandConfig {
  command: 'kb-cache'
  action: 'list' | 'prune'
  json: boolean
  /** `prune` reports what it WOULD remove and deletes nothing. */
  dryRun: boolean
}

export interface ParseKbCacheOptions {
  json?: boolean
  dryRun?: boolean
}

const ACTIONS = ['list', 'prune'] as const

export function parseKbCacheCommand(
  options: ParseKbCacheOptions = {},
  args: string[] = [],
): KbCacheCommandConfig {
  const a = (args[0] ?? 'list').trim()
  if (!(ACTIONS as readonly string[]).includes(a)) {
    throw new Error(
      `Unknown kb-cache action "${a}". Expected one of: ${ACTIONS.join(', ')}.\n\n` +
        `  pair kb-cache list    show every cache slot, its kind and size\n` +
        `  pair kb-cache prune   remove stale slots (external slots are never removed)`,
    )
  }
  return {
    command: 'kb-cache',
    action: a as 'list' | 'prune',
    json: options.json === true,
    dryRun: options.dryRun === true,
  }
}
