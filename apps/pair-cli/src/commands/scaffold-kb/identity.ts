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

/**
 * Characters that act as a line break in YAML even when the scalar is quoted:
 * U+0085 (NEL), U+2028 (LINE SEPARATOR), U+2029 (PARAGRAPH SEPARATOR) are line breaks
 * under YAML 1.1, still implemented by some runtimes, so a JSON escape that looks safe
 * to a YAML 1.2 parser can still split the generated document elsewhere.
 */
const UNICODE_LINE_BREAKS = new Set([0x85, 0x2028, 0x2029])

/**
 * True if `value` contains a C0 control character, DEL, or a Unicode line break —
 * exactly the class quoting cannot neutralize. Written as a code-point loop to avoid a
 * `no-control-regex` disable.
 */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f || UNICODE_LINE_BREAKS.has(code)) {
      return true
    }
  }
  return false
}

/**
 * GitHub Actions evaluates `${{ ... }}` in the workflow BEFORE YAML quoting matters, so
 * a name carrying it makes the generated `name:` an expression: the workflow fails to
 * parse with an invalid-context error, or interpolates a context value into the release
 * job. Quoting cannot fix it, so it belongs to this guard rather than to a template.
 * A bare `${` (shell) or `{{` (template) is harmless — only this opener is rejected.
 */
const ACTIONS_EXPRESSION_OPENER = '${{'

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
 * what quoting cannot, deliberately nothing more:
 *
 * - C0 controls + DEL and the Unicode line breaks U+0085/U+2028/U+2029 — they break out
 *   of a `#` comment or inject top-level YAML keys regardless of quoting;
 * - `${{` — evaluated by GitHub Actions before quoting applies.
 *
 * Everything else (quotes, colons, backslashes, `#`, `${`, shell metacharacters) is
 * accepted on purpose: it is the maintainer's own KB name, and the generation sites quote
 * it. The boundary is a conscious one, not the limit of what was thought of.
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
  if (name.includes(ACTIONS_EXPRESSION_OPENER)) {
    throw new Error(
      `Invalid --name ${rendered}: the KB name cannot contain '${ACTIONS_EXPRESSION_OPENER}' ` +
        `(it would become a live GitHub Actions expression in the generated workflow).`,
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
