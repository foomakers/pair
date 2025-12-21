import type { Behavior } from '@pair/content-ops'
import type { CommandOptions } from '../command-utils'

/**
 * Asset registry configuration from config.json
 */
export interface AssetRegistryConfig {
  source?: string
  behavior: Behavior
  include?: string[]
  target_path: string
  description: string
}

/**
 * Install command options
 */
export type InstallOptions = CommandOptions & {
  baseTarget?: string
  linkStyle?: 'relative' | 'absolute' | 'auto'
  useDefaults?: boolean
}
