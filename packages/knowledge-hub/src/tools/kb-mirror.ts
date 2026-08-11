/**
 * Mirror-equality helpers for the root `.pair/knowledge` KB tree.
 *
 * THE RULE THIS MODULE ENCODES (#393): **a mirror guard compares the OUTPUT of
 * the transform, never the source** — `expect(mirror).toBe(transform(dataset))`.
 * A guard asserting `mirror === dataset` asserts that no transform exists, which
 * is false for this corpus: `pair update` copies
 * `packages/knowledge-hub/dataset/.pair/knowledge/**` to `.pair/knowledge/**`
 * (the `knowledge` registry) and then rewrites, in every copied markdown file,
 * the `/command` skill references (`/assess-security` →
 * `/pair-capability-assess-security`) and the `.skills/**` SKILL.md link paths.
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
 * DIRECTIONAL (dataset → root), like its `skill-md-mirror` sibling: the
 * enumeration is keyed by DATASET files, so a root-only KB file with no dataset
 * source is never asserted — it is not drift.
 */
import { readdirSync } from 'fs'
import { join, relative, sep } from 'path'
import {
  buildDatasetSkillNameMap,
  buildSkillLinkPathMap,
  applyKnownMirrorTransforms,
} from './skills-guide-mirror'
// Borrowed from the sibling mirror module rather than duplicated: despite the
// `SkillMd` in its name (the context it was introduced in), `diffSkillMd` is a
// generic compact line-diff. Reusing it keeps ONE drift-report format across
// both mirror guards.
import { diffSkillMd } from './skill-md-mirror'

/** Repo-relative canonical source of the KB corpus (the `knowledge` registry's `source`). */
export const KB_DATASET_REL = 'packages/knowledge-hub/dataset/.pair/knowledge'
/** Repo-relative installed mirror of the KB corpus (the `knowledge` registry's target). */
export const KB_MIRROR_REL = '.pair/knowledge'

/** The KB mirror transform: dataset content → installed content. */
export type KbMirrorTransform = (text: string) => string

/**
 * Builds the REAL KB mirror transform from the dataset's `.skills/` tree — the
 * `/command` reference rewrite plus the SKILL.md link-path rewrite `pair update`
 * applies to every markdown file of a non-skills registry.
 *
 * Built once per guard run (the name/link maps are derived from a full walk of
 * `.skills/`), then applied per file.
 */
export function buildKbMirrorTransform(skillsDir: string): KbMirrorTransform {
  const skillNameMap = buildDatasetSkillNameMap(skillsDir)
  const linkPathMap = buildSkillLinkPathMap(skillsDir)
  return text => applyKnownMirrorTransforms(text, skillNameMap, linkPathMap)
}

/**
 * EVERY file the KB dataset contributes, as sorted posix paths relative to
 * `datasetKbDir`. Derived from the dataset at collection time and recursive, so a
 * newly added KB file is guarded with no test edit and nothing anywhere encodes
 * HOW MANY files exist.
 *
 * A PATH-ONLY walk on purpose: enumeration must not read contents (an earlier
 * version slurped all 445 files as utf-8 just to keep their names, which would
 * silently garble the first binary asset dropped under the KB dataset). The
 * caller reads the files it actually compares, once each.
 */
export function kbDatasetPaths(datasetKbDir: string): string[] {
  const paths: string[] = []

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else paths.push(relative(datasetKbDir, full).split(sep).join('/'))
    }
  }

  walk(datasetKbDir)
  return paths.sort()
}

/**
 * The markdown files the KB dataset contributes — the ones `pair update` runs
 * the content rewrites over, hence the ones whose mirror is compared against
 * `transform(source)`.
 */
export function kbDatasetMarkdownPaths(datasetKbDir: string): string[] {
  return kbDatasetPaths(datasetKbDir).filter(isKbMarkdown)
}

/**
 * The NON-markdown files the KB dataset contributes (today: three `assets/*.sh`
 * gate scripts and `assets/gitleaks-example.toml`). They are shipped by the same
 * `knowledge` registry and were previously unguarded — the content rewrites skip
 * them, so the transform is the identity by construction and their mirror must be
 * byte-equal to the source. Enumerated separately, asserted by the same helper.
 */
export function kbDatasetNonMarkdownPaths(datasetKbDir: string): string[] {
  return kbDatasetPaths(datasetKbDir).filter(rel => !isKbMarkdown(rel))
}

const isKbMarkdown = (rel: string): boolean => rel.endsWith('.md')

/**
 * Asserts one root KB mirror file equals the transform of its dataset source.
 *
 * Throws LOUDLY when the mirror is missing or has drifted, and the message
 * STATES WHAT IT COMPARES (AC3): "root mirror vs. transform(dataset source)",
 * plus why byte-equality with the raw source is the wrong target. That sentence
 * is the whole point of the helper — the assumption it refutes ("the two files
 * are an identical mirror") is exactly what a previous reader derived from a
 * message that did not say it.
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
 * `actual` is `undefined` iff the root mirror file does not exist.
 */
export function assertKbMirrorMatches(
  datasetRelPath: string,
  expected: string,
  actual: string | undefined,
): void {
  const mirrorPath = join(KB_MIRROR_REL, datasetRelPath)
  const datasetPath = join(KB_DATASET_REL, datasetRelPath)
  if (actual === undefined) {
    throw new Error(
      `KB mirror missing for dataset file '${datasetRelPath}': ${mirrorPath} does not exist. ` +
        `Run 'pair update' to regenerate it.`,
    )
  }
  if (actual !== expected) {
    const compared = isKbMarkdown(datasetRelPath)
      ? `COMPARED: the root mirror vs. TRANSFORM(dataset source) — NOT vs. the raw dataset ` +
        `source ${datasetPath}. The KB corpus is transformed on install ('/short-name' -> ` +
        `'/pair-<category>-<name>', plus '.skills/**' SKILL.md link paths), so a mirror that is ` +
        `byte-identical to its dataset source is itself the drift, not the invariant.`
      : `COMPARED: the root mirror vs. its dataset source ${datasetPath} byte for byte. This ` +
        `file is NOT markdown, and the install-time content rewrites walk '.md' only, so here ` +
        `the transform is the identity and byte-equality IS the invariant.`
    throw new Error(
      `KB mirror ${mirrorPath} has drifted.\n` +
        `${compared}\n` +
        `Regenerate with 'pair update' — never hand-edit the mirror.\n` +
        `--- expected (dataset -> real 'pair update' transform)\n` +
        `+++ actual (root mirror on disk)\n` +
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
