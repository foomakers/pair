import { dirname, resolve, isAbsolute } from 'path'
import { InMemoryFsState } from './in-memory-fs-state'

export async function writeFile(
  state: InMemoryFsState,
  path: string,
  content: string,
): Promise<void> {
  const resolvedPath = state.resolvePath(path)
  state.files.set(resolvedPath, content)
  // Create all parent directories recursively
  let p = dirname(resolvedPath)
  while (p && p !== dirname(p)) {
    state.dirs.add(p)
    const next = dirname(p)
    if (next === p) break
    p = next
  }
}

export async function writeFileBinary(
  state: InMemoryFsState,
  path: string,
  content: Buffer,
): Promise<void> {
  // Store binary data using latin1 encoding to preserve byte values
  await writeFile(state, path, content.toString('latin1'))
}

export async function unlink(state: InMemoryFsState, path: string): Promise<void> {
  const resolvedPath = state.resolvePath(path)
  if (!state.files.has(resolvedPath)) {
    throw new Error(`File not found: ${path}`)
  }
  state.files.delete(resolvedPath)
}

export function mkdirImpl(
  state: InMemoryFsState,
  path: string,
  options?: { recursive?: boolean },
): void {
  const resolvedPath = state.resolvePath(path)
  state.dirs.add(resolvedPath)
  if (options?.recursive) {
    let p = resolvedPath
    while (p && p !== dirname(p)) {
      state.dirs.add(p)
      const next = dirname(p)
      if (next === p) break
      p = next
    }
  }
}

export async function rename(
  state: InMemoryFsState,
  oldPath: string,
  newPath: string,
): Promise<void> {
  const resolvedOldPath = state.resolvePath(oldPath)
  const resolvedNewPath = state.resolvePath(newPath)

  // Check if source exists (either as file or directory)
  const sourceExists = state.files.has(resolvedOldPath) || state.dirs.has(resolvedOldPath)
  if (!sourceExists) {
    throw new Error(`Path not found: ${oldPath}`)
  }

  if (state.files.has(resolvedOldPath)) {
    const content = state.files.get(resolvedOldPath)!
    state.files.set(resolvedNewPath, content)
    state.files.delete(resolvedOldPath)
    state.dirs.add(dirname(resolvedNewPath))
    return
  }

  const oldPrefix = resolvedOldPath.endsWith('/') ? resolvedOldPath : resolvedOldPath + '/'
  const newPrefix = resolvedNewPath.endsWith('/') ? resolvedNewPath : resolvedNewPath + '/'

  const toMove: Array<[string, string]> = []
  for (const key of Array.from(state.files.keys())) {
    if (key === resolvedOldPath || key.startsWith(oldPrefix)) {
      const rel = key === resolvedOldPath ? '' : key.slice(oldPrefix.length)
      toMove.push([key, newPrefix + rel])
    }
  }
  toMove.forEach(([k, v]) => {
    const val = state.files.get(k)!
    state.files.set(v, val)
    state.files.delete(k)
    state.dirs.add(dirname(v))
  })

  const dirToMove = Array.from(state.dirs).filter(
    d => d === resolvedOldPath || d.startsWith(oldPrefix),
  )
  dirToMove.forEach(d => {
    const rel = d === resolvedOldPath ? '' : d.slice(oldPrefix.length)
    state.dirs.add(newPrefix + rel)
    state.dirs.delete(d)
  })
}

export function copyImpl(state: InMemoryFsState, oldPath: string, newPath: string): void {
  const resolvedOldPath = state.resolvePath(oldPath)
  const resolvedNewPath = state.resolvePath(newPath)
  if (state.dirs.has(resolvedOldPath)) {
    // copy directory recursively
    state.dirs.add(resolvedNewPath)
    const prefix = resolvedOldPath.endsWith('/') ? resolvedOldPath : resolvedOldPath + '/'
    for (const key of state.files.keys()) {
      if (key.startsWith(prefix)) {
        const relative = key.slice(prefix.length)
        const newKey = state.resolve(resolvedNewPath, relative)
        state.files.set(newKey, state.files.get(key)!)
        state.addParentDirectories(newKey)
      }
    }
  } else if (state.files.has(resolvedOldPath)) {
    const content = state.files.get(resolvedOldPath)!
    state.files.set(resolvedNewPath, content)
    state.addParentDirectories(resolvedNewPath)
  } else {
    throw new Error(`Path not found: ${oldPath}`)
  }
}

