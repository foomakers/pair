import type { KbIdentity } from '../identity'

/**
 * `pair.config.json` for a pure KB repo: knowledge + skills only.
 *
 * A KB is knowledge, not a configured project — `adoption` (and the project-level
 * `github`/`agents` registries) are deliberately absent. Registry `source` paths
 * match the source layout `pair package --layout source` and `pair install
 * --source` already expect, so the scaffold output needs zero install special-casing.
 */
export function renderPairConfig(identity: KbIdentity): string {
  const config = {
    asset_registries: {
      knowledge: {
        source: '.pair/knowledge',
        behavior: 'mirror',
        description: `${identity.name} knowledge base content`,
        targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
      },
      skills: {
        source: '.skills',
        behavior: 'overwrite',
        flatten: true,
        prefix: identity.skillPrefix,
        description: `${identity.name} agent skills`,
        targets: [
          { path: '.claude/skills/', mode: 'canonical' },
          { path: '.github/skills/', mode: 'symlink' },
          { path: '.cursor/skills/', mode: 'symlink' },
          { path: '.agent/skills/', mode: 'symlink' },
          { path: '.agents/skills/', mode: 'symlink' },
          { path: '.windsurf/skills/', mode: 'symlink' },
        ],
      },
    },
  }

  return `${JSON.stringify(config, null, 2)}\n`
}
