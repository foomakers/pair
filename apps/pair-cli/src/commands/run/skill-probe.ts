import {
  defaultSkillPaths,
  engineSkillProbe,
  findDefaultSkill,
  findSkillFile,
  skillsLayout,
} from '@pair/workflows/cli'
import type { FileSystemService } from '@pair/content-ops'
import type { Config } from '#registry'
import type { SkillProbe } from './resolve-skill'
import type { EngineId } from './engines'

const isFile = (fs: FileSystemService) => (path: string) =>
  fs.existsSync(path) && fs.statSync(path).isFile()

/**
 * Engine-specific lookups use the engine inventory. Legacy CLI selection uses the
 * installation registry and supports its prefix aliases.
 */
export function createSkillProbe(
  fs: FileSystemService,
  config: Config,
  projectRoot: string,
  ...[exact = false, engine]: [boolean?, EngineId?]
): SkillProbe {
  const probe = engineSkillProbe(fs, isFile(fs), projectRoot, { config, exact, engine })
  return name => probe(name)
}

/** Literal workflow names as seen by the selected engine. */
export function workflowSkillProbe(
  fs: FileSystemService,
  config: Config,
  root: string,
  engine: EngineId,
) {
  return engineSkillProbe(fs, isFile(fs), root, { config, engine })
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
