import { isAbsolute, join, relative, resolve } from 'node:path'
import { isPlainObject, registryEntries, registryTargets } from './project-config'

export function skillsLayout(config: unknown) {
  const skills = registryEntries(config)['skills']
  if (!isPlainObject(skills)) return { targets: ['.claude/skills'], prefix: undefined }
  return {
    targets: registryTargets('skills', skills).map(target => target.path),
    prefix: skills['prefix'] == null ? undefined : String(skills['prefix']),
  }
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
      .filter(path => {
        const inside = relative(directory, path)
        return inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)
      })
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
