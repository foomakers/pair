/**
 * Mirror-equality helpers for the `pair update` registries whose install
 * REWRITES the content it copies — today the root `.pair/knowledge` KB tree and
 * the `.github/agents` agent files.
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
 * DIRECTIONAL (dataset → installed), like its `skill-md-mirror` sibling: the
 * enumeration is keyed by DATASET files, so an installed-only file with no
 * dataset source is never asserted — it is not drift.
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

/**
 * One `pair update` registry this module guards: where its content comes from,
 * where it is installed, and the `asset_registries` key that declares both.
 *
 * `key` is load-bearing, not decoration: the guard's tests read that entry of
 * `apps/pair-cli/config.json` and pin the assumptions the comparison rests on
 * (no `flatten`/`prefix` — `applySkillRefsToNonSkillRegistries` skips those
 * registries entirely — no per-target content transform, `behavior: "mirror"`).
 */
export interface MirrorRegistry {
  /** Key under `asset_registries` in `apps/pair-cli/config.json`. */
  readonly key: string
  /** Repo-relative root of the canonical source tree. */
  readonly datasetRel: string
  /** Repo-relative root of the installed tree. */
  readonly mirrorRel: string
}

/** The knowledge base: `dataset/.pair/knowledge/**` → `.pair/knowledge/**`. */
export const KB_MIRROR_REGISTRY: MirrorRegistry = {
  key: 'knowledge',
  datasetRel: 'packages/knowledge-hub/dataset/.pair/knowledge',
  mirrorRel: '.pair/knowledge',
}

/**
 * The GitHub agent files: `dataset/.github/**` → `.github/**` (narrowed by the
 * registry's own `include: ["/agents"]`, which the guard's tests honor).
 *
 * Same relationship as the KB tree — `behavior: "mirror"`, no flatten/prefix,
 * so the identical skill-ref + link-path rewrite runs over its markdown — and
 * therefore the same frozen/drifted failure mode. Added to this module (#393
 * review round 3) rather than left to a follow-up: the only registry-specific
 * inputs are the two paths above.
 */
export const GITHUB_AGENTS_MIRROR_REGISTRY: MirrorRegistry = {
  key: 'github',
  datasetRel: 'packages/knowledge-hub/dataset/.github',
  mirrorRel: '.github',
}

/**
 * Every registry whose installed copy is `transform(dataset)` rather than
 * `dataset`. A new one belongs here, not in a new guard: the data-driven suite
 * iterates this list.
 *
 * NOT the whole registry list on purpose. `adoption` is `behavior: "add"`
 * (seeded once, then owned by the adopting project — divergence is the point),
 * `agents` carries a per-target naming transform, and `skills` declares
 * flatten+prefix, which makes the pipeline skip the skill-ref rewrite for it
 * altogether (that pair is guarded by `skill-md-mirror`).
 */
export const REWRITTEN_MIRROR_REGISTRIES: readonly MirrorRegistry[] = [
  KB_MIRROR_REGISTRY,
  GITHUB_AGENTS_MIRROR_REGISTRY,
]

/** The mirror transform: dataset content → installed content. */
export type MirrorTransform = (text: string) => string

/**
 * Builds the REAL mirror transform from the dataset's `.skills/` tree — the
 * `/command` reference rewrite plus the SKILL.md link-path rewrite `pair update`
 * applies to every markdown file of a non-skills registry.
 *
 * Built once per guard run (the name/link maps are derived from a full walk of
 * `.skills/`), then applied per file.
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
 * EVERY file a dataset tree contributes, as sorted posix paths relative to
 * `datasetDir`. Derived from disk at collection time and recursive, so a newly
 * added file is guarded with no test edit and nothing anywhere encodes HOW MANY
 * files exist.
 *
 * A PATH-ONLY walk on purpose: enumeration must not read contents (an earlier
 * version slurped all 445 files as utf-8 just to keep their names, which would
 * silently garble the first binary asset dropped under the dataset). The
 * caller reads the files it actually compares, once each.
 */
export function datasetPaths(datasetDir: string): string[] {
  const paths: string[] = []

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else paths.push(relative(datasetDir, full).split(sep).join('/'))
    }
  }

  walk(datasetDir)
  return paths.sort()
}

/**
 * The markdown files a dataset tree contributes — the ones `pair update` runs
 * the content rewrites over, hence the ones whose mirror is compared against
 * `transform(source)`.
 */
export function datasetMarkdownPaths(datasetDir: string): string[] {
  return datasetPaths(datasetDir).filter(isMarkdown)
}

/**
 * The NON-markdown files a dataset tree contributes (today: three `assets/*.sh`
 * gate scripts and `assets/gitleaks-example.toml` under the KB). They are
 * shipped by the same registry and were previously unguarded — the content
 * rewrites skip them, so the transform is the identity by construction and
 * their mirror must be byte-equal to the source. Enumerated separately,
 * asserted by the same helper.
 */
export function datasetNonMarkdownPaths(datasetDir: string): string[] {
  return datasetPaths(datasetDir).filter(rel => !isMarkdown(rel))
}

const isMarkdown = (rel: string): boolean => rel.endsWith('.md')

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
  registry: MirrorRegistry,
  datasetRelPath: string,
  expected: string,
  actual: string | undefined,
): void {
  const mirrorPath = join(registry.mirrorRel, datasetRelPath)
  const datasetPath = join(registry.datasetRel, datasetRelPath)
  if (actual === undefined) {
    throw new Error(
      `Mirror missing for dataset file '${datasetRelPath}': ${mirrorPath} does not exist. ` +
        `Run 'pair update' to regenerate it.`,
    )
  }
  if (actual !== expected) {
    const compared = isMarkdown(datasetRelPath)
      ? `COMPARED: the installed mirror vs. TRANSFORM(dataset source) — NOT vs. the raw dataset ` +
        `source ${datasetPath}. This corpus is transformed on install ('/short-name' -> ` +
        `'/pair-<category>-<name>', plus '.skills/**' SKILL.md link paths), so a mirror that is ` +
        `byte-identical to its dataset source is itself the drift, not the invariant.`
      : `COMPARED: the installed mirror vs. its dataset source ${datasetPath} byte for byte. This ` +
        `file is NOT markdown, and the install-time content rewrites walk '.md' only, so here ` +
        `the transform is the identity and byte-equality IS the invariant.`
    throw new Error(
      `Mirror ${mirrorPath} has drifted.\n` +
        `${compared}\n` +
        `Regenerate with 'pair update' — never hand-edit the mirror.\n` +
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
