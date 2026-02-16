/**
 * Locale-independent path comparator for deterministic file ordering.
 * Used by both package creation (zip-creator) and verification (checksum-check)
 * to ensure consistent SHA-256 checksum calculation.
 */
export function comparePathsDeterministic(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
