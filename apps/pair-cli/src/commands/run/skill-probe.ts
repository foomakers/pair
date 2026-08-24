import { join } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import { extractRegistries, type Config } from '#registry'
import type { SkillProbe } from './resolve-skill'

/** The registry whose entries ARE the installed skills. */
const SKILLS_REGISTRY = 'skills'

/**
 * Builds the "is this skill installed" probe from the SAME layout knowledge `pair install`
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
      directories.some(directory =>
        fs.existsSync(join(projectRoot, target, directory, 'SKILL.md')),
      ),
    )
  }
}

/** `pair-loop` installed from dataset entry `loop`: probe the bare name too. */
function stripPrefix(name: string, prefix: string): string {
  return name.startsWith(`${prefix}-`) ? name.slice(prefix.length + 1) : name
}
