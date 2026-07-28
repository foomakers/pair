import path from 'path'

/**
 * Code host the generated release automation targets.
 * `github` adds a tag + release workflow; `generic` degrades to a script that
 * packages the ZIP and documents where it landed (self-hosted, GitLab, etc.).
 */
export type KbHost = 'github' | 'generic'

/**
 * Naming identity of the scaffolded KB: the human-facing `name` plus the
 * derived `slug` used for filenames and the `skillPrefix` that namespaces the
 * KB's skills once installed in a consuming project.
 */
export interface KbIdentity {
  name: string
  slug: string
  skillPrefix: string
}

const FALLBACK_SLUG = 'external-kb'

/** Lowercase, hyphen-separated slug — empty string when nothing usable remains. */
export function slugifyKbName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Resolve the KB identity from an explicit `--name` or, absent that, from the
 * target directory basename. `targetPath` is expected to be already resolved.
 */
export function resolveKbIdentity(input: {
  name?: string | undefined
  targetPath: string
}): KbIdentity {
  const derived = slugifyKbName(path.basename(input.targetPath))
  const name = input.name ?? (derived || FALLBACK_SLUG)
  const slug = slugifyKbName(name) || FALLBACK_SLUG

  return { name, slug, skillPrefix: slug }
}
