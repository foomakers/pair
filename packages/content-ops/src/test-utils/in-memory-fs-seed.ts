import { InMemoryFsState } from './in-memory-fs-state'

/**
 * Seeds a fresh state from the constructor arguments: registers the root and
 * ancestor directories of the module/working dirs, loads the initial files,
 * and guarantees the module/working dirs themselves exist.
 */
export function seedState(
  state: InMemoryFsState,
  initial: Record<string, string>,
  moduleDirectory: string,
  workingDirectory: string,
): void {
  // Set directories first so resolvePath works
  state.dirs.add('/')
  state.addParentDirectories(moduleDirectory)
  state.addParentDirectories(workingDirectory)
  addInitialFiles(state, initial)

  // Ensure moduleDirectory and workingDirectory exist
  state.dirs.add(moduleDirectory)
  state.dirs.add(workingDirectory)
}

function addInitialFiles(state: InMemoryFsState, initial: Record<string, string>): void {
  for (const [path, content] of Object.entries(initial)) {
    const resolvedPath = state.resolvePath(path)
    state.files.set(resolvedPath, content)
    state.addParentDirectories(resolvedPath)
  }
}
