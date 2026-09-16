/**
 * Mirror-equality helpers for every `pair update` TARGET whose install REWRITES
 * the content it copies — today the root `.pair/knowledge` KB tree, the
 * `.github/agents` agent files, and the two root files generated from
 * `dataset/AGENTS.md` (`AGENTS.md` and `CLAUDE.md`).
 *
 * THE RULE THIS MODULE ENCODES (#393): **a mirror guard compares the OUTPUT of
 * the transform, never the source** — `expect(mirror).toBe(transform(dataset))`.
 * A guard asserting `mirror === dataset` asserts that no transform exists, which
 * is false for these corpora: `pair update` copies
 * `packages/knowledge-hub/dataset/.pair/knowledge/**` to `.pair/knowledge/**`
 * (the `knowledge` registry) and `dataset/.github/agents/**` to
 * `.github/agents/**` (the `github` registry), then rewrites, in every copied
 * markdown file, the `/command` skill references (`/assess-security` →
 * `/pair-capability-assess-security`) and the `.skills/**` SKILL.md link paths.
 *
 * The unit guarded here is a (dataset source → installed copy) PAIR, not a
 * registry: one registry can install the same source at several targets under
 * DIFFERENT ops. `agents` does exactly that — `AGENTS.md` and `CLAUDE.md` are
 * both generated from `dataset/AGENTS.md`, the second through a `claude` naming
 * transform — so it contributes two guarded mirrors, not one.
 *
 * That is not a theory about the corpus, it is its measured shape (2026-08-11):
 * the transform CHANGES 42 of the 441 KB markdown files — the ones carrying a
 * skill reference or a `.skills/**` link. For the other 399 the transform is the
 * identity (`transform(x) === x`), so byte-identity with the dataset source is
 * CORRECT there, and the guard below deliberately accepts it. What is wrong is a
 * mirror byte-identical to a source the transform WOULD have changed: exactly
 * one file was in that state (`guidelines/collaboration/templates/code-review-template.md`,
 * the only KB file byte-identical to a source the transform would rewrite) and
 * it was the DEFECT — it documented `/assess-security`, a command no reader's
 * assistant exposes — because #228's `expect(mirror).toBe(dataset)` had frozen
 * it into an invariant, so every `pair update` run reintroduced a red test.
 * `isFrozenUntransformed` names that class; plain byte-identity does not.
 *
 * The transform is NOT re-implemented here: `applyKnownMirrorTransforms`
 * composes the real content-ops `rewriteSkillReferences` +
 * `rewriteSkillLinkPaths` — the same pair the CLI runs over every non-skills
 * registry (`applySkillRefsToNonSkillRegistries` in
 * `apps/pair-cli/src/registry/skill-refs.ts`) — so a bug in the production
 * pipeline FAILS this guard instead of being masked by a parallel
 * implementation.
 *
 * BOTH DIRECTIONS, and the second one is not optional here. The per-file
 * comparison is keyed by DATASET files, so on its own it says nothing about a
 * file that exists ONLY at the target. For a `behavior: "mirror"` registry that
 * is drift, not a non-event: the target is meant to be the dataset's image, and
 * an orphan there is read as if it were shipped content (the KB tree is indexed
 * into `.pair/llms.txt`). This story removed two such files BY HAND — dropped
 * from the dataset in #246, still installed ~5 months later. So
 * `assertNoOrphanedMirrorEntries` sweeps the other way, over `installedEntries`,
 * and the pair of directions is what makes the guard a set EQUALITY.
 *
 * That reverse sweep DETECTS; it does not delete. `pair update` DOES delete an
 * orphan under a mirror target since #393 (recorded in
 * `.pair/adoption/decision-log/2026-08-13-pair-update-deletes-what-the-mirror-no-longer-ships.md`),
 * but that is a separate mechanism on a separate tree: this module reads two
 * path lists in THIS repo and touches no file, so a red guard here means a
 * maintainer removes the file from source control — it is not a report that the
 * tool already cleaned an adopter's copy.
 *
 * The sibling `skill-md-mirror` stays one-directional, and its own ACCEPTED
 * RESIDUAL (#384) says why the same sweep is not portable there as-is: its
 * target `.claude/skills/` legitimately hosts whole root-only skills with no
 * dataset source (`agent-browser`), so a reverse sweep there needs an exemption
 * rule this one does not — `knowledge` and `github` install into targets the
 * dataset fully owns.
 */
