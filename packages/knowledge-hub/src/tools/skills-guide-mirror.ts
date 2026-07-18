/**
 * Mirror-consistency helpers for `.pair/knowledge/skills-guide.md`.
 *
 * The root-level file is GENERATED from the canonical
 * `packages/knowledge-hub/dataset/.pair/knowledge/skills-guide.md` by
 * `pair update`: the copy pipeline applies the exact same content-ops
 * transforms — `rewriteSkillReferences` (the `/command` token rewrite) and
 * `rewriteSkillLinkPaths` (the SKILL.md cross-reference PATH rewrite) — that
 * these helpers reproduce here from the real dataset `.skills/` tree. Because
 * the dataset file is authored to be transform-correct (the Composition
 * Pattern diagram already carries prefixed names; the self-referential
 * "Unprefixed dataset command names" phrases carry no leading-slash token),
 * the mechanical transform reproduces the root mirror byte-for-byte with NO
 * manual exceptions — that whole-file equality is what
 * `skills-guide-mirror.test.ts` asserts.
 *
 * The `skillNameMap` is built via the canonical `buildSkillNameMap` /
 * `transformPath` exported by `@pair/content-ops` (the same functions the real
 * copy pipeline uses). `buildSkillLinkPathMap` derives the SKILL.md link-path
 * map from `transformPath` as well — not a parallel name-guessing regex.
 */
import { readdirSync } from 'fs'
import { join, relative, sep } from 'path'
import {
  buildSkillNameMap,
  buildSkillLinkPathMap as prodBuildSkillLinkPathMap,
  rewriteSkillReferences,
  rewriteSkillLinkPaths,
  type SkillNameMap,
  type SkillLinkPathMap,
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
 * Skill SKILL.md link-path map (`../.skills/<cat>/<name>/SKILL.md` →
 * `../.claude/skills/<prefixed>/SKILL.md`) for every nested skill dir under
 * `skillsDir`. Delegates to the PRODUCTION `buildSkillLinkPathMap` (same
 * function `pair update` uses) so a bug in the real map construction is caught
 * by the conformance test, not masked by a parallel implementation.
 */
export function buildSkillLinkPathMap(skillsDir: string): SkillLinkPathMap {
  const dirMappingFiles = new Map<string, string[]>(collectSkillDirs(skillsDir).map(d => [d, []]))
  return prodBuildSkillLinkPathMap(dirMappingFiles, { flatten: true, prefix: 'pair' })
}

/**
 * Applies the real content-ops mirror transform to a snippet of dataset
 * content: `rewriteSkillReferences` (the `/command` token rewrite), then
 * `rewriteSkillLinkPaths` (the SKILL.md link-path rewrite). This is the exact
 * transform the `pair update` pipeline applies to the installed skills-guide.md,
 * with no manual exceptions.
 */
export function applyKnownMirrorTransforms(
  text: string,
  skillNameMap: SkillNameMap,
  linkPathMap: Map<string, string>,
): string {
  return rewriteSkillLinkPaths(rewriteSkillReferences(text, skillNameMap), linkPathMap)
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
