import { join } from 'node:path'
import type { RunFiles } from '../engine'

type Config = Record<string, unknown>
type ConfigFiles = Pick<RunFiles, 'existsSync' | 'readFileSync'>
type LoadOptions = { alreadyLoaded?: string; pairConfigOnly?: boolean }

export function isPlainObject(value: unknown): value is Config {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function registryEntries(config: unknown): Config {
  const raw = config as Config | undefined
  return (raw?.['asset_registries'] || raw?.['dataset_registries'] || {}) as Config
}

export function registryTargets<T extends { path: string }>(name: string, registry: Config) {
  const targets = registry['targets']
  if (Array.isArray(targets) && targets.length > 0) return targets as T[]
  const path = (registry['target_path'] as string | undefined) || name
  return [{ path, mode: 'canonical' as const }]
}

export function assertSkipRegistries(parsed: unknown, path: string, objectOnly = false): void {
  if (objectOnly && !isPlainObject(parsed)) {
    throw new Error(`Invalid ${path}: must be a JSON object`)
  }
  const skip = isPlainObject(parsed) ? parsed['skipRegistries'] : undefined
  if (skip !== undefined && !(Array.isArray(skip) && skip.every(n => typeof n === 'string'))) {
    throw new Error(`Invalid ${path}: skipRegistries must be an array of registry names`)
  }
}

/** Merge each asset registry by field and replace other top-level keys. */
export function mergeConfigs<T extends Config>(base: T, override: Config): T {
  const merged: Config = { ...base }
  const registries = override['asset_registries'] || override['dataset_registries']
  if (registries) {
    const entries = { ...registryEntries(base) }
    for (const [name, registry] of Object.entries(registries)) {
      if (typeof registry === 'object' && registry !== null) {
        entries[name] = {
          ...(entries[name] as Config | undefined),
          // A legacy target in this layer replaces inherited targets.
          ...(Object.hasOwn(registry, 'target_path') && { targets: undefined }),
          ...registry,
        }
      }
    }
    merged['asset_registries'] = entries
  }
  for (const key of Object.keys(override)) {
    if (key !== 'asset_registries' && key !== 'dataset_registries') merged[key] = override[key]
  }
  return merged as T
}

function readConfig(fs: ConfigFiles, path: string, objectOnly?: boolean): Config {
  const parsed = JSON.parse(fs.readFileSync(path))
  assertSkipRegistries(parsed, path, objectOnly)
  return parsed as Config
}

function projectConfigPaths(fs: ConfigFiles, root: string, options: LoadOptions) {
  const primary = join(root, 'pair.config.json')
  const legacy = join(root, 'config.json')
  const fallback =
    !options.pairConfigOnly && fs.existsSync(legacy) && legacy !== options.alreadyLoaded
      ? legacy
      : undefined
  return fs.existsSync(primary) ? { path: primary, legacy: fallback } : { path: fallback }
}

/** A runtime-only pair.config.json layers over config.json. A registry declaration owns the project layer. */
export function applyProjectConfig<T extends Config>(
  fs: ConfigFiles,
  base: T,
  root: string,
  options: LoadOptions = {},
): T | undefined {
  const { path, legacy } = projectConfigPaths(fs, root, options)
  if (path === undefined) return undefined

  try {
    const project = readConfig(fs, path, options.pairConfigOnly)
    const inheritLegacy =
      legacy !== undefined &&
      isPlainObject(project) &&
      !['asset_registries', 'dataset_registries'].some(key => Object.hasOwn(project, key))
    return mergeConfigs(inheritLegacy ? mergeConfigs(base, readConfig(fs, legacy)) : base, project)
  } catch (err) {
    // Install/update must not silently drop skipRegistries from an unreadable project config.
    if (options.pairConfigOnly)
      throw new Error(`Failed to load ${path}: ${err instanceof Error ? err.message : String(err)}`)
    console.warn(`Warning: Failed to load ${path}, continuing with base config`)
    return undefined
  }
}
