/**
 * Mirror-consistency helpers for `.pair/knowledge/skills-guide.md`.
 *
 * That root-level file is a MANUALLY maintained copy of the canonical
 * `packages/knowledge-hub/dataset/.pair/knowledge/skills-guide.md` — it is
 * NOT one of the `transfer-dataset` pipeline's copy targets (see
 * `packages/knowledge-hub/package.json`'s `transfer:dataset` script and its
 * callers), so the install-time skill-reference/link rewriting that keeps
 * `.claude/skills/**` in sync never touches it. It has drifted from the
 * canonical source twice (flagged in PR #319's review, never actioned;
 * fixed again in PR #336) because nothing enforced the sync.
 *
 * These helpers reconstruct, from the real dataset `.skills/` tree, the same
 * `skillNameMap` the real transfer pipeline computes — via the canonical
 * `buildSkillNameMap`/`transformPath`/`rewriteSkillReferences` exported by
 * `@pair/content-ops` (see `packages/content-ops/src/ops/skill-reference-rewriter.ts`
 * and `packages/content-ops/src/ops/copy/copy-directory-transforms.ts`,
 * which use the exact same functions in production). `buildSkillLinkPathMap`
 * reproduces the one further conversion no exported function covers: the
 * dataset's own `SKILL.md` cross-reference paths
 * (`../../.skills/capability/<name>/SKILL.md`) must become installed paths
 * (`../../.claude/skills/<prefixed-name>/SKILL.md`) in the root mirror — a
 * conversion that normally only happens inside the full copy pipeline
 * (`rewriteLinksAfterTransform`), which skills-guide.md never goes through.
 * It's still derived from `transformPath`, not a parallel name-guessing
 * regex.
 *
 * IMPORTANT — the raw mechanical transform does NOT reproduce the whole file
 * byte-for-byte: skills-guide.md contains exactly two spans where a human
 * curator deliberately deviates from the mechanical rule:
 *   1. The "Composition Pattern" ASCII diagram lives inside a ```text fence
 *      but the author DOES prefix its skill names (unlike
 *      `rewriteSkillReferences`'s default, which treats fenced code as
 *      inert example text and skips it).
 *   2. Several "Unprefixed dataset command names (...)" phrases in Migration
 *      Notes are self-referential — they're TALKING ABOUT the unprefixed
 *      form itself, so they must stay unprefixed in both the dataset and
 *      the root mirror, even though they're plain prose the mechanical rule
 *      would otherwise rewrite.
 * `reconstructFullMirror` models both exceptions as explicit, narrow
 * overrides applied on top of the mechanical pass (not by skipping
 * validation there) — see its own docs — so `skills-guide-mirror.test.ts`
 * can assert whole-file byte-for-byte equality against the root mirror,
 * not just a handful of anchored paragraphs.
 */
import { readdirSync } from 'fs'
import { join, relative, sep } from 'path'
import {
  buildSkillNameMap,
  rewriteSkillReferences,
  transformPath,
  type SkillNameMap,
} from '@pair/content-ops'

/**
 * Recursively finds directories under `root` that directly contain at least
 * one file, returned as posix-style paths relative to `root`. Mirrors what
 * the real transfer pipeline collects into `dirMappingFiles` while copying
 * `.skills/**` (see `copy-directory-transforms.ts`'s `trackTransformedFile`) —
 * every such directory is a skill's own directory (`capability/<name>`,
 * `process/<name>`, or the bare `next`).
 */
export function collectSkillDirs(root: string): string[] {
  const dirs: string[] = []

  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true })
    let hasFile = false
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else {
        hasFile = true
      }
    }
    if (hasFile) {
      const rel = relative(root, dir).split(sep).join('/')
      if (rel !== '') dirs.push(rel)
    }
  }

  walk(root)
  return dirs
}

/**
 * Builds the real `skillNameMap` (short name -> installed prefixed name)
 * from the dataset's `.skills/` tree, using the same canonical
 * `buildSkillNameMap` + `{ flatten: true, prefix: 'pair' }` options the real
 * transfer pipeline uses (see `copy-directory-transforms.ts`'s
 * `applySkillReferenceRewrites`).
 */