import { existsSync, readdirSync } from 'fs'
import { basename, join, relative, sep } from 'path'
import { stripAllMarkers, applyTransformCommands } from '@pair/content-ops'
import {
  buildDatasetSkillNameMap,
  buildSkillLinkPathMap,
  applyKnownMirrorTransforms,
} from './skills-guide-mirror'
// Borrowed from the sibling mirror module rather than duplicated: despite the
// `SkillMd` in its name (the context it was introduced in), `diffSkillMd` is a
// generic compact line-diff. Reusing it keeps ONE drift-report format across
// both mirror guards.
import { diffSkillMd, MIRROR_REGENERATE_COMMAND } from './skill-md-mirror'

/**
 * One (dataset source → installed copy) pair this module guards: where the
 * content comes from, where `pair update` installs it, the `asset_registries`
 * key that declares both, and the per-target ops the install applies on top of
 * the shared skill-reference rewrite.
 *
 * `key` is load-bearing, not decoration: the guard's tests read that entry of
 * `apps/pair-cli/config.json` and pin the assumptions the comparison rests on
 * (no `flatten`/`prefix` — `applySkillRefsToNonSkillRegistries` skips those
 * registries entirely — `behavior: "mirror"`, and a target whose declared
 * naming transform is exactly the `namingPrefix` modeled below).
 */
export interface GuardedMirror {
  /** Key under `asset_registries` in `apps/pair-cli/config.json`. */
  readonly key: string
  /** Repo-relative canonical source: a directory root, or a single file. */
  readonly datasetRel: string
  /** Repo-relative installed path: a directory root, or a single file. */
  readonly mirrorRel: string
  /**
   * Whether the registry's declared `source` is a directory or a single file.
   *
   * NOT cosmetic: `postCopyOps` (apps/pair-cli/src/registry/operations.ts) runs
   * `stripMarkersFromTarget` only when the target is NOT a directory, so a
   * single-file registry's install also strips `<!-- @... -->` markers, and a
   * directory registry's never does. `buildInstallTransform` models exactly
   * that.
   */
  readonly sourceKind: 'directory' | 'file'
  /**
   * The `transform.prefix` this target declares (`claude` for `CLAUDE.md`), or
   * `undefined` for a target copied verbatim. Applied by
   * `applyTransformCommands` BEFORE the markers are stripped, which is the
   * order `writeSecondaryTarget` uses.
   */
  readonly namingPrefix?: string
}

/** The knowledge base: `dataset/.pair/knowledge/**` → `.pair/knowledge/**`. */
export const KB_MIRROR: GuardedMirror = {
  key: 'knowledge',
  datasetRel: 'packages/knowledge-hub/dataset/.pair/knowledge',
  mirrorRel: '.pair/knowledge',
  sourceKind: 'directory',
}

/**
 * The GitHub agent files: `dataset/.github/**` → `.github/**` (narrowed by the
 * registry's own `include: ["/agents"]`, which the guard's tests honor).
 *
 * Same relationship as the KB tree — `behavior: "mirror"`, no flatten/prefix,
 * so the identical skill-ref + link-path rewrite runs over its markdown — and
 * therefore the same frozen/drifted failure mode. Added to this module (#393
 * review round 3) rather than left to a follow-up: the only mirror-specific
 * inputs are the two paths above.
 */
export const GITHUB_AGENTS_MIRROR: GuardedMirror = {
  key: 'github',
  datasetRel: 'packages/knowledge-hub/dataset/.github',
  mirrorRel: '.github',
  sourceKind: 'directory',
}

