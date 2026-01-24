import { Behavior } from '@pair/content-ops'

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
