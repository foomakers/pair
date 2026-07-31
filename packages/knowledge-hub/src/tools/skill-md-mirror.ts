/**
 * Mirror-equality helpers for EVERY root skill artifact.
 *
 * Every root `.claude/skills/**\/*.md` — each skill's `SKILL.md` and every
 * sub-doc / `references/*` its directory contributes — is GENERATED from its
 * canonical dataset source under `packages/knowledge-hub/dataset/.skills/`
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
 * Directional (dataset → root): the enumeration is keyed by DATASET artifacts,
 * so a root-only file with no dataset source (e.g. the whole `agent-browser`
 * skill) is never asserted — it is not drift.
 *
 * SCOPE (#384, widening #352): the guard asserts equality for every markdown
 * artifact the dataset contributes, not only `SKILL.md`. The case list is
 * derived from the dataset at collection time and is recursive, so a new
 * sub-doc — or the first `references/` subdir — is covered with no test edit
 * and no count anywhere.
 */
import { readdirSync, readFileSync } from 'fs'
import { join, relative, sep } from 'path'
import { dirname as posixDirname } from 'path/posix'
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
 *
 * Deliberately NOT reusing `collectSkillDirs` from the sibling
 * `skills-guide-mirror.ts`: that one re-walks the disk and returns ANY dir
 * holding at least one file, whereas this one enumerates only SKILL.md-bearing
 * dirs off the already-read in-memory `tree` — no second disk walk, and a
 * `references/`-only subdir is never mistaken for a skill's own directory.
 */
export function datasetSkillDirs(tree: DatasetTree): string[] {
  const dirs = new Set<string>()
  for (const rel of Object.keys(tree)) {
    if (rel.endsWith(`/${SKILL_FILE}`)) {
      dirs.add(rel.slice(0, -`/${SKILL_FILE}`.length))
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
 * Every markdown artifact the dataset contributes through the `pair update`
 * transform — each skill's `SKILL.md` AND its sub-docs (today
 * `process/review/merge-and-cascade.md` & siblings) — as sorted
 * dataset-relative posix paths.
 *
 * The list is derived from the already-read `tree`, so it is recursive by
 * construction: a future `references/` subdir is enumerated the day it lands,
 * with no test edit. Markdown-only: a stray `.DS_Store` or a diagram is copied
 * by the pipeline but is not a *transformed* artifact, so it is never asserted.
 * Nothing here encodes HOW MANY artifacts exist.
 */
export function datasetSkillArtifacts(tree: DatasetTree): string[] {
  return Object.keys(tree)
    .filter(rel => rel.endsWith('.md'))
    .sort()
}

/**
 * Root location of a dataset artifact, relative to `.claude/skills/`.
 *
 * Composes the REAL `transformPath` over the artifact's dataset directory with
 * the registry's options — exactly what the copy pipeline's per-file transform
 * does (`dirname(file)` → `transformPath` → join the untouched file name). This
 * is why a NESTED sub-directory lands in its OWN flattened top-level dir
 * (`process/review/references/deep.md` → `pair-process-review-references/deep.md`)
 * rather than under a preserved `references/`: the pipeline flattens every
 * directory segment, not just the skill's own.
 *
 * That correspondence is not taken on trust — a guard test asserts this
 * derivation reproduces the pipeline's actual output paths set-for-set.
 */
export function installedArtifactPath(datasetArtifact: string): string {
  const dir = posixDirname(datasetArtifact)
  const fileName = datasetArtifact.slice(dir === '.' ? 0 : dir.length + 1)
  return dir === '.' ? fileName : `${transformPath(dir, SKILL_COPY_OPTS)}/${fileName}`
}

/**
 * Runs the REAL `pair update` copy pipeline over an in-memory clone of the
 * dataset. No parallel transform logic — a bug in the production pipeline
 * surfaces in the guard instead of being masked.
 */
async function runCopyPipeline(tree: DatasetTree): Promise<InMemoryFileSystemService> {
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
  return fileService
}

/** Recursively collects markdown paths under `dir`, relative to `root` (posix). */
async function collectMarkdownUnder(
  fileService: InMemoryFileSystemService,
  dir: string,
  root: string,
): Promise<string[]> {
  const out: string[] = []
  for (const entry of await fileService.readdir(dir)) {
    const full = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      out.push(...(await collectMarkdownUnder(fileService, full, root)))
    } else if (entry.name.endsWith('.md')) {
      out.push(full.slice(root.length + 1))
    }
  }
  return out
}

/**
 * The expected root mirror, produced by ONE run of the real copy pipeline:
 *
 * - `byDatasetPath` — `datasetArtifactPath → transformed content` for every
 *   markdown artifact the dataset contributes. Keyed by the DATASET path so a
 *   drift failure is attributed to its canonical source (AC2), not to the
 *   generated location.
 * - `producedPaths` — every markdown path the pipeline actually wrote, relative
 *   to `.claude/skills/`. Lets the guard cross-check `installedArtifactPath`'s
 *   derivation against the pipeline's real output set, so a path-mapping
 *   assumption (notably for nested sub-directories) can never silently exclude
 *   an artifact from the assertion.
 */
export type InstalledMirror = {
  byDatasetPath: Map<string, string>
  producedPaths: string[]
}

export async function buildInstalledArtifacts(tree: DatasetTree): Promise<InstalledMirror> {
  const fileService = await runCopyPipeline(tree)

  const byDatasetPath = new Map<string, string>()
  for (const artifact of datasetSkillArtifacts(tree)) {
    const content = fileService.getContent(`${VIRTUAL_DEST}/${installedArtifactPath(artifact)}`)
    // Absent iff the pipeline wrote the artifact somewhere else than
    // `installedArtifactPath` derives; the cross-check assertion names it.
    if (content !== undefined) byDatasetPath.set(artifact, content)
  }

  return {
    byDatasetPath,
    producedPaths: (await collectMarkdownUnder(fileService, VIRTUAL_DEST, VIRTUAL_DEST)).sort(),
  }
}

type DiffEdit = { tag: ' ' | '-' | '+'; line: string }

/**
 * Minimal line edit-script for `a` → `b` via an LCS table (suffix form):
 * ` ` unchanged, `-` only in `a` (expected), `+` only in `b` (actual).
 */
function lineEditScript(a: string[], b: string[]): DiffEdit[] {
  const m = a.length
  const n = b.length
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }

  const edits: DiffEdit[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    // i < m and j < n guarantee both are defined (noUncheckedIndexedAccess).
    const ai = a[i]!
    const bj = b[j]!
    if (ai === bj) {
      edits.push({ tag: ' ', line: ai })
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      edits.push({ tag: '-', line: ai })
      i++
    } else {
      edits.push({ tag: '+', line: bj })
      j++
    }
  }
  for (const line of a.slice(i)) edits.push({ tag: '-', line })
  for (const line of b.slice(j)) edits.push({ tag: '+', line })
  return edits
}

