import type { KbIdentity } from '../identity'

/**
 * Seed content: written only when the path is free, never overwritten. It exists
 * so the fresh repo is immediately packageable (`pair package` rejects empty
 * registries) and so the KB conventions are visible from the first commit.
 */
export function renderKnowledgeReadme(options: { identity: KbIdentity }): string {
  const { identity } = options

  return [
    `# ${identity.name} — knowledge`,
    '',
    'Everything under this directory is mirrored into a consuming project at',
    '`.pair/knowledge/` by `pair-cli install`.',
    '',
    'Suggested shape (mirrors the official KB, adapt freely):',
    '',
    '- `guidelines/` — standards an agent must follow (code design, testing, security)',
    '- `how-to/` — task-oriented procedures',
    '- `llms.txt` — machine-readable index of this KB',
    '',
    'Replace this file with your own content — the scaffold never overwrites it.',
    '',
  ].join('\n')
}

/**
 * Seed example skill, so the `.skills/` convention and prefixing are self-documenting.
 *
 * Every frontmatter value carrying the KB name is emitted as a JSON-quoted scalar
 * (JSON is a subset of YAML), because a name containing `:`, `"` or `\` would
 * otherwise break the document: unquoted `author: Acme: Core KB` is a YAML error
 * ("mapping values are not allowed here") and a raw `"` / `\` corrupts the
 * double-quoted `description` scalar. An agent runtime that YAML-parses SKILL.md
 * would silently drop the KB's only shipped skill.
 */
export function renderExampleSkill(options: { identity: KbIdentity }): string {
  const { identity } = options

  return [
    '---',
    'name: example-skill',
    `description: ${JSON.stringify(
      `Example skill shipped by the ${identity.name} knowledge base. Replace it with your own.`,
    )}`,
    'version: 0.1.0',
    `author: ${JSON.stringify(identity.name)}`,
    '---',
    '',
    '# example-skill',
    '',
    'Replace this skill with your own. One directory per skill under `.skills/`,',
    'each containing a `SKILL.md` with the frontmatter above.',
    '',
    'The `skills` registry in `pair.config.json` flattens `.skills/` and prefixes every',
    `skill with \`${identity.skillPrefix}\`, so this KB's skills do not collide with`,
    "another KB's.",
    '',
    "> **Prefix caveat:** `pair install --source` resolves the **consuming** project's",
    "> config, not this KB's. The prefix above therefore only applies once that project",
    '> adopts this `pair.config.json` (copy it in); with the default config the skill',
    `> installs as \`pair-example-skill\`, not \`${identity.skillPrefix}-example-skill\`.`,
    '',
  ].join('\n')
}
