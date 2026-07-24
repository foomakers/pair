/**
 * Mirror-equality helpers for per-skill `SKILL.md` files.
 *
 * Every root `.claude/skills/<prefixed>/SKILL.md` is GENERATED from its
 * canonical dataset source `packages/knowledge-hub/dataset/.skills/<cat>/<name>/SKILL.md`
 * by `pair update`. Rather than re-implement that transform, these helpers run
 * the REAL copy pipeline — `copyDirectoryWithTransforms` with the exact
 * `{ flatten: true, prefix: 'pair' }` options `apps/pair-cli/config.json`
 * declares for the `skills` registry — over an in-memory clone of the dataset,
 * so a bug in the real pipeline FAILS the guard instead of being masked.
 *
 * The composed transform covers all four drift classes the guard must catch:
 * dir-rename (`transformPath`), frontmatter `name:` sync (`syncFrontmatter`),
 * relative-link-depth rewrite (`rewriteLinksAfterTransform`, the `../../`→`../../../`
 * bump that the depth-shifting bare `next` skill triggers), and the `/command`
 * skill-reference rewrite (`rewriteSkillReferencesInFiles`).
 *
 * Directional (dataset → root): the map is keyed by dataset skill dirs, so a
 * root-only skill with no dataset source (e.g. `agent-browser`) is never
 * asserted — it is not drift.
 */
import { readdirSync, readFileSync } from 'fs'
import { join, relative, sep } from 'path'
import {
  InMemoryFileSystemService,
  copyDirectoryWithTransforms,
  transformPath,
  defaultSyncOptions,
} from '@pair/content-ops'

/** The exact naming-transform options the `skills` registry uses in config.json. */
export const SKILL_COPY_OPTS = { flatten: true, prefix: 'pair' } as const

const SKILL_FILE = 'SKILL.md'

// Virtual (in-memory) dataset layout that FAITHFULLY mirrors the real
// `pair update` skills-registry paths, not just a convenient shallow layout.
// The real run uses datasetRoot = baseTarget = repo root and a DEEP source
// (`packages/knowledge-hub/dataset/.skills`), so its `sourceContentRoot`
// (= dirname of the source-relative path) is non-trivial and the link
// rewriter's `reRootTarget` branch executes. Seeding the source at the same
// deep path here (rather than a shallow `/ds/.skills`, whose sourceContentRoot
// collapses to '.') means the guard actually DRIVES that re-rooting branch, so
// a pipeline bug isolated to `reRootTarget`/`sourceContentRoot` re-rooting also
// fails the guard.
const VIRTUAL_DATASET_ROOT = '/ds'
const VIRTUAL_SOURCE_REL = 'packages/knowledge-hub/dataset/.skills'
const VIRTUAL_TARGET_REL = '.claude/skills'
const VIRTUAL_SRC = `${VIRTUAL_DATASET_ROOT}/${VIRTUAL_SOURCE_REL}`
const VIRTUAL_DEST = `${VIRTUAL_DATASET_ROOT}/${VIRTUAL_TARGET_REL}`

/** Posix-relative path under `.skills/` → file content. */
export type DatasetTree = Record<string, string>

/**
 * Reads the on-disk dataset `.skills` tree into a posix-keyed content map.
 * Keys are paths relative to `skillsDir` (e.g. `capability/verify-quality/SKILL.md`,
 * `next/SKILL.md`), so the map is a portable snapshot of the dataset source.
 */
export function readSkillsDatasetFromDisk(skillsDir: string): DatasetTree {
  const tree: DatasetTree = {}

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else {
        const rel = relative(skillsDir, full).split(sep).join('/')
        tree[rel] = readFileSync(full, 'utf-8')
      }
    }
  }

  walk(skillsDir)
  return tree
}

/**
 * The dataset skill directories — every posix dir that directly contains a
 * `SKILL.md` (`capability/<name>`, `process/<name>`, or the bare `next`),
 * sorted for stable `it.each` ordering. Data-driven: adding a skill to the
 * dataset extends this list with no test edit (AC5).
 */
