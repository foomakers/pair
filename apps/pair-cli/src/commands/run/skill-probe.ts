import {
  defaultSkillPaths,
  findDefaultSkill,
  findSkillFile,
  skillsLayout,
} from '@pair/workflows/cli'
import type { FileSystemService } from '@pair/content-ops'
import type { Config } from '#registry'
import type { SkillProbe } from './resolve-skill'

const isFile = (fs: FileSystemService) => (path: string) =>
  fs.existsSync(path) && fs.statSync(path).isFile()

/**
 * Builds the "is this skill installed" probe from the SAME layout knowledge `pair-cli install`
 * writes with (ADR-005): the `skills` registry's target paths and its `prefix`. Nothing here
 * re-derives an installation path — a project that redirected its skills targets in
 * `pair.config.json` is probed where its skills actually are.
 *
 * Workflow `skill:` names are literal. Default and CLI-selected skills also support
 * the registry prefix aliases used by the resolver.
 */
export function createSkillProbe(
  fs: FileSystemService,
  config: Config,
  projectRoot: string,
  exact = false,
): SkillProbe {
  const { targets, prefix } = skillsLayout(config)
  const check = isFile(fs)
  const layout = { targets, prefix: exact ? undefined : prefix }
  return name => findSkillFile(check, projectRoot, layout, name) !== undefined
}

/** Read the installed skill through the same registry targets as the existence probe. */
export function readInstalledSkill(
  fs: FileSystemService,
  config: Config,
  projectRoot: string,
  name: string,
): string | undefined {
  const path = findSkillFile(isFile(fs), projectRoot, skillsLayout(config), name)
  return path === undefined ? undefined : fs.readFileSync(path)
}

/** The name an implicit workflow step invokes in this installation. */
export function workflowDefaultSkill(fs: FileSystemService, config: Config, root: string) {
  const layout = skillsLayout(config)
  return (name: string) =>
    findDefaultSkill(isFile(fs), root, defaultSkillPaths(fs, root, [layout], name), name)
}
