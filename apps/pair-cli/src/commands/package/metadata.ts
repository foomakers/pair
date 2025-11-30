export interface ManifestMetadata {
  name: string
  version: string
  description?: string
  author?: string
  created_at: string
  registries: string[]
}

export type PartialManifestMetadata = Partial<Omit<ManifestMetadata, 'created_at' | 'registries'>>

/**
 * Generate manifest metadata for ZIP package
 * Merges CLI params with defaults
 * Precedence: CLI params > defaults
 */
export function generateManifestMetadata(
  registries: string[],
  cliParams: PartialManifestMetadata = {},
): ManifestMetadata {
  return {
    name: cliParams.name ?? 'kb-package',
    version: cliParams.version ?? '1.0.0',
    description: cliParams.description ?? 'Knowledge base package',
    author: cliParams.author ?? 'unknown',
    created_at: new Date().toISOString(),
    registries,
  }
}
