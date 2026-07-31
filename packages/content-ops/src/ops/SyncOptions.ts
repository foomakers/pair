import { Behavior, TargetConfig } from './behavior'

/**
 * Options for controlling file move/copy operations
 */

export type SyncOptions = {
  /** Default behavior for file operations */
  defaultBehavior: Behavior
  /** Folder-specific behaviors (derived from include + behavior) */
  folderBehavior?: Record<string, Behavior>
  /** Maximum number of concurrent file operations */
  concurrencyLimit: number
  /** Retry configuration for failed I/O operations */
  retryAttempts: number
  /** Delay between retry attempts in milliseconds */
  retryDelay: number
  /** Folders to include when behavior is mirror (empty = include all) */
  include: string[]
  /** Flatten directory hierarchy into hyphen-separated names */
  flatten: boolean
  /**
   * Bound flattening to the registry's ENTRY granularity: only the first
   * `flattenDepth` segments are joined, deeper ones stay a real sub-path.
   * The skills registry's entries are two segments (`process/review`), so a
   * third is content *of* that skill — without this it installed as the sibling
   * `pair-process-review-references/` with both relative links dead (#407).
   * Omitted ⇒ every separator is flattened, exactly as before.
   */
  flattenDepth?: number

  /**
   * Registry entries this copy must NOT install, as source-relative paths
   * (`process/setup`). An entry's whole subtree is skipped.
   *
   * Why it exists (#277): the Claude Code marketplace channel ships a setup skill
   * that must exist ONLY when installed from the marketplace — if the CLI also
   * wrote it into the project, the same skill name would answer from two trees
   * (`~/.claude/plugins/cache` and the project's `.claude/skills/`) and the
   * resolution order between them is unspecified.
   *
   * Matching is per PATH SEGMENT, never a string prefix: excluding
   * `process/setup` must not also drop `process/setup-helper`.
   *
   * NOTE: this prevents WRITING an entry, not having it. The skills registry runs
   * `behavior: overwrite`, which performs no cleanup, so an excluded entry that is
   * already present in a target is left untouched.
   */
  exclude?: string[]
  /** Prefix to prepend to top-level directory names */
  prefix?: string
  /** Target configurations for multi-target distribution (empty array = no targets) */
  targets: TargetConfig[]
}

export function defaultSyncOptions(): SyncOptions {
  return {
    defaultBehavior: 'overwrite',
    concurrencyLimit: 10,
    retryAttempts: 3,
    retryDelay: 100,
    include: [],
    flatten: false,
    targets: [],
  }
}