export async function rm(
  state: InMemoryFsState,
  path: string,
  options?: { recursive?: boolean; force?: boolean },
): Promise<void> {
  const resolvedPath = state.resolvePath(path)
  const prefix = resolvedPath.endsWith('/') ? resolvedPath : resolvedPath + '/'

  const deleteRecursive = () => {
    for (const key of Array.from(state.files.keys())) {
      if (key === resolvedPath || key.startsWith(prefix)) state.files.delete(key)
    }
    for (const d of Array.from(state.dirs)) {
      if (d === resolvedPath || d.startsWith(prefix)) state.dirs.delete(d)
    }
    state.dirs.delete(resolvedPath)
    state.files.delete(resolvedPath)
  }

  const deleteNonRecursive = () => {
    if (state.files.has(resolvedPath)) {
      state.files.delete(resolvedPath)
      return
    }
    if (state.dirs.has(resolvedPath)) {
      const hasChildren =
        Array.from(state.files.keys()).some(k => dirname(k) === resolvedPath) ||
        Array.from(state.dirs).some(d => dirname(d) === resolvedPath && d !== resolvedPath)
      if (hasChildren) {
        throw new Error(`Directory not empty: ${path}`)
      }
      state.dirs.delete(resolvedPath)
      return
    }
    if (!options?.force) throw new Error(`Path not found: ${path}`)
  }

  if (options?.recursive) {
    deleteRecursive()
    return
  }

  deleteNonRecursive()
}

export async function symlink(state: InMemoryFsState, target: string, path: string): Promise<void> {
  const resolvedPath = state.resolvePath(path)
  // Resolve relative targets from the symlink's parent directory (matching OS behavior)
  const resolvedTarget = isAbsolute(target)
    ? state.resolvePath(target)
    : resolve(dirname(resolvedPath), target)
  if (state.symlinks.has(resolvedPath) || state.files.has(resolvedPath)) {
    throw new Error(`Path already exists: ${path}`)
  }
  state.symlinks.set(resolvedPath, resolvedTarget)
  state.addParentDirectories(resolvedPath)
}

export function chdir(state: InMemoryFsState, path: string): void {
  state.workingDirectory = path
  // Ensure parent directories exist in the in-memory view
  state.addParentDirectories(path)
  state.dirs.add(path)
}

export async function createZip(
  state: InMemoryFsState,
  sourcePaths: string[],
  outputPath: string,
): Promise<void> {
  const resolvedOutputPath = state.resolvePath(outputPath)
  const zipContent: Record<string, string> = {}

  for (const sourcePath of sourcePaths) {
    const resolvedSourcePath = state.resolvePath(sourcePath)

    // Check if source is file or directory
    if (state.files.has(resolvedSourcePath)) {
      // Single file - add to zip root
      const fileName = resolvedSourcePath.split('/').pop() || 'file'
      zipContent[fileName] = state.files.get(resolvedSourcePath)!
    } else if (state.dirs.has(resolvedSourcePath)) {
      // Directory - add all files recursively
      for (const [filePath, content] of state.files.entries()) {
        if (filePath.startsWith(resolvedSourcePath + '/')) {
          // Relative path within zip
          const relativePath = filePath.substring(resolvedSourcePath.length + 1)
          zipContent[relativePath] = content
        }
      }
    }
  }

  // Serialize zip content as JSON (simple in-memory representation)
  const zipData = JSON.stringify(zipContent)
  state.files.set(resolvedOutputPath, zipData)
  state.addParentDirectories(resolvedOutputPath)
}

export async function extractZip(
  state: InMemoryFsState,
  zipPath: string,
  outputDir: string,
): Promise<void> {
  const resolvedZipPath = state.resolvePath(zipPath)
  const resolvedOutputDir = state.resolvePath(outputDir)

  const zipData = state.files.get(resolvedZipPath)
  if (!zipData) {
    throw new Error(`ZIP file not found: ${zipPath}`)
  }

  // Deserialize zip content
  const zipContent = JSON.parse(zipData) as Record<string, string>

  // Extract all files
  for (const [relativePath, content] of Object.entries(zipContent)) {
    const outputPath = resolve(resolvedOutputDir, relativePath)
    state.files.set(outputPath, content)
    state.addParentDirectories(outputPath)
  }

  // Ensure output directory exists
  state.dirs.add(resolvedOutputDir)
}