export function buildDatasetSkillNameMap(skillsDir: string): SkillNameMap {
  const dirMappingFiles = new Map<string, string[]>(collectSkillDirs(skillsDir).map(d => [d, []]))
  return buildSkillNameMap(dirMappingFiles, { flatten: true, prefix: 'pair' })
}

/**
 * Maps each dataset-source `SKILL.md` cross-reference path (e.g.
 * `../../.skills/capability/map-subdomains/SKILL.md`) to its installed
 * equivalent (e.g.
 * `../../.claude/skills/pair-capability-map-subdomains/SKILL.md`), for every
 * nested (`category/name`) skill directory found under `skillsDir`. Built
 * directly from `transformPath` (the same canonical function the real
 * transfer pipeline calls) — not a parallel name-guessing regex. See module
 * docs for why this one conversion needs reproducing here instead of reusing
 * a higher-level pipeline function.
 */
export function buildSkillLinkPathMap(skillsDir: string): Map<string, string> {
  const linkMap = new Map<string, string>()
  for (const dir of collectSkillDirs(skillsDir)) {
    if (!dir.includes('/')) continue // e.g. "next" — no SKILL.md cross-reference use case today
    const transformed = transformPath(dir, { flatten: true, prefix: 'pair' })
    linkMap.set(`../../.skills/${dir}/SKILL.md`, `../../.claude/skills/${transformed}/SKILL.md`)
  }
  return linkMap
}

/**
 * Applies both known mechanical transforms (skill-reference `/verb` rewrite,
 * then SKILL.md link-path rewrite) to an arbitrary snippet of dataset
 * content. See module docs for the two spans where the real file
 * deliberately deviates from this mechanical rule — callers should apply
 * this only to text outside those spans (e.g. via `extractLineContaining`).
 */
export function applyKnownMirrorTransforms(
  text: string,
  skillNameMap: SkillNameMap,
  linkPathMap: Map<string, string>,
): string {
  let result = rewriteSkillReferences(text, skillNameMap)
  for (const [sourceLink, installedLink] of linkPathMap) {
    result = result.split(sourceLink).join(installedLink)
  }
  return result
}

/**
 * Finds and returns the first line in `content` containing `anchor`.
 * Throws (rather than returning undefined) if the anchor isn't found, so a
 * future edit that removes/rewords the anchored paragraph fails the test
 * loudly instead of silently no-op'ing the check.
 */
export function extractLineContaining(content: string, anchor: string): string {
  const line = content.split('\n').find(l => l.includes(anchor))
  if (line === undefined) {
    throw new Error(`extractLineContaining: no line contains anchor ${JSON.stringify(anchor)}`)
  }
  return line
}

/** Heading that immediately precedes the one fence exempt from fence-skip (exception 1). */
const COMPOSITION_PATTERN_HEADING = '## Composition Pattern'

/** Phrase marking the self-referential unprefixed-dataset-command-name spans (exception 2). */
const MIGRATION_NOTES_UNPREFIXED_ANCHOR = 'Unprefixed dataset command names'

/**
 * Finds the ``` -fenced block that immediately follows a given heading line
 * (matched by exact trimmed text), returning the line indices of its open
 * and close fence markers (both inclusive) in `lines`. Throws if the heading
 * or a following fence isn't found, so a future reflow/rewording fails this
 * loudly instead of silently operating on the wrong block.
 */
function findFencedBlockAfterHeading(
  lines: readonly string[],
  heading: string,
): { open: number; close: number } {
  const headingIdx = lines.findIndex(l => l.trim() === heading)
  if (headingIdx === -1) {
    throw new Error(`findFencedBlockAfterHeading: heading ${JSON.stringify(heading)} not found`)
  }
  let open = -1
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^ {0,3}```/.test(lines[i]!)) {
      open = i
      break
    }
  }
  if (open === -1) {
    throw new Error(
      `findFencedBlockAfterHeading: no fence found after heading ${JSON.stringify(heading)}`,
    )
  }
  let close = -1
  for (let i = open + 1; i < lines.length; i++) {
    if (/^ {0,3}```\s*$/.test(lines[i]!)) {
      close = i
      break
    }
  }
  if (close === -1) {
    throw new Error(
      `findFencedBlockAfterHeading: unterminated fence after heading ${JSON.stringify(heading)}`,
    )
  }
  return { open, close }
}

