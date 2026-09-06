import path from 'path'
import type { FileSystemService } from '@pair/content-ops'

const ADOPTION_DIRECTORY = '.pair/adoption'

/**
 * Refuse targets that scaffolding would damage, with a directed message instead of
 * a raw Node error:
 *
 * - a path that exists but is not a directory (`mkdir` would fail with `EEXIST`);
 * - a configured pair project (`.pair/adoption/` present) — the default target is
 *   the current directory, so `scaffold-kb --force` in a project root would
 *   otherwise replace that project's `pair.config.json`/`README.md` unprompted.
 *   `--force` deliberately does NOT bypass this: it is a wrong-target mistake,
 *   not an overwrite decision.
 */
export async function assertScaffoldTarget(root: string, fs: FileSystemService): Promise<void> {
  if (fs.existsSync(root) && !(await fs.isFolder(root))) {
    throw new Error(`Target exists and is not a directory: ${root}`)
  }

  if (fs.existsSync(path.join(root, ADOPTION_DIRECTORY))) {
    throw new Error(
      `Refusing to scaffold a KB into ${root}: it is a configured pair project (${ADOPTION_DIRECTORY}/ exists). ` +
        'A KB is knowledge, not a configured project — scaffold it into its own directory, ' +
        'e.g. pair-cli scaffold-kb ../my-kb',
    )
  }
}