/**
 * The repo-root `AGENTS.md`, generated from `dataset/AGENTS.md` verbatim —
 * plus, because the registry's source is a single FILE, a marker-stripping pass
 * the two directory registries above never see.
 *
 * Added in review round 4: this pair was previously excluded from the guard for
 * a reason that only held for its sibling (`CLAUDE.md`'s naming transform),
 * leaving two root files with this story's exact frozen/drifted failure mode
 * unguarded — a hand-edit or a stray `pnpm format` there was silent.
 */
export const AGENTS_MD_MIRROR: GuardedMirror = {
  key: 'agents',
  datasetRel: 'packages/knowledge-hub/dataset/AGENTS.md',
  mirrorRel: 'AGENTS.md',
  sourceKind: 'file',
}

/**
 * The repo-root `CLAUDE.md`: the SAME `dataset/AGENTS.md` source, installed
 * through the `claude` naming transform (`applyTransformCommands` resolves the
 * `<!-- @claude-* -->` marker commands) and then stripped of markers.
 *
 * The reason two mirrors can share one source and still be compared
 * independently: the ops are per TARGET, not per registry.
 */
export const CLAUDE_MD_MIRROR: GuardedMirror = {
  key: 'agents',
  datasetRel: 'packages/knowledge-hub/dataset/AGENTS.md',
  mirrorRel: 'CLAUDE.md',
  sourceKind: 'file',
  namingPrefix: 'claude',
}

/**
 * Every mirror whose installed copy is `transform(dataset)` rather than
 * `dataset`. A new one belongs here, not in a new guard: the data-driven suite
 * iterates this list.
 *
 * NOT the whole registry list on purpose, and the two exclusions are asserted
 * in the suite rather than argued here: `adoption` is `behavior: "add"` (seeded
 * once, then owned by the adopting project — divergence is the point), and
 * `skills` declares flatten+prefix, which makes the pipeline skip
 * `applySkillRefsToNonSkillRegistries` for it altogether (that pair is guarded
 * by `skill-md-mirror`).
 */
export const GUARDED_MIRRORS: readonly GuardedMirror[] = [
  KB_MIRROR,
  GITHUB_AGENTS_MIRROR,
  AGENTS_MD_MIRROR,
  CLAUDE_MD_MIRROR,
]

/** The mirror transform: dataset content → installed content. */
export type MirrorTransform = (text: string) => string

/**
 * Builds the REAL skill-reference transform from the dataset's `.skills/` tree —
 * the `/command` reference rewrite plus the SKILL.md link-path rewrite
 * `pair update` applies to every markdown file of a non-skills registry.
 *
 * Built once per guard run (the name/link maps are derived from a full walk of
 * `.skills/`), then applied per file. This is the shared half of the install;
 * `buildInstallTransform` wraps it in the per-target ops.
 *
 * PER FILE, never over a concatenation of files: `rewriteSkillReferences`
 * carries fenced-code-block state line by line to the end of the string it is
 * given, so a source that ends inside an open fence would silently exempt
 * everything appended after it. Callers must map, not join.
 */
export function buildMirrorTransform(skillsDir: string): MirrorTransform {
  const skillNameMap = buildDatasetSkillNameMap(skillsDir)
  const linkPathMap = buildSkillLinkPathMap(skillsDir)
  return text => applyKnownMirrorTransforms(text, skillNameMap, linkPathMap)
}

/**
 * The COMPLETE install transform for one mirror and one of its files: what
 * `pair update` writes, given the dataset bytes.
 *
 * Composed in pipeline order, each op present only when the pipeline runs it:
 *
 * 1. `applyTransformCommands(text, namingPrefix)` — only for a target declaring
 *    a naming transform (`writeSecondaryTarget`).
 * 2. `stripAllMarkers` — only when the registry source is a single FILE, since
 *    `postCopyOps` calls `stripMarkersFromTarget` on non-directory targets only.
 *    Modeling this is what let `AGENTS.md` and `CLAUDE.md` join the guard: their
 *    installed bytes equal `skillRefs(stripAllMarkers(...))`, NOT
 *    `skillRefs(dataset)`, so a guard without this op would have demanded a
 *    mirror the pipeline never writes.
 * 3. `skillRefs` — the shared rewrite above, and MARKDOWN ONLY: the content
 *    rewrites walk `.md`, so for `assets/*.sh` the transform is the identity and
 *    byte-equality with the source is the invariant.
 */
