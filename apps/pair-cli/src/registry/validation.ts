import { Behavior } from '@pair/content-ops'
import type { RegistryConfig } from './resolver'

/**
 * Validates a single registry configuration for required fields and correct types.
 */
export function validateRegistry(name: string, config: unknown): string[] {
  const errors: string[] = []

  if (!config || typeof config !== 'object') {
    errors.push(`Registry '${name}' must be a valid object`)
    return errors
  }

  const reg = config as Record<string, unknown>

  errors.push(...validateBehavior(name, reg))
  errors.push(...validatePaths(name, reg))
  errors.push(...validateIncludes(name, reg))
  errors.push(...validateDescription(name, reg))

  return errors
}

function validateBehavior(name: string, reg: Record<string, unknown>): string[] {
  const validBehaviors: Behavior[] = ['overwrite', 'add', 'mirror', 'skip']
  const behavior = reg['behavior'] as Behavior

  if (!behavior || !validBehaviors.includes(behavior)) {
    return [
      `Registry '${name}' has invalid behavior '${behavior}'. Must be one of: ${validBehaviors.join(', ')}`,
    ]
  }
  return []
}

function validatePaths(name: string, reg: Record<string, unknown>): string[] {
  if (!reg['target_path'] || typeof reg['target_path'] !== 'string') {
    return [`Registry '${name}' must have a valid target_path string`]
  }
  return []
}

function validateIncludes(name: string, reg: Record<string, unknown>): string[] {
  const include = reg['include']
  if (include === undefined) return []

  if (!Array.isArray(include)) {
    return [`Registry '${name}' include must be an array of strings`]
  }

  if (include.some(item => typeof item !== 'string')) {
    return [`Registry '${name}' include array must contain only strings`]
  }

  return []
}

function validateDescription(name: string, reg: Record<string, unknown>): string[] {
  if (!reg['description'] || typeof reg['description'] !== 'string') {
    return [`Registry '${name}' must have a valid description string`]
  }
  return []
}

/**
 * Detect overlapping target paths across multiple registries.
 * Prevents configuration where registries would overwrite each other's files unexpectedly.
 */
export function detectOverlappingTargets(targets: Record<string, string>): string[] {
  const overlapping: string[] = []
  const paths = Object.entries(targets)

  for (let i = 0; i < paths.length; i++) {
    const entry1 = paths[i]
    if (!entry1) continue
    const [name1, path1] = entry1

    for (let j = i + 1; j < paths.length; j++) {
      const entry2 = paths[j]
      if (!entry2) continue
      const [name2, path2] = entry2

      if (path1 === path2) {
        overlapping.push(`Registries '${name1}' and '${name2}' have the same target: ${path1}`)
      } else if (path1.startsWith(path2 + '/') || path2.startsWith(path1 + '/')) {
        overlapping.push(
          `Registry targets overlap: '${name1}' (${path1}) and '${name2}' (${path2})`,
        )
      }
    }
  }

  return overlapping
}

/**
 * Validates a map of registries and checks for global conflicts.
 */
export function validateAllRegistries(registries: Record<string, RegistryConfig>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!registries || Object.keys(registries).length === 0) {
    errors.push('Config must have asset_registries object')
    return { valid: false, errors }
  }

  const targets: Record<string, string> = {}

  for (const [name, config] of Object.entries(registries)) {
    const regErrors = validateRegistry(name, config)
    errors.push(...regErrors)
    if (config.target_path) {
      targets[name] = config.target_path
    }
  }

  if (errors.length === 0) {
    const overlapping = detectOverlappingTargets(targets)
    errors.push(...overlapping)
  }

  return { valid: errors.length === 0, errors }
}
