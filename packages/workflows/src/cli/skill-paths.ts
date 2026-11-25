import { isAbsolute, relative, resolve } from 'node:path'

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
