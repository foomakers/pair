import { join, dirname } from 'path'
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

/**
 * Detect if we are running from an installed npm release.
 */
export function isInRelease(fsService: FileSystemService, currentDir: string): boolean {
  return getPackageJsonPath(fsService, currentDir) === null
}

/**
 * BFS to find local dev/manual build of pair-cli.
 */
export function findManualPairCliPackage(
  fsService: FileSystemService,
  startDir: string,
): string | null {
  const diagEnv = process.env['PAIR_DIAG']
  const diag = diagEnv === '1' || diagEnv === 'true'

  const queue: string[] = [startDir]
  const visited = new Set<string>()
  let depth = 0

  while (queue.length > 0 && depth < 10) {
    const levelSize = queue.length
    for (let i = 0; i < levelSize; i++) {
      const currentDir = queue.shift()!
      if (visited.has(currentDir)) continue
      visited.add(currentDir)

      if (isValidManualPairCliPackage(fsService, currentDir, diag)) return currentDir
      addNeighborsToQueue(fsService, currentDir, queue, visited)
    }
    depth++
  }
  return null
}

function isValidManualPairCliPackage(fs: FileSystemService, dir: string, diag: boolean): boolean {
  const pkgPath = join(dir, 'package.json')
  if (!fs.existsSync(pkgPath)) return false
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath))
    if (pkg.name === '@pair/pair-cli' && fs.existsSync(join(dir, 'bundle-cli'))) {
      if (diag) console.error(`[diag] Found manual bundle at: ${dir}`)
      return true
    }
  } catch {
    return false
  }
  return false
}

function addNeighborsToQueue(
  fs: FileSystemService,
  dir: string,
  q: string[],
  v: Set<string>,
): void {
  const parent = dirname(dir)
  if (parent !== dir && !v.has(parent)) q.push(parent)
  const subs = ['libs', 'tools', 'bin', 'cli', 'pair-cli']
  for (const s of subs) {
    const p = join(dir, s)
    if (fs.existsSync(p) && !v.has(p)) q.push(p)
  }
}

/**
 * Find npm release package root by looking for bundle-cli.
 */
export function findNpmReleasePackage(fs: FileSystemService, repoRoot: string): string | null {
  const pkgPath = join(repoRoot, 'package.json')
  const bundlePath = join(repoRoot, 'bundle-cli')

  if (!fs.existsSync(pkgPath) || !fs.existsSync(bundlePath)) return null

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath))
    if (pkg.name === '@foomakers/pair-cli') return repoRoot
  } catch {
    return null
  }
  return null
}
