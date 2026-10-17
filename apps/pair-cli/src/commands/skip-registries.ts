import { join } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import { filterRegistries, validateSkipList, type RegistryConfig } from '#registry'
import type { CliPresenter } from '#ui'

type Registries = Record<string, RegistryConfig>

/**
 * `--skip-registries` ∪ the project's `skipRegistries`. An unknown flag name is a typo
 * (throws); an unknown config name is ignored with a warning — a newer KB may drop a registry.
 */
export function applySkipRegistries(
  registries: Registries,
  skip: { flag?: string[] | undefined; config?: string[] | undefined },
  presenter: Pick<CliPresenter, 'warning' | 'phase'>,
  command: string,
): Registries {
  const flag = skip.flag ?? []
  const invalid = validateSkipList(registries, flag)
  if (invalid.length > 0) {
    throw new Error(
      `Unknown registry '${invalid.join("', '")}' in --skip-registries. Valid names: ${Object.keys(registries).join(', ')}`,
    )
  }
  const config = skip.config ?? []
  for (const name of validateSkipList(registries, config)) {
    presenter.warning(
      `pair.config.json skipRegistries names unknown registry '${name}' (ignored by ${command})`,
    )
  }
  const known = new Set(Object.keys(registries))
  const fromFlag = new Set(flag)
  const names = [...new Set([...flag, ...config])].filter(n => known.has(n))
  for (const name of names) {
    presenter.phase(`skipping ${name} (from ${fromFlag.has(name) ? '--skip-registries' : 'pair.config.json'})`)
  }
  return names.length > 0 ? filterRegistries(registries, names) : registries
}

/**
 * Remembers `names` in the project's `pair.config.json` (union, other keys and order kept),
 * so a later plain `update` keeps leaving them alone. The file was already parsed by the
 * loader before anything ran, so a malformed one never reaches this write.
 */
export async function persistSkipRegistries(
  fs: FileSystemService,
  baseTarget: string,
  names: string[] | undefined,
): Promise<void> {
  if (!names || names.length === 0) return
  const path = join(baseTarget, 'pair.config.json')
  const existing = fs.existsSync(path)
    ? (JSON.parse(fs.readFileSync(path)) as Record<string, unknown>)
    : {}
  const current = (existing['skipRegistries'] as string[] | undefined) ?? []
  const union = [...new Set([...current, ...names])]
  if (union.length === current.length) return
  await fs.writeFile(path, JSON.stringify({ ...existing, skipRegistries: union }, null, 2) + '\n')
}
