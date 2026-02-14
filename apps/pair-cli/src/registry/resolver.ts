import { FileSystemService, Behavior, type TargetConfig } from '@pair/content-ops'

/**
 * Unified configuration for an individual asset registry.
 * `targets` must have at least one entry with mode 'canonical'.
 */
export interface RegistryConfig {
  source: string
  behavior: Behavior
  description: string
  include: string[]
  flatten: boolean
  prefix?: string
  targets: TargetConfig[]
}

/**
 * The root CLI configuration structure.
 */
export interface Config {
  asset_registries: Record<string, RegistryConfig>
  [key: string]: unknown
}

/**
 * Extracts and normalizes asset registries from a configuration object.
 * Supports both 'asset_registries' and legacy 'dataset_registries' fields.
 * Normalizes legacy 'target_path' into 'targets' array for backward compatibility.
 */
export function extractRegistries(config: unknown): Record<string, RegistryConfig> {
  const cfg = config as Config
  const raw =
    cfg?.asset_registries || (config as Record<string, unknown>)?.['dataset_registries'] || {}
  const registries = raw as unknown as Record<string, Record<string, unknown>>
  const result: Record<string, RegistryConfig> = {}

  for (const [name, reg] of Object.entries(registries)) {
    if (reg && typeof reg === 'object' && !Array.isArray(reg)) {
      result[name] = normalizeRegistryConfig(name, reg as Record<string, unknown>)
    } else {
      // Pass through invalid entries as-is for validation to catch
      result[name] = reg as unknown as RegistryConfig
    }
  }

  return result
}

/**
 * Normalize a raw registry config, applying defaults and migrating legacy fields.
 */
function normalizeRegistryConfig(name: string, raw: Record<string, unknown>): RegistryConfig {
  const targets = normalizeTargets(name, raw)

  return {
    source: raw['source'] != null ? String(raw['source']) : name,
    behavior: (raw['behavior'] as Behavior) || 'mirror',
    description: String(raw['description'] || ''),
    include: Array.isArray(raw['include']) ? (raw['include'] as string[]) : [],
    flatten: typeof raw['flatten'] === 'boolean' ? raw['flatten'] : false,
    ...(raw['prefix'] != null && { prefix: String(raw['prefix']) }),
    targets,
  }
}

/**
 * Build targets array from raw config.
 * Migrates legacy target_path to targets if targets is absent.
 */
function normalizeTargets(name: string, raw: Record<string, unknown>): TargetConfig[] {
  if (Array.isArray(raw['targets']) && raw['targets'].length > 0) {
    return raw['targets'] as TargetConfig[]
  }
  const legacyPath = raw['target_path'] as string | undefined
  const path = legacyPath || name
  return [{ path, mode: 'canonical' as const }]
}

/**
 * Calculates the final target path for a registry.
 * Uses the canonical target path from targets array, falls back to registry name.
 */
export function resolveTarget(
  name: string,
  config: RegistryConfig,
  fs: FileSystemService,
  baseTarget?: string,
): string {
  const canonical = config.targets.find(t => t.mode === 'canonical')
  const relativePath = canonical ? canonical.path : name
  return baseTarget ? fs.resolve(baseTarget, relativePath) : fs.resolve(relativePath)
}

/**
 * Resolves both source and target absolute paths for a registry.
 */
export function resolveRegistryPaths(params: {
  name: string
  config: RegistryConfig
  datasetRoot: string
  fs: FileSystemService
  baseTarget?: string
}): { source: string; target: string } {
  const { name, config, datasetRoot, fs, baseTarget } = params

  // Prefer a direct registry folder under datasetRoot when present (useful for
  // disjoint sources passed via --source). Otherwise use configured source.
  const directPath = fs.resolve(datasetRoot, name)
  const source = fs.existsSync(directPath) ? directPath : fs.resolve(datasetRoot, config.source)

  const target = resolveTarget(name, config, fs, baseTarget)

  return { source, target }
}

/**
 * Specialized iterator to process all registries with an async handler.
 */
export async function forEachRegistry<T>(
  registries: Record<string, RegistryConfig>,
  handler: (name: string, config: RegistryConfig, index: number) => Promise<T>,
): Promise<T[]> {
  const results: T[] = []
  const entries = Object.entries(registries)

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (entry) {
      const [name, config] = entry
      results.push(await handler(name, config, i))
    }
  }

  return results
}