/**
 * Compact line-level diff of `expected` vs `actual`, showing only the changed
 * lines with a little surrounding context rather than dumping both files in
 * full — keeps a drift failure readable for a large SKILL.md instead of
 * flooding CI with two complete copies. `-` lines are `expected` (dataset →
 * real transform), `+` lines are `actual` (root mirror on disk); collapsed
 * runs of unchanged context are shown as `  …`.
 */
export function diffSkillMd(expected: string, actual: string): string {
  const edits = lineEditScript(expected.split('\n'), actual.split('\n'))

  // Keep only changed lines plus a little context around each; collapse the rest.
  const CONTEXT = 2
  const keep = new Array<boolean>(edits.length).fill(false)
  edits.forEach((e, idx) => {
    if (e.tag === ' ') return
    for (let k = Math.max(0, idx - CONTEXT); k <= Math.min(edits.length - 1, idx + CONTEXT); k++) {
      keep[k] = true
    }
  })

  const out: string[] = []
  let elided = false
  edits.forEach((e, idx) => {
    if (keep[idx]) {
      out.push(`${e.tag}${e.line}`)
      elided = false
    } else if (!elided) {
      out.push('  …')
      elided = true
    }
  })
  return out.join('\n')
}

/**
 * Asserts one root mirror artifact — a `SKILL.md` or any sub-doc the same
 * `pair update` transform generates — equals the real pipeline output.
 * Throws LOUDLY, naming the offending artifact by its DATASET-relative path
 * (its canonical identity), pointing at the generated root path, and giving the
 * `pair update` regenerate hint, when the mirror is missing (AC4) or has
 * drifted (AC2/AC3). This is the guard's assertion helper, kept in a tested
 * production module (per the "gate & tooling code in tested modules" ADL) so
 * both the real on-disk guard and the drift-injection tests drive the same
 * code path.
 *
 * On drift the message carries a compact line-level diff (via `diffSkillMd`)
 * rather than a full dump of both files, so the expected-vs-actual view AC2
 * requires stays readable even for a large artifact.
 *
 * `actual` is `undefined` iff the root mirror file does not exist.
 */
export function assertRootArtifactMatches(
  datasetArtifact: string,
  expected: string,
  actual: string | undefined,
): void {
  const rootPath = `.claude/skills/${installedArtifactPath(datasetArtifact)}`
  if (actual === undefined) {
    throw new Error(
      `Root mirror missing for dataset artifact '${datasetArtifact}': ` +
        `${rootPath} does not exist. Run 'pair update' to regenerate it.`,
    )
  }
  if (actual !== expected) {
    throw new Error(
      `Root mirror for dataset artifact '${datasetArtifact}' has drifted from its dataset ` +
        `source transform. Run 'pair update' to regenerate ${rootPath}.\n` +
        `--- expected (dataset → real transform)\n` +
        `+++ actual (root mirror on disk)\n` +
        `${diffSkillMd(expected, actual)}`,
    )
  }
}
