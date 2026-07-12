import type { Dirent, Stats } from 'fs'
import { dirname } from 'path'
import { InMemoryFsState } from './in-memory-fs-state'

export function readFileSync(state: InMemoryFsState, path: string): string {
  const resolvedPath = state.resolvePath(path)
  const file = state.files.get(resolvedPath)
  if (!file) throw new Error(`File not found: ${path}`)
  return file
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

export async function readdir(state: InMemoryFsState, path: string): Promise<Dirent[]> {
  const resolvedPath = state.resolvePath(path)
  if (!state.dirs.has(resolvedPath)) {
    throw new Error(`no such file or directory '${path}'`)
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