export function buildInstallTransform(
  mirror: GuardedMirror,
  skillRefs: MirrorTransform,
): (relPath: string, source: string) => string {
  return (relPath, source) => {
    let out = source
    if (mirror.namingPrefix !== undefined) out = applyTransformCommands(out, mirror.namingPrefix)
    if (mirror.sourceKind === 'file') out = stripAllMarkers(out)
    return isMarkdownPath(relPath) ? skillRefs(out) : out
  }
}

/**
 * EVERY file a tree contributes, as sorted posix paths relative to `root`.
 * Derived from disk at collection time and recursive, so a newly added file is
 * guarded with no test edit and nothing anywhere encodes HOW MANY files exist.
 *
 * Used for BOTH sides of the comparison — the dataset tree and the installed
 * tree — deliberately through ONE walk: the two entry sets are only comparable
 * if they are keyed identically (same recursion, same posix separators, same
 * sort), and a second walk written for the installed side is exactly where that
 * would drift.
 *
 * A PATH-ONLY walk on purpose: enumeration must not read contents (an earlier
 * version slurped all 445 files as utf-8 just to keep their names, which would
 * silently garble the first binary asset dropped under the dataset). The
 * caller reads the files it actually compares, once each.
 */
export function treePaths(root: string): string[] {
  const paths: string[] = []

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else paths.push(relative(root, full).split(sep).join('/'))
    }
  }

  walk(root)
  return paths.sort()
}

/**
 * Every file ONE guarded mirror contributes, as entry paths relative to its
 * dataset root — the keys every comparison below is done under.
 *
 * A single-FILE mirror contributes exactly one entry, its own basename, so the
 * file and directory cases share the whole data-driven suite instead of growing
 * a second one. `datasetPathOf` / `mirrorPathOf` resolve an entry back to a real
 * path in either shape.
 */
export function mirrorEntries(mirror: GuardedMirror, repoRoot: string): string[] {
  return mirror.sourceKind === 'file'
    ? [basename(mirror.datasetRel)]
    : treePaths(join(repoRoot, mirror.datasetRel))
}

/**
 * Every file ONE guarded mirror's INSTALLED tree contributes, keyed exactly like
 * `mirrorEntries` — the same entry vocabulary, read from the target side instead
 * of the dataset side, so the two lists subtract.
 *
 * A single-FILE mirror contributes its one entry when the installed file exists
 * and nothing when it does not: there is no such thing as an orphan under a
 * target that IS the file (a missing target is the `assertMirrorMatches`
 * missing-mirror failure, not this class).
 *
 * A missing directory target yields the empty list rather than throwing — that
 * is also `assertMirrorMatches`'s failure to report, per file, with the
 * regenerate remedy; reporting it twice from two different angles would blame
 * the same defect in two vocabularies.
 */
export function installedEntries(mirror: GuardedMirror, repoRoot: string): string[] {
  const target = join(repoRoot, mirror.mirrorRel)
  if (!existsSync(target)) return []
  return mirror.sourceKind === 'file' ? [basename(mirror.datasetRel)] : treePaths(target)
}

/**
 * The REVERSE of the guard's normal direction: installed entries with NO dataset
 * source, sorted. Both lists must already be narrowed by the registry's declared
 * `include`, or an un-copied sibling subtree of the target reads as an orphan.
 */
export function orphanedMirrorEntries(
  installed: readonly string[],
  dataset: readonly string[],
): string[] {
  const sourced = new Set(dataset)
  return [...installed].filter(rel => !sourced.has(rel)).sort()
}

