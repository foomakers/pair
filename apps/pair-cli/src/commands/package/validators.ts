import { join } from 'path'
import { FileSystemService } from '@pair/content-ops'
import type { Config } from '../../registry'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validate package structure against config.json
 * Checks registry paths exist and are non-empty
 */
export async function validatePackageStructure(
  config: Config,
  projectRoot: string,
  fsService: FileSystemService,
): Promise<ValidationResult> {
  const errors: string[] = []

  // Check basic config structure
  if (!config.asset_registries) {
    errors.push('Config must have asset_registries')
    return { valid: false, errors }
  }

  // Validate each registry
  for (const [registryName, registry] of Object.entries(config.asset_registries)) {
    // Check source field exists
    if (!registry.source) {
      errors.push(`Registry '${registryName}' missing required field: source`)
      continue
    }

    const sourcePath = join(projectRoot, registry.source)

    // Check path exists
    if (!fsService.existsSync(sourcePath)) {
      errors.push(`Registry '${registryName}' source path does not exist: ${sourcePath}`)
      continue
    }

    // Check if directory and non-empty
    const stats = await fsService.stat(sourcePath)
    if (stats.isDirectory()) {
      const entries = await fsService.readdir(sourcePath)
      if (entries.length === 0) {
        errors.push(`Registry '${registryName}' directory is empty`)
      }
    }
    // Files are valid as-is, no empty check needed
  }

  return { valid: errors.length === 0, errors }
}
