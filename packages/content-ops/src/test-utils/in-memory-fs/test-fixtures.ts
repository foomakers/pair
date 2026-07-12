import { InMemoryFileSystemService } from './in-memory-fs'

/** Default module/working directory shared by the bulk of in-memory-fs unit tests. */
export const DEFAULT_DIR = '/app'

/**
 * Creates an InMemoryFileSystemService rooted at DEFAULT_DIR (or custom dirs) for tests
 * that don't care about a specific module/working-dir setup — avoids repeating the same
 * `new InMemoryFileSystemService({}, '/app', '/app')` boilerplate in every describe block.
 */
export function createFs(
  initial: Record<string, string> = {},
  moduleDir: string = DEFAULT_DIR,
  workingDir: string = DEFAULT_DIR,
): InMemoryFileSystemService {
  return new InMemoryFileSystemService(initial, moduleDir, workingDir)
}
