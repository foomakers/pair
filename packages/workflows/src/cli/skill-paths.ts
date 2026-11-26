import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { RunFiles } from '../engine'
import { isPlainObject, registryEntries, registryTargets } from './project-config'

export function skillsLayout(config: unknown) {
  const skills = registryEntries(config)['skills']
  if (!isPlainObject(skills)) return { targets: ['.claude/skills'], prefix: undefined }
  return {
    targets: registryTargets('skills', skills).map(target => target.path),
    prefix: skills['prefix'] == null ? undefined : String(skills['prefix']),
  }
}

function withinDirectory(root: string, path: string): boolean {
  const child = relative(root, path)
  return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

/** Candidate directories in install order for a skill named in a workflow. */
export function skillPaths(
  root: string,
  targets: readonly string[],
  prefix: string | undefined,
  name: string,
): string[] {
  const marker = prefix ? `${prefix}-` : ''
  const names =
    marker === ''
      ? [name]
      : [name, marker + name, ...(name.startsWith(marker) ? [name.slice(marker.length)] : [])]
  return targets.flatMap(target => {
    const directory = resolve(root, target)
    return names
      .map(candidate => resolve(directory, candidate))
      .filter(path => path !== directory && withinDirectory(directory, path))
  })
}

export function findSkillFile(
  isFile: (path: string) => boolean,
  root: string,
  { targets, prefix }: { targets: readonly string[]; prefix?: string | undefined },
  name: string,
): string | undefined {
  return skillPaths(root, targets, prefix, name)
    .map(dir => join(dir, 'SKILL.md'))
    .find(isFile)
}

type Layout = ReturnType<typeof skillsLayout>
type Files = Pick<RunFiles, 'existsSync' | 'readFileSync'>

function installedNames(fs: Files, root: string) {
  const file = join(root, '.pair', '.skill-name-map.json')
  if (!fs.existsSync(file)) return undefined
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file))
    return isPlainObject(parsed) && parsed['version'] === 1 && isPlainObject(parsed['skills'])
      ? { skills: parsed['skills'], targets: parsed['targets'] }
      : undefined
  } catch {
    return undefined
  }
}

function layoutCandidates(root: string, layout: Layout, name: string) {
  const bare = name.replace(/^pair-/, '')
  const installed = [layout.prefix, bare].filter(Boolean).join('-')
  return layout.targets.flatMap(target => [
    ...skillPaths(root, [target], undefined, installed),
    ...skillPaths(root, [target], layout.prefix, name),
    ...skillPaths(root, [target], undefined, bare),
  ])
}

/** Installer identity wins after a one-off configuration or an update retaining old aliases. */
export function defaultSkillPaths(
  fs: Files,
  root: string,
  layouts: readonly [Layout, ...Layout[]],
  name: string,
): string[] {
  const manifest = installedNames(fs, root)
  const short = name.replace(/^pair-(?:(?:process|capability|workflow)-)?/, '')
  const installed = manifest?.skills[short]
  if (typeof installed === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(installed)) {
    const targets = Array.isArray(manifest?.targets)
      ? manifest.targets.filter(
          (target): target is string =>
            typeof target === 'string' &&
            !isAbsolute(target) &&
            withinDirectory(root, resolve(root, target)),
        )
      : []
    return skillPaths(root, [...targets, ...layouts[0].targets], undefined, installed)
  }
  return layouts.flatMap(layout => layoutCandidates(root, layout, name))
}

export function findDefaultSkill(
  isFile: (path: string) => boolean,
  root: string,
  candidates: readonly string[],
  name: string,
): string | undefined {
  const dir = candidates.find(path => isFile(join(path, 'SKILL.md')))
  if (dir !== undefined) return basename(dir)
  const [, category, skill] = /^pair-(capability|process|workflow)-([\w-]+)$/.exec(name) ?? []
  return category && skill && isFile(join(root, '.skills', category, skill, 'SKILL.md'))
    ? name
    : undefined
}
