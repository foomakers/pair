import type { FileSystemService, TargetConfig } from '@pair/content-ops'
import type { RegistryConfig } from './resolver'

/**
 * Layout mode for KB validation and packaging
 */
export type LayoutMode = 'source' | 'target'

/**
 * Filters registries based on skip list
 * @param registries - All available registries
 * @param skipList - Registry names to exclude
 * @returns Filtered registry map
 */
export function filterRegistries(
  registries: Record<string, RegistryConfig>,
  skipList?: string[],
): Record<string, RegistryConfig> {
  if (!skipList || skipList.length === 0) {
    return registries
  }

  const skipSet = new Set(skipList)
  const filtered: Record<string, RegistryConfig> = {}

  for (const [name, config] of Object.entries(registries)) {
    if (!skipSet.has(name)) {
      filtered[name] = config
    }
  }

  return filtered
}

/**
 * Gets non-symlink targets from a registry
 * Used in target layout validation to exclude symlinks
 * @param registry - Registry configuration
 * @returns Array of non-symlink targets
 */
export function getNonSymlinkTargets(registry: RegistryConfig): TargetConfig[] {
  return registry.targets.filter(t => t.mode !== 'symlink')
}

/**
 * Options for resolving layout paths
 */
export interface ResolveLayoutPathsOptions {
  name: string
  registry: RegistryConfig
  layout: LayoutMode
  baseDir: string
  fs: FileSystemService
}

/**
 * Resolves paths for a registry based on layout mode
 * @param options - Resolution options
 * @returns Array of paths to validate/package
 */
export function resolveLayoutPaths(options: ResolveLayoutPathsOptions): string[] {
  const { registry, layout, baseDir, fs } = options

  if (layout === 'source') {
    // Source layout: single path from registry.source
    const sourcePath = fs.resolve(baseDir, registry.source)
    return [sourcePath]
  } else {
    // Target layout: multiple paths from non-symlink targets
    const targets = getNonSymlinkTargets(registry)
    return targets.map(t => fs.resolve(baseDir, t.path))
  }
}

/**
 * Applies prefix and flatten transformations to a file/folder name
 * Used to compute expected names in target layout when prefix/flatten are configured
 * @param baseName - Original file or folder name
 * @param prefix - Optional prefix to prepend
 * @param flatten - Whether flattening is enabled
 * @returns Transformed name
 */
export function applyPrefixFlatten(baseName: string, prefix?: string, flatten?: boolean): string {
  if (!prefix) {
    return baseName
  }

  // When flatten is true, prefix is applied with hyphen separator
  // When flatten is false, prefix is applied as directory structure
  if (flatten) {
    return `${prefix}-${baseName}`
  } else {
    // For non-flattened, prefix affects directory structure (handled by copyOps)
    // This function only handles the name part
    return baseName
  }
}

/**
 * Validates that skip list contains valid registry names
 * @param registries - All available registries
 * @param skipList - Registry names to validate
 * @returns Array of invalid registry names
 */
export function validateSkipList(
  registries: Record<string, RegistryConfig>,
  skipList: string[],
): string[] {
  const validNames = new Set(Object.keys(registries))
  return skipList.filter(name => !validNames.has(name))
}
