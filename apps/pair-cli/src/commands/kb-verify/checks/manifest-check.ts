import type { ManifestMetadata } from '../../package/metadata'

export interface ManifestCheckResult {
  status: 'PASS' | 'FAIL'
  errors: string[]
}

/* eslint-disable complexity */
/**
 * Validate manifest required fields
 * @param manifestContent - Parsed manifest object
 * @returns Check result
 */
export function verifyManifest(manifestContent: unknown): ManifestCheckResult {
  const errors: string[] = []

  if (!manifestContent || typeof manifestContent !== 'object') {
    errors.push('Manifest is not a valid object')
    return { status: 'FAIL', errors }
  }

  const manifest = manifestContent as Partial<ManifestMetadata>

  // Check required fields
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Missing or invalid field: name')
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('Missing or invalid field: version')
  }

  if (!manifest.created_at || typeof manifest.created_at !== 'string') {
    errors.push('Missing or invalid field: created_at')
  }

  if (!manifest.registries || !Array.isArray(manifest.registries)) {
    errors.push('Missing or invalid field: registries (must be an array)')
  }

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    errors,
  }
}
