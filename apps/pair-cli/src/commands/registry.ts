/**
 * Shared registry configuration and utilities for install/update commands
 * Single source of truth for AssetRegistryConfig type and registry processing logic
 */

import type { Behavior, FileSystemService } from '@pair/content-ops'

/**
 * Asset registry configuration from config.json
 * Used by both install and update commands
 */
export interface AssetRegistryConfig {
  source?: string
  behavior: Behavior
  include?: string[]
  target_path: string
  description: string
}

/**
 * Load asset registries from configuration
 * @param config Parsed configuration object with asset_registries or dataset_registries field
 * @returns Map of registry name to AssetRegistryConfig
 */
export function loadRegistriesFromConfig(config: unknown): Record<string, AssetRegistryConfig> {
  const cfg = config as {
    asset_registries?: Record<string, unknown>
    dataset_registries?: Record<string, unknown>
  }
  const registries = cfg?.asset_registries || cfg?.dataset_registries || {}
  return registries as Record<string, AssetRegistryConfig>
}

/**
 * Validate that registries configuration is valid
 * @param registries Registry map to validate
 * @returns { valid: boolean, error?: string }
 */
export function validateRegistries(registries: Record<string, AssetRegistryConfig>): {
  valid: boolean
  error?: string
} {
  if (!registries || Object.keys(registries).length === 0) {
    return { valid: false, error: 'no asset registries found in config' }
  }

  for (const [name, config] of Object.entries(registries)) {
    if (!config.target_path) {
      return { valid: false, error: `registry '${name}' missing required field: target_path` }
    }
    if (!config.behavior) {
      return { valid: false, error: `registry '${name}' missing required field: behavior` }
    }
  }

  return { valid: true }
}

/**
 * Calculate effective target path for a registry
 * Uses registry's target_path if available, falls back to registry name
 * @param registryName Name of the registry
 * @param registryConfig Registry configuration
 * @param baseTarget Optional base target directory
 * @param fsService FileSystemService for path resolution
 * @returns Absolute path to registry target
 */
export function calculateEffectiveTarget(
  registryName: string,
  registryConfig: AssetRegistryConfig,
  baseTarget: string | undefined,
  fsService: FileSystemService,
): string {
  const targetPath = registryConfig.target_path || registryName
  if (baseTarget) {
    return fsService.resolve(baseTarget, targetPath)
  }
  return fsService.resolve(targetPath)
}

/**
 * Calculate registry paths (source and target)
 * @param registryName Name of the registry
 * @param registryConfig Registry configuration
 * @param datasetRoot Root directory where registry data is stored
 * @param baseTarget Optional base target directory for installations
 * @param fsService FileSystemService for path operations
 * @returns Object with source and target paths
 */
export function calculateRegistryPaths(options: {
  registryName: string
  registryConfig: AssetRegistryConfig
  datasetRoot: string
  baseTarget: string | undefined
  fsService: FileSystemService
}): { source: string; target: string } {
  const { registryName, registryConfig, datasetRoot, baseTarget, fsService } = options
  const source = fsService.resolve(datasetRoot, registryName)
  const target = calculateEffectiveTarget(registryName, registryConfig, baseTarget, fsService)
  return { source, target }
}

/**
 * Process all asset registries with provided handler function
 * Iterates over registries and applies handler to each
 * @param registries Map of registry configurations
 * @param handler Async function to process each registry
 * @returns Results from handler for each registry
 */
export async function processAssetRegistries<T>(
  registries: Record<string, AssetRegistryConfig>,
  handler: (name: string, config: AssetRegistryConfig, index: number) => Promise<T>,
): Promise<T[]> {
  const results: T[] = []
  let index = 0
  for (const [name, config] of Object.entries(registries)) {
    const result = await handler(name, config, index)
    results.push(result)
    index++
  }
  return results
}
