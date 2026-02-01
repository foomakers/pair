import { join } from 'path'
import { FileSystemService } from '@pair/content-ops'
import type { Config } from '#registry'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

interface RegistryEntry {
  name: string
  registry: {
    source?: string
    behavior: string
    target_path: string
    description?: string
  }
}

/**
 * Validate basic config structure
 */
function validateConfigStructure(config: Config): ValidationResult {
  const errors: string[] = []

  if (!config.asset_registries) {
    errors.push('Config must have asset_registries')
    return { valid: false, errors }
  }

  const registryEntries = Object.entries(config.asset_registries)

  if (registryEntries.length === 0) {
    errors.push('Config must have at least one registry')
    return { valid: false, errors }
  }

  return { valid: true, errors }
}

/**
 * Validate a single registry entry
 */
async function validateRegistryEntry(
  entry: RegistryEntry,
  projectRoot: string,
  fsService: FileSystemService,
): Promise<{ error?: string; isValid: boolean }> {
  const { name: registryName, registry } = entry

  if (!registry.source) {
    return { error: `Registry '${registryName}' missing required field: source`, isValid: false }
  }

  const sourcePath = join(projectRoot, registry.source)

  if (!fsService.existsSync(sourcePath)) {
    return {
      error: `Registry '${registryName}' source path does not exist: ${sourcePath}`,
      isValid: false,
    }
  }

  const stats = await fsService.stat(sourcePath)
  if (stats.isDirectory()) {
    const entries = await fsService.readdir(sourcePath)
    if (entries.length === 0) {
      return { error: `Registry '${registryName}' directory is empty`, isValid: false }
    }
  }

  return { isValid: true }
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

  const structureValidation = validateConfigStructure(config)
  if (!structureValidation.valid) {
    return structureValidation
  }

  const registryEntries = Object.entries(config.asset_registries!)
  let validRegistryCount = 0

  for (const [name, registry] of registryEntries) {
    const result = await validateRegistryEntry({ name, registry }, projectRoot, fsService)

    if (result.error) {
      errors.push(result.error)
    }

    if (result.isValid) {
      validRegistryCount++
    }
  }

  if (validRegistryCount === 0) {
    errors.push('No valid registries found for packaging')
    return { valid: false, errors }
  }

  return { valid: errors.length === 0, errors }
}
