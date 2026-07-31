import type { SkillNameMap, SkillLinkPathMap } from '../skill-reference-rewriter'

/**
 * Result of a copy operation. Carries the skill name map when a transform copy
 * renamed skills, so callers can chain reference rewrites, plus the matching
 * link-path map so callers can chain SKILL.md cross-reference PATH rewrites.
 */
export type CopyPathOpsResult = {
  skillNameMap?: SkillNameMap
  skillLinkPathMap?: SkillLinkPathMap
}

/**
 * Naming transform options (flatten and/or prefix, optionally depth-bounded).
 * Declared next to `transformPath`, which consumes it — re-exported here so the
 * copy modules keep importing their types from one place.
 */
export type { TransformOpts } from '../naming-transforms'
