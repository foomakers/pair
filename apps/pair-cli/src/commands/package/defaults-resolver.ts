import { execSync } from 'child_process'
import path from 'path'
import { logger } from '@pair/content-ops'

export interface ResolvedMetadata {
  name: string
  version: string
  description: string
  author: string
  tags: string[]
  license: string
}

type PartialMetadata = Partial<ResolvedMetadata>

export interface DefaultSources {
  cliFlags?: PartialMetadata | undefined
  packageJson?: PartialMetadata | undefined
  gitConfig?: PartialMetadata | undefined
  preferences?: PartialMetadata | undefined
}

const HARDCODED: ResolvedMetadata = {
  name: 'kb-package',
  version: '1.0.0',
  description: 'Knowledge base package',
  author: 'unknown',
  tags: [],
  license: 'MIT',
}

function mergeField<K extends keyof ResolvedMetadata>(
  key: K,
  ...sources: (PartialMetadata | undefined)[]
): ResolvedMetadata[K] | undefined {
  for (const source of sources) {
    if (source && source[key] !== undefined) {
      return source[key] as ResolvedMetadata[K]
    }
  }
  return undefined
}

/**
 * Resolve package metadata from multiple sources.
 * Precedence (highest to lowest): cliFlags > packageJson > gitConfig > preferences > hardcoded
 */
export function resolveDefaults(sources: DefaultSources): ResolvedMetadata {
  const { cliFlags, packageJson, gitConfig, preferences } = sources
  const order = [cliFlags, packageJson, gitConfig, preferences]

  return {
    name: mergeField('name', ...order) ?? HARDCODED.name,
    version: mergeField('version', ...order) ?? HARDCODED.version,
    description: mergeField('description', ...order) ?? HARDCODED.description,
    author: mergeField('author', ...order) ?? HARDCODED.author,
    tags: mergeField('tags', ...order) ?? HARDCODED.tags,
    license: mergeField('license', ...order) ?? HARDCODED.license,
  }
}

/**
 * Read git config for author info (name + email).
 * Returns partial metadata or empty object on failure.
 */
export function readGitConfig(): PartialMetadata {
  try {
    const name = execSync('git config user.name', { timeout: 5000, encoding: 'utf-8' }).trim()
    if (name) return { author: name }
  } catch {
    logger.debug('Could not read git config user.name')
  }
  return {}
}

/**
 * Read package.json defaults for name, version, description.
 */
export function readPackageJsonDefaults(
  projectRoot: string,
  fs: { existsSync: (p: string) => boolean; readFileSync: (p: string) => string },
): PartialMetadata {
  const pkgPath = path.join(projectRoot, 'package.json')
  if (!fs.existsSync(pkgPath)) return {}

  try {
    const raw = JSON.parse(fs.readFileSync(pkgPath))
    const result: PartialMetadata = {}
    if (raw.name) result.name = raw.name
    if (raw.version) result.version = raw.version
    if (raw.description) result.description = raw.description
    return result
  } catch {
    logger.debug('Could not parse package.json')
    return {}
  }
}
