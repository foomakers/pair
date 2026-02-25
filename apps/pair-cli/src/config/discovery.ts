import { join } from 'path'
import { FileSystemService } from '@pair/content-ops'

const knowledgePkgJson = 'packages/knowledge-hub/package.json'
const knowledgeNodeModulesPkgJson = 'node_modules/@pair/knowledge-hub/package.json'

/**
 * Common search for package.json path in monorepo or node_modules.
 */
export function getPackageJsonPath(
  fsService: FileSystemService,
  currentDir: string,
): string | null {
  const checkExists = (path: string) => fsService.existsSync(path)
  const findCandidate = (path: string) =>
    checkExists(join(currentDir, path)) ? join(currentDir, path) : null

  const monorepoResult = findCandidate(knowledgePkgJson)
  if (monorepoResult) return monorepoResult

  return findCandidate(knowledgeNodeModulesPkgJson)
}

/**
 * Finds the knowledge-hub package.json or throws.
 */
export function findPackageJsonPath(fsService: FileSystemService, currentDir: string): string {
  const result = getPackageJsonPath(fsService, currentDir)
  if (result) return result
  throw new Error(
    `Unable to find @pair/knowledge-hub package. Ensure the package is available in the workspace and installed.`,
  )
}