/**
 * Asserts the installed tree contributes nothing the dataset does not — the
 * REVERSE sweep (#393 review round 10).
 *
 * The dataset → installed direction alone cannot see this class: it enumerates
 * DATASET files, so a file that exists only at the target is asserted by
 * nothing. That is not hypothetical — it is the defect this very story removed
 * BY HAND: `.pair/knowledge/how-to/04-how-to-define-subdomains.md` and
 * `05-how-to-define-bounded-contexts.md` were dropped from the dataset in #246,
 * still shipped ~5 months later, and were indexed into `.pair/llms.txt` where
 * agents read them. Without this sweep the same class reopens silently on the
 * next hand-edit, bad merge, or `pair update` from an older dataset.
 *
 * DETECTION, not deletion. It reads two path lists in THIS repo and touches no
 * file. `pair update` deleting an orphan in an adopting project is the separate,
 * destructive mechanism wired in #393
 * (`.pair/adoption/decision-log/2026-08-13-pair-update-deletes-what-the-mirror-no-longer-ships.md`);
 * it cannot fix a red here, because this repo's installed trees ARE the source
 * of truth being guarded. The remedy printed is therefore the human one — remove
 * the file, or give it a dataset source and regenerate with
 * `MIRROR_REGENERATE_COMMAND` and never `pair update` (#419): the ADD half of
 * that remedy puts the file in the LOCAL dataset only, so no published release
 * carries it and an install cannot serve it. The message itself carries the
 * reason and no issue number — it is read by a contributor watching a gate fail,
 * not by a maintainer reading history.
 *
 * Valid for a `behavior: "mirror"` registry, whose target is meant to be the
 * dataset's IMAGE. It would be wrong for `behavior: "add"` (`adoption`), where a
 * target-only file is the whole point — that registry is excluded from
 * `GUARDED_MIRRORS`, and the exclusion is asserted in the suite.
 */
export function assertNoOrphanedMirrorEntries(
  mirror: GuardedMirror,
  installed: readonly string[],
  dataset: readonly string[],
): void {
  const orphans = orphanedMirrorEntries(installed, dataset)
  if (orphans.length === 0) return
  // the indexing consequence is stated only where it is TRUE: `writeProjectLlmsTxt`
  // indexes the KB tree, so an orphan there is not merely present, it is advertised
  // to every agent reading `.pair/llms.txt` — which is how this story's two files
  // survived ~5 months. Saying it for another registry's target would be a lie.
  const alsoIndexed =
    mirror.key === KB_MIRROR.key
      ? ` — under this target it is even indexed into .pair/llms.txt`
      : ''
  throw new Error(
    `Mirror ${mirror.mirrorRel} ships ${orphans.length} file(s) with NO dataset source:\n` +
      `${orphans.map(rel => `  - ${mirrorPathOf(mirror, rel)}`).join('\n')}\n` +
      `COMPARED: the installed tree vs. the files ${mirror.datasetRel} contributes (the reverse of ` +
      `the per-file mirror equality above). A '${mirror.key}' registry target is the dataset's ` +
      `IMAGE, so a file only the target has is drift: 'pair update' neither writes nor removes it, ` +
      `and it goes on being read as if it were shipped content${alsoIndexed}.\n` +
      `Remedy: DELETE it, or ADD it to the dataset under ${mirror.datasetRel} and regenerate with ` +
      `'${MIRROR_REGENERATE_COMMAND}' (#419: a file just added to the LOCAL dataset is in no ` +
      `published release, so 'pair update' cannot install it).`,
  )
}

/** Repo-relative path of an entry's dataset source. */
export function datasetPathOf(mirror: GuardedMirror, relPath: string): string {
  return mirror.sourceKind === 'file' ? mirror.datasetRel : join(mirror.datasetRel, relPath)
}

/** Repo-relative path of an entry's installed copy. */
export function mirrorPathOf(mirror: GuardedMirror, relPath: string): string {
  return mirror.sourceKind === 'file' ? mirror.mirrorRel : join(mirror.mirrorRel, relPath)
}

/**
 * Markdown is the corpus the install-time content rewrites walk. Everything
 * else a registry ships (today: three `assets/*.sh` gate scripts and
 * `assets/gitleaks-example.toml` under the KB) is copied verbatim, so there the
 * transform is the identity and byte-equality with the source IS the invariant.
 */
export function isMarkdownPath(rel: string): boolean {
  return rel.endsWith('.md')
}

