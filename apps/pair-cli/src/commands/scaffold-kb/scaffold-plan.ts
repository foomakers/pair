import type { KbHost, KbIdentity } from './identity'
import {
  renderPairConfig,
  renderGitignore,
  renderReadme,
  renderReleaseScript,
  renderReleaseWorkflow,
  renderKnowledgeReadme,
  renderExampleSkill,
} from './templates'

/**
 * Ownership of a planned file, which decides the re-scaffold policy:
 * - `scaffold-owned` — regenerated on re-scaffold (with confirmation when modified)
 * - `seed` — written once; never touched again, it belongs to the maintainer
 */
export type ScaffoldFileKind = 'scaffold-owned' | 'seed'

export interface ScaffoldFile {
  /** Path relative to the scaffold root */
  path: string
  content: string
  kind: ScaffoldFileKind
}

export interface ScaffoldPlan {
  /** Absolute scaffold root */
  root: string
  /** Directories to create, relative to the root */
  directories: string[]
  files: ScaffoldFile[]
}

export const RELEASE_SCRIPT_PATH = 'scripts/release.sh'
export const RELEASE_WORKFLOW_PATH = '.github/workflows/release.yml'

function ownedFiles(identity: KbIdentity, host: KbHost): ScaffoldFile[] {
  const files: ScaffoldFile[] = [
    { path: 'pair.config.json', content: renderPairConfig(identity), kind: 'scaffold-owned' },
    { path: 'README.md', content: renderReadme({ identity, host }), kind: 'scaffold-owned' },
    { path: '.gitignore', content: renderGitignore(), kind: 'scaffold-owned' },
    {
      path: RELEASE_SCRIPT_PATH,
      content: renderReleaseScript({ identity, host }),
      kind: 'scaffold-owned',
    },
  ]

  if (host === 'github') {
    files.push({
      path: RELEASE_WORKFLOW_PATH,
      content: renderReleaseWorkflow({ identity }),
      kind: 'scaffold-owned',
    })
  }

  return files
}

function seedFiles(identity: KbIdentity): ScaffoldFile[] {
  return [
    {
      path: '.pair/knowledge/README.md',
      content: renderKnowledgeReadme({ identity }),
      kind: 'seed',
    },
    {
      path: '.skills/example-skill/SKILL.md',
      content: renderExampleSkill({ identity }),
      kind: 'seed',
    },
  ]
}

/**
 * Build the full scaffold plan for a pure KB repo: the source-layout directories
 * (`.pair/knowledge`, `.skills` — the same paths install/package resolve, so no
 * hand-rolled second definition of "KB repo shape"), the scaffold-owned files,
 * and the seed content that makes the repo packageable on day one.
 */
export function buildScaffoldPlan(options: {
  root: string
  identity: KbIdentity
  host: KbHost
}): ScaffoldPlan {
  const { root, identity, host } = options

  return {
    root,
    directories: ['.pair/knowledge', '.skills'],
    files: [...ownedFiles(identity, host), ...seedFiles(identity)],
  }
}
