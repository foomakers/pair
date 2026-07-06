/**
 * Maps a KB version jump to its docs migration page.
 * Single source of truth for the docs URL pattern (D20: one page per version
 * jump, no migration logic in the CLI) — kept isolated so a docs-structure
 * change only requires updating this file.
 */
const DOCS_MIGRATIONS_BASE = 'https://pair.foomakers.com/docs/guides/migrations'

function stripLeadingV(version: string): string {
  return version.replace(/^v/i, '')
}

/** Docs page URL for the migration prompt covering `fromVersion` -> `toVersion`. */
export function buildMigrationUrl(fromVersion: string, toVersion: string): string {
  return `${DOCS_MIGRATIONS_BASE}/v${stripLeadingV(fromVersion)}-to-v${stripLeadingV(toVersion)}`
}

/** Docs index listing all published migration pages. */
export function migrationsIndexUrl(): string {
  return DOCS_MIGRATIONS_BASE
}
