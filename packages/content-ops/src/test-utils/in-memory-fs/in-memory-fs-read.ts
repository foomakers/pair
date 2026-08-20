import type { Dirent, Stats } from 'fs'
import { dirname } from 'path'
import { InMemoryFsState } from './in-memory-fs-state'

export function readFileSync(state: InMemoryFsState, path: string): string {
  const resolvedPath = state.resolvePath(path)
  const file = state.files.get(resolvedPath)
  if (!file) throw new Error(`File not found: ${path}`)
  return file
}

/**
 * Byte-mode read mirroring the real service (US-395/#429). Binary content is stored
 * latin1-encoded by `writeFileBinary`, so latin1 is what reverses it byte-for-byte.
 */
export function readFileBytes(state: InMemoryFsState, path: string): Buffer {
  return Buffer.from(readFileSync(state, path), 'latin1')
}

export function existsSync(state: InMemoryFsState, path: string): boolean {
  const resolvedPath = state.resolvePath(path)
  return state.files.has(resolvedPath) || state.dirs.has(resolvedPath)
}

export async function stat(state: InMemoryFsState, path: string): Promise<Stats> {
  const resolvedPath = state.resolvePath(path)
  if (state.dirs.has(resolvedPath)) {
    return { isDirectory: () => true, isFile: () => false } as Stats
  }
  if (state.files.has(resolvedPath)) {
    return { isDirectory: () => false, isFile: () => true } as Stats
  }
  throw new Error(`no such file or directory '${path}'`)
}

/**
 * The physical path, resolving any symlink component recorded through `symlink()`.
 *
 * Throws when the path does not exist, exactly as `fs.realpath` does — callers bounding
 * untrusted content read that as "nothing to dereference", not as "contained".
 */
export function realpathSync(state: InMemoryFsState, path: string): string {
  const resolvedPath = state.resolvePath(path)
  const seen = new Set<string>()
  let current = resolvedPath
  // Walk the ancestry outwards so a symlinked PARENT is resolved too, not only a
  // symlinked leaf — the escape a leaf-only check misses.
  for (let guard = 0; guard < 64; guard++) {
    const link = firstSymlinkedAncestor(state, current)
    if (!link) break
    if (seen.has(link.linkPath)) throw new Error(`ELOOP: too many symbolic links '${path}'`)
    seen.add(link.linkPath)
    current = link.rest ? `${link.target}/${link.rest}` : link.target
  }
  if (!state.files.has(current) && !state.dirs.has(current)) {
    throw new Error(`no such file or directory '${path}'`)
  }
  return current
}

function firstSymlinkedAncestor(
  state: InMemoryFsState,
  path: string,
): { linkPath: string; target: string; rest: string } | null {
  let candidate = path
  let rest = ''
  while (candidate && candidate !== dirname(candidate)) {
    const target = state.symlinks.get(candidate)
    if (target) return { linkPath: candidate, target, rest }
    const name = candidate.slice(dirname(candidate).length + 1)
    rest = rest ? `${name}/${rest}` : name
    candidate = dirname(candidate)
  }
  return null
}

export async function readdir(state: InMemoryFsState, path: string): Promise<Dirent[]> {
  const resolvedPath = state.resolvePath(path)
  if (!state.dirs.has(resolvedPath)) {
    // Carries the errno node's `fs.readdir` carries. Callers on the DESTRUCTIVE mirror
    // path branch on it — "absent" (ENOENT: the target goes too) vs. "unreadable"
    // (EACCES/EIO/…: touch nothing) — so a double that reports absence without a code
    // would let that split be asserted against a fiction.
    throw Object.assign(new Error(`no such file or directory '${path}'`), { code: 'ENOENT' })
  }

  const entries: Dirent[] = []
  for (const d of state.dirs) {
    if (d === resolvedPath) continue
    if (dirname(d) === resolvedPath) {
      const name = d.replace(`${resolvedPath}/`, '')
      entries.push(state.makeDirent(name, true))
    }
  }

  for (const filePath of state.files.keys()) {
    if (dirname(filePath) === resolvedPath) {
      const name = filePath.replace(`${resolvedPath}/`, '')
      entries.push(state.makeDirent(name, false))
    }
  }

  return entries
}

export function getContent(state: InMemoryFsState, path: string): string | undefined {
  const resolvedPath = state.resolvePath(path)
  return state.files.get(resolvedPath)
}

export function getMode(state: InMemoryFsState, path: string): number | undefined {
  const resolvedPath = state.resolvePath(path)
  return state.modes.get(resolvedPath)
}

export async function isFile(state: InMemoryFsState, path: string): Promise<boolean> {
  return stat(state, path).then(stats => stats.isFile())
}

export async function isFolder(state: InMemoryFsState, path: string): Promise<boolean> {
  try {
    const isFileResult = await isFile(state, path)
    return !isFileResult
  } catch {
    return false
  }
}