/**
 * Exception 1 override: the "Composition Pattern" fence is the one fence
 * skills-guide.md's author DOES prefix-transform (see module docs), unlike
 * `rewriteSkillReferences`'s default fence-skip. Re-derives the block's
 * transformed content directly from the dataset's own (short-form) fence
 * lines — `targetLines` has this block untouched up to this point, since the
 * mechanical pass that produced it skipped every fence, this one included —
 * and splices the transformed lines back into `targetLines` in place.
 */
function applyCompositionPatternFenceException(
  datasetLines: readonly string[],
  targetLines: readonly string[],
  skillNameMap: SkillNameMap,
  linkPathMap: Map<string, string>,
): string[] {
  const { open, close } = findFencedBlockAfterHeading(datasetLines, COMPOSITION_PATTERN_HEADING)
  const innerDataset = datasetLines.slice(open + 1, close).join('\n')
  const innerTransformed = applyKnownMirrorTransforms(innerDataset, skillNameMap, linkPathMap)
  const result = [...targetLines]
  result.splice(open + 1, close - open - 1, ...innerTransformed.split('\n'))
  return result
}

/**
 * Exception 2 override: from the `MIGRATION_NOTES_UNPREFIXED_ANCHOR` phrase
 * to end-of-line, Migration Notes prose is TALKING ABOUT the unprefixed
 * dataset command form itself (see module docs) and must stay verbatim —
 * copied byte-for-byte from the dataset line, not reprocessed. Only the
 * portion of the line BEFORE the anchor phrase gets the real mechanical
 * transform (re-applied here directly from the dataset line, independent of
 * whatever `targetLines` already holds for that line).
 */
function restoreUnprefixedDatasetCommandNameMentions(
  datasetLines: readonly string[],
  targetLines: readonly string[],
  skillNameMap: SkillNameMap,
  linkPathMap: Map<string, string>,
): string[] {
  return targetLines.map((line, i) => {
    const datasetLine = datasetLines[i]
    if (datasetLine === undefined) return line
    const anchorIdx = datasetLine.indexOf(MIGRATION_NOTES_UNPREFIXED_ANCHOR)
    if (anchorIdx === -1) return line
    const before = datasetLine.slice(0, anchorIdx)
    const verbatimFromAnchor = datasetLine.slice(anchorIdx)
    return applyKnownMirrorTransforms(before, skillNameMap, linkPathMap) + verbatimFromAnchor
  })
}

/**
 * Reconstructs the FULL root-mirror content from the dataset content: the
 * mechanical transform (`applyKnownMirrorTransforms`) applied everywhere,
 * with the two known deliberate-exception spans (see module docs) then
 * explicitly overridden to their correct, narrowly-scoped behavior — not by
 * skipping validation on those spans, but by modeling exactly what should
 * happen there. The result is byte-for-byte equal to
 * `.pair/knowledge/skills-guide.md` iff no OTHER, undocumented manual
 * divergence exists — that equality is exactly what
 * `skills-guide-mirror.test.ts`'s full-file test asserts.
 */
export function reconstructFullMirror(
  datasetContent: string,
  skillNameMap: SkillNameMap,
  linkPathMap: Map<string, string>,
): string {
  const datasetLines = datasetContent.split('\n')
  const baseTransformed = applyKnownMirrorTransforms(datasetContent, skillNameMap, linkPathMap)
  const withFenceException = applyCompositionPatternFenceException(
    datasetLines,
    baseTransformed.split('\n'),
    skillNameMap,
    linkPathMap,
  )
  const withMigrationNotesException = restoreUnprefixedDatasetCommandNameMentions(
    datasetLines,
    withFenceException,
    skillNameMap,
    linkPathMap,
  )
  return withMigrationNotesException.join('\n')
}
