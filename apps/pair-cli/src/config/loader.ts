import { join } from 'path'
import { FileSystemService } from '@pair/content-ops'
import { Config, extractRegistries, validateAllRegistries } from '#registry'

/**
 * Loads the CLI configuration with optional overrides from project-local
 * pair.config.json or a custom configuration path.
 */
export function loadConfigWithOverrides(
  fsService: FileSystemService,
  options: { customConfigPath?: string; projectRoot?: string } = {},
): { config: Config; source: string } {
  const { customConfigPath, projectRoot = fsService.rootModuleDirectory() } = options
  let { config, source } = loadBaseConfig(fsService)

  const pairApplied = applyPairConfigIfExists(fsService, config, projectRoot)
  if (pairApplied) {
    config = pairApplied.config
    source = 'pair.config.json'
  }

  if (customConfigPath) {
    config = mergeWithCustomConfig(fsService, config, customConfigPath)
    source = `custom config: ${customConfigPath}`
  }

  return { config, source }
}

function baseConfigPath(currentDir: string) {
  return join(currentDir, 'config.json')
}

/**
 * Loads the internal base configuration from the module directory.
 */
function loadBaseConfig(fsService: FileSystemService): { config: Config; source: string } {
  const appConfigPath = baseConfigPath(fsService.rootModuleDirectory())
  try {
    if (fsService.existsSync(appConfigPath)) {
      const appConfigContent = fsService.readFileSync(appConfigPath)
      return { config: JSON.parse(appConfigContent) as Config, source: 'pair-cli config.json' }
    } else {
      throw new Error(`Config file not found in pair-cli. expected path: ${appConfigPath}`)
    }
  } catch (err) {
    throw new Error(`Failed to load base config: ${String(err)}`)
  }
}

function applyPairConfigIfExists(
  fsService: FileSystemService,
  baseConfig: Config,
  projectRoot: string,
): { config: Config } | null {
  const pairConfigPath = join(projectRoot, 'pair.config.json')
  if (fsService.existsSync(pairConfigPath)) {
    try {
      const pairConfigContent = fsService.readFileSync(pairConfigPath)
      const pairConfig = JSON.parse(pairConfigContent)
      return { config: mergeConfigs(baseConfig, pairConfig) }
    } catch {
      console.warn('Warning: Failed to load pair.config.json, continuing with base config')
    }
  }
  return null
}

function mergeWithCustomConfig(
  fsService: FileSystemService,
  baseConfig: Config,
  customConfigPath: string,
): Config {
  try {
    const customConfigContent = fsService.readFileSync(customConfigPath)
    const customConfig = JSON.parse(customConfigContent)
    return mergeConfigs(baseConfig, customConfig)
  } catch (err) {
    throw new Error(`Failed to load custom config file ${customConfigPath}: ${String(err)}`)
  }
}

/**
 * Performs a deep-ish merge of configurations, specifically handling the asset_registries map correctly.
 */
function mergeConfigs(baseConfig: Config, overrideConfig: Config): Config {
  const merged = { ...baseConfig }

  if (overrideConfig.asset_registries) {
    merged.asset_registries = { ...merged.asset_registries }

    Object.entries(overrideConfig.asset_registries).forEach(([registryName, registryConfig]) => {
      if (typeof registryConfig === 'object' && registryConfig !== null) {
        merged.asset_registries[registryName] = {
          ...merged.asset_registries[registryName],
          ...registryConfig,
        }
      }
    })
  }

  Object.keys(overrideConfig).forEach(key => {
    if (key !== 'asset_registries') {
      merged[key] = (overrideConfig as Record<string, unknown>)[key]
    }
  })

  return merged
}

/**
 * Validates the provided configuration object.
 */
export function validateConfig(config: unknown): { valid: boolean; errors: string[] } {
  const registries = extractRegistries(config)
  return validateAllRegistries(registries)
}
