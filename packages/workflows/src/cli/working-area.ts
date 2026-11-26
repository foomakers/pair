/** Operational data lives outside registry sources and targets (D14). */
export const DEFAULT_WORKING_PATH = '.pair/working'

/** The project-relative working area declared in the top-level Pair config. */
export function resolveWorkingPathOverride(config: unknown): string {
  const raw = (config as { working_path?: unknown } | undefined)?.working_path
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : DEFAULT_WORKING_PATH
}
