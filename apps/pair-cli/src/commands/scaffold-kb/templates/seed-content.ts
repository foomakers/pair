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

/** Seed example skill, so the `.skills/` convention and prefixing are self-documenting. */
export function renderExampleSkill(options: { identity: KbIdentity }): string {
  const { identity } = options

  return [
    '---',
    'name: example-skill',
    `description: "Example skill shipped by the ${identity.name} knowledge base. Replace it with your own."`,
    'version: 0.1.0',
    `author: ${identity.name}`,
    '---',
    '',
    '# example-skill',
    '',
    'Replace this skill with your own. One directory per skill under `.skills/`,',
    'each containing a `SKILL.md` with the frontmatter above.',
    '',
    `Installed into a consuming project as \`${identity.skillPrefix}-example-skill\``,
    `(the \`skills\` registry in \`pair.config.json\` flattens \`.skills/\` and prefixes`,
    `every skill with \`${identity.skillPrefix}\`, so this KB's skills never collide`,
    'with skills from another KB).',
    '',
  ].join('\n')
}