/**
 * Asserts one installed mirror file equals the transform of its dataset source.
 *
 * Throws LOUDLY when the mirror is missing or has drifted, and the message
 * STATES WHAT IT COMPARES (AC3): "installed mirror vs. transform(dataset
 * source)", plus why byte-equality with the raw source is the wrong target.
 * That sentence is the whole point of the helper — the assumption it refutes
 * ("the two files are an identical mirror") is exactly what a previous reader
 * derived from a message that did not say it.
 *
 * Lives in a tested production module (per the "gate & tooling code in tested
 * modules" ADL) so the real on-disk guard, the drift-injection tests, and the
 * #228 conformance guard all drive the same code path.
 *
 * For a NON-markdown dataset file the comparison sentence flips, because the
 * content rewrites walk `.md` only: there `expected` IS the raw source and
 * byte-equality is the invariant, so saying otherwise would teach the reader the
 * wrong rule for `assets/*.sh`.
 *
 * `actual` is `undefined` iff the installed mirror file does not exist.
 */
export function assertMirrorMatches(
  mirror: GuardedMirror,
  datasetRelPath: string,
  expected: string,
  actual: string | undefined,
): void {
  const mirrorPath = mirrorPathOf(mirror, datasetRelPath)
  const datasetPath = datasetPathOf(mirror, datasetRelPath)
  if (actual === undefined) {
    throw new Error(
      `Mirror missing for dataset file '${datasetRelPath}': ${mirrorPath} does not exist. ` +
        `Run '${MIRROR_REGENERATE_COMMAND}' to regenerate it.`,
    )
  }
  if (actual !== expected) {
    // The extra install-time ops are named too, so the reader of a failure can
    // reproduce `expected` from the source by hand instead of guessing which
    // half of the pipeline the mirror is out of step with.
    const extraOps = [
      mirror.namingPrefix !== undefined
        ? `the '${mirror.namingPrefix}' naming transform (its <!-- @${mirror.namingPrefix}-* --> marker commands are resolved)`
        : undefined,
      mirror.sourceKind === 'file'
        ? `marker stripping (a single-FILE registry goes through postCopyOps -> stripMarkersFromTarget)`
        : undefined,
    ].filter((op): op is string => op !== undefined)
    const alsoApplies =
      extraOps.length > 0 ? ` This target's install ALSO applies ${extraOps.join(', then ')}.` : ''
    const compared = isMarkdownPath(datasetRelPath)
      ? `COMPARED: the installed mirror vs. TRANSFORM(dataset source) — NOT vs. the raw dataset ` +
        `source ${datasetPath}. This corpus is transformed on install ('/short-name' -> ` +
        `'/pair-<category>-<name>', plus '.skills/**' SKILL.md link paths), so a mirror that is ` +
        `byte-identical to its dataset source is itself the drift, not the invariant.${alsoApplies}`
      : `COMPARED: the installed mirror vs. its dataset source ${datasetPath} byte for byte. This ` +
        `file is NOT markdown, and the install-time content rewrites walk '.md' only, so here ` +
        `the transform is the identity and byte-equality IS the invariant.`
    throw new Error(
      `Mirror ${mirrorPath} has drifted.\n` +
        `${compared}\n` +
        `Regenerate with '${MIRROR_REGENERATE_COMMAND}' — never hand-edit the mirror.\n` +
        `--- expected (dataset -> real 'pair update' transform)\n` +
        `+++ actual (installed mirror on disk)\n` +
        `${diffSkillMd(expected, actual)}`,
    )
  }
}

/**
 * True iff the mirror is frozen in an UNTRANSFORMED state: byte-identical to
 * its dataset source although the transform would have changed it.
 *
 * This is the specific anomaly #393 closes, named separately from the generic
 * drift assertion because it has its own diagnosis: the file was hand-ported
 * (or pinned by a byte-equality guard) instead of regenerated. A file the
 * transform legitimately leaves untouched — one with no skill references at all
 * — is NOT frozen: `expected === source`, so it reports false.
 */
export function isFrozenUntransformed(
  source: string,
  mirror: string | undefined,
  expected: string,
): boolean {
  return mirror !== undefined && mirror === source && expected !== source
}
