import type { ManifestMetadata } from '../../package/metadata'

export interface ManifestCheckResult {
  status: 'PASS' | 'FAIL'
  errors: string[]
}

const REQUIRED_STRING_FIELDS: (keyof ManifestMetadata)[] = ['name', 'version', 'created_at']

/**
 * Validate manifest required fields
 * @param manifestContent - Parsed manifest object
 * @returns Check result
 */
export function verifyManifest(manifestContent: unknown): ManifestCheckResult {
  const errors: string[] = []

  if (!manifestContent || typeof manifestContent !== 'object') {
    return { status: 'FAIL', errors: ['Manifest is not a valid object'] }
  }

  const manifest = manifestContent as Partial<ManifestMetadata>

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!manifest[field] || typeof manifest[field] !== 'string') {
      errors.push(`Missing or invalid field: ${field}`)
    }
  }

  if (!manifest.registries || !Array.isArray(manifest.registries)) {
    errors.push('Missing or invalid field: registries (must be an array)')
  }

  return { status: errors.length === 0 ? 'PASS' : 'FAIL', errors }
}
