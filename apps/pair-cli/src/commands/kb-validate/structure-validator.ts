import type { FileSystemService } from '@pair/content-ops'
import type { RegistryConfig } from '../../registry/resolver'
import { resolveLayoutPaths, type LayoutMode } from '../../registry/layout'

/**
 * Validation result for a single registry
 */
export interface RegistryValidationResult {
  registry: string
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validation result for entire structure
 */
export interface StructureValidationResult {
  valid: boolean
  registries: RegistryValidationResult[]
}

/**
 * Options for structure validation
 */
export interface StructureValidationOptions {
  registries: Record<string, RegistryConfig>
  layout: LayoutMode
  baseDir: string
  fs: FileSystemService
}

/**
 * Validates KB structure against config.json asset_registries
 * @param options - Validation options
 * @returns Validation result with errors and warnings per registry
 */
export async function validateStructure(
  options: StructureValidationOptions,
): Promise<StructureValidationResult> {
  const { registries, layout, baseDir, fs } = options

  const registryResults: RegistryValidationResult[] = []

  for (const [name, config] of Object.entries(registries)) {
    const result = await validateRegistry({ name, config, layout, baseDir, fs })
    registryResults.push(result)
  }

  const valid = registryResults.every(r => r.valid)

  return {
    valid,
    registries: registryResults,
  }
}

/**
 * Validates a single registry
 */
async function validateRegistry(params: {
  name: string
  config: RegistryConfig
  layout: LayoutMode
  baseDir: string
  fs: FileSystemService
}): Promise<RegistryValidationResult> {
  const { name, config, layout, baseDir, fs } = params

  const errors: string[] = []
  const warnings: string[] = []

  // Resolve paths based on layout mode
  const paths = resolveLayoutPaths({ name, registry: config, layout, baseDir, fs })

  // Validate each path
  for (const path of paths) {
    const pathResult = await validatePath(path, fs)

    if (pathResult.error) {
      errors.push(pathResult.error)
    }
    if (pathResult.warning) {
      warnings.push(pathResult.warning)
    }
  }

  return {
    registry: name,
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Validates a single path exists and is non-empty
 */
async function validatePath(
  path: string,
  fs: FileSystemService,
): Promise<{ error?: string; warning?: string }> {
  // Check existence
  if (!(await fs.exists(path))) {
    return { error: `Path does not exist: ${path}` }
  }

  // Check if directory or file
  const stat = await fs.stat(path)

  if (stat.isDirectory()) {
    // Check if directory is non-empty
    const entries = await fs.readdir(path)
    if (entries.length === 0) {
      return { warning: `Directory is empty: ${path}` }
    }
  } else if (stat.isFile()) {
    // Check if file is non-empty
    try {
      const content = await fs.readFile(path)
      if (content.length === 0) {
        return { warning: `File is empty: ${path}` }
      }
    } catch {
      // If file exists but can't be read, treat as empty
      return { warning: `File is empty: ${path}` }
    }
  }

  return {}
}
