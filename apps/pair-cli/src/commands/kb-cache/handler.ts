import type { FileSystemService } from '@pair/content-ops'
import { logger } from '@pair/content-ops'
import { readCacheInventory, type CacheEntry } from './inventory'
import type { KbCacheCommandConfig } from './parser'

export interface KbCacheHandlerOptions {
  /** The running CLI version — its official slot is the one prune spares. */
  version: string
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

function renderList(entries: CacheEntry[]): void {
  if (entries.length === 0) {
    logger.info('The KB cache is empty.')
    return
  }
  const total = entries.reduce((n, e) => n + e.size, 0)
  const stale = entries.filter(e => e.staleReason)
  for (const e of entries) {
    const bits = [e.kind.padEnd(10), human(e.size).padStart(9), e.name]
    if (e.label) bits.push(`(${e.label})`)
    // Named explicitly: a leftover-shaped entry that prune keeps looks like a prune bug
    // otherwise, and the operator would reach for `rm -rf` — the very deletion this spares.
    if (e.inFlight) bits.push('— kept: an install is using it')
    if (e.staleReason) bits.push(`— stale: ${e.staleReason}`)
    logger.info(`  ${bits.join('  ')}`)
  }
  logger.info(`\n  ${entries.length} entries, ${human(total)} total.`)
  if (stale.length > 0)
    logger.info(
      `  ${stale.length} prunable (${human(stale.reduce((n, e) => n + e.size, 0))}) — run \`pair-cli kb-cache prune\`.`,
    )
}

async function runPrune(
  stale: CacheEntry[],
  fs: FileSystemService,
  config: KbCacheCommandConfig,
): Promise<number> {
  const freed = stale.reduce((n, e) => n + e.size, 0)

  if (config.dryRun) {
    if (config.json) console.log(JSON.stringify({ wouldRemove: stale, freed }, null, 2))
    else {
      for (const e of stale) logger.info(`  would remove  ${e.path}  (${e.staleReason})`)
      logger.info(`\n  ${stale.length} entries, ${human(freed)} would be freed.`)
    }
    return 0
  }

  const removed: CacheEntry[] = []
  for (const e of stale) {
    // Deleting from a machine-wide shared cache: one failure must not abort the rest, and it
    // must be visible. A silent partial prune reporting a total is worse than a loud one.
    try {
      await fs.rm?.(e.path, { recursive: true, force: true })
      removed.push(e)
      logger.info(`  removed  ${e.path}  (${e.staleReason})`)
    } catch (err) {
      logger.warn(`  FAILED to remove ${e.path}: ${err instanceof Error ? err.message : err}`)
    }
  }

  const freedActual = removed.reduce((n, e) => n + e.size, 0)
  if (config.json) console.log(JSON.stringify({ removed, freed: freedActual }, null, 2))
  else logger.info(`\n  Removed ${removed.length} of ${stale.length}, freed ${human(freedActual)}.`)
  // A prune that could not remove everything it identified did not do what it reported.
  return removed.length === stale.length ? 0 : 1
}

export async function handleKbCacheCommand(
  config: KbCacheCommandConfig,
  fs: FileSystemService,
  options: KbCacheHandlerOptions,
): Promise<number> {
  try {
    const entries = await readCacheInventory(fs, options.version)

    if (config.action === 'list') {
      if (config.json) console.log(JSON.stringify({ entries }, null, 2))
      else renderList(entries)
      return 0
    }

    return await runPrune(
      entries.filter(e => e.staleReason),
      fs,
      config,
    )
  } catch (error) {
    logger.error(`kb-cache failed: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}
