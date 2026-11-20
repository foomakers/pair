import { join, relative, resolve, isAbsolute } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import { extractRegistries, type Config } from '#registry'
import type { SkillProbe } from './resolve-skill'

/** The registry whose entries ARE the installed skills. */
const SKILLS_REGISTRY = 'skills'

/**
 * Builds the "is this skill installed" probe from the SAME layout knowledge `pair-cli install`
 * writes with (ADR-005): the `skills` registry's target paths and its `prefix`. Nothing here
 * re-derives an installation path — a project that redirected its skills targets in
 * `pair.config.json` is probed where its skills actually are.
 *
 * A skill is installed when `<target>/<prefix>-<name>/SKILL.md` exists under any of the
 * registry's targets. The prefixed and unprefixed names are both accepted: the registry
 * prefixes installed directories (`pair-loop`), while a hand-installed or symlinked skill may
 * carry the bare dataset name.
 */
export function createSkillProbe(
  fs: FileSystemService,
  config: Config,
  projectRoot: string,
): SkillProbe {
  const registry = extractRegistries(config)[SKILLS_REGISTRY]
  const targets = registry?.targets?.map(target => target.path) ?? ['.claude/skills']
  const prefix = registry?.prefix

  return (name: string) => {
    const directories = prefix ? [name, `${prefix}-${name}`, stripPrefix(name, prefix)] : [name]
    return targets.some(target =>
      directories.some(directory => isInstalledUnder(fs, projectRoot, target, directory)),
    )
  }
}

/** Read the installed skill through the same registry targets as the existence probe. */
export function readInstalledSkill(
  fs: FileSystemService,
  config: Config,
  projectRoot: string,
  name: string,
): string | undefined {
  const registry = extractRegistries(config)[SKILLS_REGISTRY]
  const targets = registry?.targets?.map(target => target.path) ?? ['.claude/skills']
  const prefix = registry?.prefix
  const directories = prefix ? [name, `${prefix}-${name}`, stripPrefix(name, prefix)] : [name]
  for (const target of targets)
    for (const directory of directories) {
      const path = installedSkillPath(fs, projectRoot, target, directory)
      if (path) return fs.readFileSync(path)
    }
  return undefined
}

/**
 * Whether `<target>/<directory>/SKILL.md` exists AND stays inside `<target>` (round 7, Major).
 *
 * `existsSync` answers "is there a file at this path", which is not a boundary: the skill name is a
 * PATH SEGMENT, so a traversing name resolves to a real file outside the project and the probe used
 * to report it installed — `/project/.claude/skills/` + `../../../outside/x` lands on `/outside/x`.
 * `--skill` is `isSafeId`-checked at parse time too, but the containment belongs HERE as well: the
 * probe is also called with the cascade names, and a path check belongs where the path is built.
 */
function isInstalledUnder(
  fs: FileSystemService,
  projectRoot: string,
  target: string,
  directory: string,
): boolean {
  return installedSkillPath(fs, projectRoot, target, directory) !== undefined
}

function installedSkillPath(
  fs: FileSystemService,
  projectRoot: string,
  target: string,
  directory: string,
): string | undefined {
  const targetRoot = resolve(projectRoot, target)
  const candidate = resolve(targetRoot, directory)
  const inside = relative(targetRoot, candidate)
  if (inside.startsWith('..') || isAbsolute(inside)) return undefined
  const path = join(candidate, 'SKILL.md')
  return fs.existsSync(path) ? path : undefined
}

/** `pair-loop` installed from dataset entry `loop`: probe the bare name too. */
function stripPrefix(name: string, prefix: string): string {
  return name.startsWith(`${prefix}-`) ? name.slice(prefix.length + 1) : name
}
