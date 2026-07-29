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

/**
 * Absurd-input protection, NOT a downstream limit — nothing breaks at 101.
 *
 * The tightest real bound the name feeds is the agent-skill frontmatter budget
 * (`skills-conformance-check.ts`: description <= 1024, name+description <= 1024). The
 * seed skill spends `13 ("example-skill") + 70 (fixed description prose)` = 83 chars, so
 * the name could be ~940 before anything downstream complained. 100 is simply a
 * human-plausible ceiling that keeps a pasted file or a runaway wrapper argument out of
 * the generated README/YAML/bash; raise it freely if a real KB name needs more.
 */
const MAX_NAME_LENGTH = 100

/** True if `value` contains a C0 control character or DEL — avoids a `no-control-regex` disable. */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  return false
}

/** Lowercase, hyphen-separated slug — empty string when nothing usable remains. */
export function slugifyKbName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Reject KB names that cannot be safely embedded in generated artifacts.
 *
 * The name is interpolated into a YAML workflow, the seed skill's YAML frontmatter,
 * a bash release script and Markdown. Quoting/escaping happens at every generation
 * site — JSON-quoted YAML scalars (`release-workflow.ts`, `seed-content.ts`,
 * asserted by parsing with a real YAML parser in `templates/yaml-safety.test.ts`)
 * and a single-quoted shell assignment (`release-script.ts`) — and this guard closes
 * what quoting cannot: newlines and control characters, which would break out of a
 * `#` comment or inject top-level YAML keys regardless of quoting.
 */
export function validateKbName(name: string): string {
  const rendered = JSON.stringify(name)

  if (name.trim() === '') {
    throw new Error(`Invalid --name ${rendered}: the KB name cannot be empty.`)
  }
  if (hasControlCharacter(name)) {
    throw new Error(
      `Invalid --name ${rendered}: the KB name cannot contain newlines or control characters.`,
    )
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(
      `Invalid --name ${rendered}: the KB name cannot exceed ${MAX_NAME_LENGTH} characters.`,
    )
  }

  return name
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
  const name = validateKbName(input.name ?? (derived || FALLBACK_SLUG))
  const slug = slugifyKbName(name) || FALLBACK_SLUG

  return { name, slug, skillPrefix: slug }
}
