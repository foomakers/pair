import type { RunFiles } from '.'

/** An in-memory `RunFiles`, for tests of the package and of its hosts: no disk, no temp directory. */
export function createMemoryFiles(
  seed: Readonly<Record<string, string>> = {},
): RunFiles & { readonly entries: Map<string, string> } {
  const entries = new Map(Object.entries(seed))
  const directories = new Set<string>()
  const under = (path: string) => [...entries.keys()].filter(key => key.startsWith(`${path}/`))
  return {
    entries,
    existsSync: path => entries.has(path) || directories.has(path) || under(path).length > 0,
    readFileSync: path => {
      const content = entries.get(path)
      if (content === undefined) throw new Error(`ENOENT: ${path}`)
      return content
    },
    writeFile: async (path, content) => void entries.set(path, content),
    mkdir: async path => void directories.add(path),
    rename: async (from, to) => {
      const moved = [from, ...under(from)].filter(one => entries.has(one))
      if (moved.length === 0) throw new Error(`ENOENT: ${from}`)
      for (const key of moved) {
        entries.set(to + key.slice(from.length), entries.get(key) as string)
        entries.delete(key)
      }
    },
  }
}
