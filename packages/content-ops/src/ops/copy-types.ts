import type { SkillNameMap } from './skill-reference-rewriter'

/**
 * Result of a copy operation. Carries the skill name map when a
 * transform copy renamed skills, so callers can chain reference rewrites.
 */
export type CopyPathOpsResult = {
  skillNameMap?: SkillNameMap
}

/** Naming transform options (flatten and/or prefix) applied during a copy. */
export type TransformOpts = { flatten: boolean; prefix?: string }
