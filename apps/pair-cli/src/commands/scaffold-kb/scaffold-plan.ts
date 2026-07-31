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
  /** Written with the executable bit set (generated shell scripts carry a shebang) */
  executable?: boolean
}

export interface ScaffoldPlan {
  /** Absolute scaffold root */
  root: string
  /** Directories to create, relative to the root */
  directories: string[]
  files: ScaffoldFile[]
  /**
   * Scaffold-owned paths this `--host` does NOT manage (e.g. the GitHub workflow under
   * `--host generic`). A previous scaffold with another host may have left them on disk,
   * where an orphaned `release.yml` keeps firing on every `v*` tag push while the
   * regenerated `release.sh` no longer publishes. Never deleted — the ownership model
   * forbids destroying maintainer-visible files — but reported, so the switch is visible.
   */
  unmanaged: string[]
}

export const RELEASE_SCRIPT_PATH = 'scripts/release.sh'
export const RELEASE_WORKFLOW_PATH = '.github/workflows/release.yml'

function ownedFiles(identity: KbIdentity, host: KbHost, cliVersion?: string): ScaffoldFile[] {
  const files: ScaffoldFile[] = [
    { path: 'pair.config.json', content: renderPairConfig(identity), kind: 'scaffold-owned' },
    { path: 'README.md', content: renderReadme({ identity, host }), kind: 'scaffold-owned' },
    { path: '.gitignore', content: renderGitignore(), kind: 'scaffold-owned' },
    {
      path: RELEASE_SCRIPT_PATH,
      content: renderReleaseScript({ identity, host, ...(cliVersion && { cliVersion }) }),
      kind: 'scaffold-owned',
      executable: true,
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

/**
 * Scaffold-owned paths the given host does not generate. Only the GitHub workflow is
 * host-specific today: `--host generic` produces the release script alone, so a repo
 * previously scaffolded with `--host github` keeps a workflow nothing manages anymore.
 */
function unmanagedFiles(host: KbHost): string[] {
  return host === 'github' ? [] : [RELEASE_WORKFLOW_PATH]
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
  /** Version the generated release script pins pair-cli to (reproducible releases) */
  cliVersion?: string
}): ScaffoldPlan {
  const { root, identity, host, cliVersion } = options

  return {
    root,
    directories: ['.pair/knowledge', '.skills'],
    files: [...ownedFiles(identity, host, cliVersion), ...seedFiles(identity)],
    unmanaged: unmanagedFiles(host),
  }
}
