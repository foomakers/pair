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

/**
 * Options for collecting layout files
 */
export interface CollectLayoutFilesOptions {
  registry: RegistryConfig
  layout: LayoutMode
  baseDir: string
  fs: FileSystemService
}

/**
 * Collects all files present in the specified layout
 * @param options - Collection options
 * @returns List of absolute file paths in the layout
 */
export async function collectLayoutFiles(
  options: CollectLayoutFilesOptions,
): Promise<string[]> {
  const { registry, layout, baseDir, fs } = options
  const paths = resolveLayoutPaths({ name: '', registry, layout, baseDir, fs })

  const files: string[] = []

  for (const dirPath of paths) {
    await collectFilesRecursive(dirPath, files, fs)
  }

  return files
}

/**
 * Recursively collects all files from a directory
 * @param dirPath - Directory path to scan
 * @param files - Array to accumulate file paths
 * @param fs - FileSystemService instance
 */
async function collectFilesRecursive(
  dirPath: string,
  files: string[],
  fs: FileSystemService,
): Promise<void> {
  const exists = await fs.exists(dirPath)
  if (!exists) return

  // Try to read as directory; if it fails, treat as file
  let entries
  try {
    entries = await fs.readdir(dirPath)
  } catch {
    // Not a directory or readdir failed - treat as file
    files.push(dirPath)
    return
  }
  for (const entry of entries) {
    const fullPath = fs.resolve(dirPath, entry.name)

    // Check if entry has type information (Dirent interface)
    if (typeof entry.isDirectory === 'function' && typeof entry.isFile === 'function') {
      // Use Dirent methods to check file type
      if (entry.isDirectory()) {
        // Recurse into subdirectory
        await collectFilesRecursive(fullPath, files, fs)
      } else if (entry.isFile()) {
        // Add file to list
        files.push(fullPath)
      }
      // Skip symlinks and other special files
    } else {
      // Fallback for simple mocks: treat all entries as files (backward compat)
      files.push(fullPath)
    }
  }
}

/**
 * Options for transforming source path to target paths
 */
export interface TransformSourceToTargetOptions {
  sourcePath: string
  registry: RegistryConfig
  baseDir: string
  fs: FileSystemService
}

/**
 * Transforms a source path to target path(s) applying prefix/flatten
 * @param options - Transformation options
 * @returns List of target paths (one per non-symlink target)
 */
export function transformSourceToTarget(
  options: TransformSourceToTargetOptions,
): string[] {
  const { sourcePath, registry, baseDir, fs } = options

  // Extract filename from source path
  const sourceDir = fs.resolve(baseDir, registry.source)
  const relativePath = sourcePath.replace(sourceDir + '/', '')
  const baseName = relativePath.split('/').pop() || relativePath

  // Get base filename without extension
  const lastDotIndex = baseName.lastIndexOf('.')
  const nameWithoutExt = lastDotIndex > 0 ? baseName.slice(0, lastDotIndex) : baseName
  const ext = lastDotIndex > 0 ? baseName.slice(lastDotIndex) : ''

  // Apply prefix/flatten transformation
  const transformedName = applyPrefixFlatten(nameWithoutExt, registry.prefix, registry.flatten)
  const transformedFile = transformedName + ext

  // Map to all non-symlink target paths
  const targets = getNonSymlinkTargets(registry)
  return targets.map(target => fs.resolve(baseDir, target.path, transformedFile))
}

/**
 * Options for transforming target path to source path
 */
export interface TransformTargetToSourceOptions {
  targetPath: string
  registry: RegistryConfig
  baseDir: string
  fs: FileSystemService
}

/**
 * Transforms a target path to source path removing prefix/flatten
 * @param options - Transformation options
 * @returns Source path or null if target path doesn't match registry
 */
export function transformTargetToSource(
  options: TransformTargetToSourceOptions,
): string | null {
  const { targetPath, registry, baseDir, fs } = options

  // Check if target path matches any registry target
  const targets = getNonSymlinkTargets(registry)
  let matchedTargetPath: string | null = null

  for (const target of targets) {
    const targetDir = fs.resolve(baseDir, target.path)
    if (targetPath.startsWith(targetDir + '/')) {
      matchedTargetPath = targetDir
      break
    }
  }

  if (!matchedTargetPath) return null

  // Extract filename from target path
  const relativePath = targetPath.replace(matchedTargetPath + '/', '')
  const baseName = relativePath.split('/').pop() || relativePath

  // Get base filename without extension
  const lastDotIndex = baseName.lastIndexOf('.')
  const nameWithoutExt = lastDotIndex > 0 ? baseName.slice(0, lastDotIndex) : baseName
  const ext = lastDotIndex > 0 ? baseName.slice(lastDotIndex) : ''

  // Remove prefix if flatten is enabled
  let originalName = nameWithoutExt
  if (registry.flatten && registry.prefix) {
    const prefixWithHyphen = registry.prefix + '-'
    if (nameWithoutExt.startsWith(prefixWithHyphen)) {
      originalName = nameWithoutExt.slice(prefixWithHyphen.length)
    }
  }

  const originalFile = originalName + ext
  return fs.resolve(baseDir, registry.source, originalFile)
}
