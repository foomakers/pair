import { FileSystemService, Behavior } from '@pair/content-ops'

/**
 * Unified configuration for an individual asset registry.
 */
export interface RegistryConfig {
  source?: string
  behavior: Behavior
  target_path: string
  description: string
  include?: string[]
}

/**
 * The root CLI configuration structure.
 */
export interface Config {
  asset_registries: Record<string, RegistryConfig>
  default_target_folders?: Record<string, string>
  folders_to_include?: Record<string, string[]>
  [key: string]: unknown
}

/**
 * Extracts and normalizes asset registries from a configuration object.
 * Supports both 'asset_registries' and legacy 'dataset_registries' fields.
 */
export function extractRegistries(config: unknown): Record<string, RegistryConfig> {
  const cfg = config as Config
  const registries =
    cfg?.asset_registries || (config as Record<string, unknown>)?.['dataset_registries'] || {}
  return registries as Record<string, RegistryConfig>
}

/**
 * Calculates the final target path for a registry.
 * Uses the registry's target_path if defined, otherwise falls back to the registry name.
 */
export function resolveTarget(
  name: string,
  config: RegistryConfig,
  fs: FileSystemService,
  baseTarget?: string,
): string {
  const relativePath = config.target_path || name
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

  // Source is always relative to the dataset root
  // Use explicit registry config source if provided, otherwise fall back to registry name
  // Prefer a direct registry folder under datasetRoot when present (useful for
  // disjoint sources passed via --source). Otherwise fallback to configured
  // registry 'source' (e.g., '.pair/knowledge').
  const directPath = fs.resolve(datasetRoot, name)
  const source = fs.existsSync(directPath)
    ? directPath
    : fs.resolve(datasetRoot, config && config.source ? config.source : name)

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