export function datasetSkillDirs(tree: DatasetTree): string[] {
  const dirs = new Set<string>()
  for (const rel of Object.keys(tree)) {
    if (rel.endsWith(`/${SKILL_FILE}`)) {
      dirs.add(rel.slice(0, -(`/${SKILL_FILE}`.length)))
    }
  }
  return [...dirs].sort()
}

/**
 * Installed (prefixed) directory name for a dataset skill dir, via the real
 * `transformPath` with the registry's flatten/prefix options
 * (`capability/verify-quality` → `pair-capability-verify-quality`,
 * `next` → `pair-next`).
 */
export function installedSkillDir(datasetSkillDir: string): string {
  return transformPath(datasetSkillDir, SKILL_COPY_OPTS)
}

/**
 * Runs the REAL `pair update` copy pipeline over an in-memory clone of the
 * dataset and returns `installedPrefixedDir → transformed SKILL.md content`
 * for every dataset skill dir. No parallel transform logic — a bug in the
 * production pipeline surfaces here.
 */
export async function buildInstalledSkillMd(tree: DatasetTree): Promise<Map<string, string>> {
  const initial: Record<string, string> = {}
  for (const [rel, content] of Object.entries(tree)) {
    initial[`${VIRTUAL_SRC}/${rel}`] = content
  }

  const fileService = new InMemoryFileSystemService(initial, '/', '/')
  await copyDirectoryWithTransforms({
    fileService,
    srcPath: VIRTUAL_SRC,
    destPath: VIRTUAL_DEST,
    // Deep source + repo-root dataset root, exactly as the real `pair update`
    // resolves them: this makes `sourceContentRoot` non-trivial so the
    // link-rewriter's `reRootTarget` branch runs (see VIRTUAL_* note above).
    source: VIRTUAL_SOURCE_REL,
    target: VIRTUAL_TARGET_REL,
    datasetRoot: VIRTUAL_DATASET_ROOT,
    // Same SyncOptions the `skills` registry resolves to: default sync options
    // (behavior 'overwrite') with the registry's flatten/prefix applied.
    options: { ...defaultSyncOptions(), ...SKILL_COPY_OPTS },
  })

  const installed = new Map<string, string>()
  for (const datasetDir of datasetSkillDirs(tree)) {
    const prefixed = installedSkillDir(datasetDir)
    installed.set(prefixed, await fileService.readFile(`${VIRTUAL_DEST}/${prefixed}/${SKILL_FILE}`))
  }
  return installed
}

/**
 * Asserts the root mirror `SKILL.md` equals the real pipeline transform.
 * Throws LOUDLY — naming the skill and giving the `pair update` regenerate
 * hint — when the mirror is missing (AC4) or has drifted (AC2/AC3). This is
 * the guard's assertion helper, kept in a tested production module (per the
 * "gate & tooling code in tested modules" ADL) so both the real on-disk guard
 * and the drift-injection tests drive the same code path.
 *
 * `actual` is `undefined` iff the root mirror file does not exist.
 */
export function assertRootSkillMdMatches(
  prefixed: string,
  expected: string,
  actual: string | undefined,
): void {
  if (actual === undefined) {
    throw new Error(
      `Root mirror SKILL.md missing for skill '${prefixed}': ` +
        `.claude/skills/${prefixed}/SKILL.md does not exist. Run 'pair update' to regenerate it.`,
    )
  }
  if (actual !== expected) {
    throw new Error(
      `Root mirror SKILL.md for skill '${prefixed}' has drifted from its dataset source ` +
        `transform. Run 'pair update' to regenerate .claude/skills/${prefixed}/SKILL.md.\n` +
        `--- expected (dataset → real transform) ---\n${expected}\n` +
        `--- actual (root mirror on disk) ---\n${actual}`,
    )
  }
}
