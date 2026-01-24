import { join, dirname } from 'path'
import { FileSystemService } from '@pair/content-ops'

const knowledgePkgJson = 'packages/knowledge-hub/package.json'
const knowledgeNodeModulesPkgJson = 'node_modules/@pair/knowledge-hub/package.json'

/**
 * Check if current execution is within the pair monorepo
 */
export function isInPairMonorepo(fsService: FileSystemService): boolean {
  const cwd = fsService.currentWorkingDirectory()
  const knowledgeHubPackageJson = fsService.resolve(cwd, knowledgePkgJson)
  return fsService.existsSync(knowledgeHubPackageJson)
}

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

export function findPackageJsonPath(fsService: FileSystemService, currentDir: string): string {
  const result = getPackageJsonPath(fsService, currentDir)
  if (result) {
    return result
  }
  throw new Error(
    `Unable to find @pair/knowledge-hub package. Ensure the package is available in the workspace and installed.`,
  )
}

/**
 * Check if a directory contains a valid @pair/pair-cli package with bundle-cli
 */
function isValidManualPairCliPackage(
  fsService: FileSystemService,
  dirPath: string,
  diag: boolean,
): boolean {
  const candidatePath = join(dirPath, 'package.json')
  if (!fsService.existsSync(candidatePath)) return false

  try {
    const pkg = JSON.parse(fsService.readFileSync(candidatePath))
    if (pkg.name === '@pair/pair-cli' && fsService.existsSync(join(dirPath, 'bundle-cli'))) {
      if (diag) console.error(`[diag] Found @pair/pair-cli package with bundle-cli at: ${dirPath}`)
      return true
    }
  } catch {
    // Ignore parse errors
  }
  return false
}

function addNeighborsToQueue(
  fsService: FileSystemService,
  currentDir: string,
  queue: string[],
  visited: Set<string>,
): void {
  const parentDir = dirname(currentDir)
  if (parentDir !== currentDir && !visited.has(parentDir)) {
    queue.push(parentDir)
  }

  const commonSubDirs = ['libs', 'tools', 'bin', 'cli', 'pair-cli']
  for (const subDir of commonSubDirs) {
    const subDirPath = join(currentDir, subDir)
    if (fsService.existsSync(subDirPath) && !visited.has(subDirPath)) {
      queue.push(subDirPath)
    }
  }
}

/**
 * Perform breadth-first search to find a directory containing a valid manual pair-cli package
 */
function breadthFirstSearchManualPackage(
  fsService: FileSystemService,
  startDir: string,
  diag: boolean,
): string | null {
  const queue: string[] = [startDir]
  const visited = new Set<string>()
  let depth = 0

  while (queue.length > 0 && depth < 10) {
    const levelSize = queue.length
    if (diag) console.error(`[diag] BFS level ${depth}, checking ${levelSize} directories`)

    for (let i = 0; i < levelSize; i++) {
      const currentDir = queue.shift()!
      if (visited.has(currentDir)) continue
      visited.add(currentDir)

      if (diag) console.error(`[diag] Checking directory: ${currentDir}`)
      if (isValidManualPairCliPackage(fsService, currentDir, diag)) return currentDir

      addNeighborsToQueue(fsService, currentDir, queue, visited)
    }
    depth++
  }
  return null
}

export function findManualPairCliPackage(
  fsService: FileSystemService,
  startDir: string,
): string | null {
  const DIAG = process.env['PAIR_DIAG'] === '1' || process.env['PAIR_DIAG'] === 'true'
  const foundDir = breadthFirstSearchManualPackage(fsService, startDir, DIAG)
  if (!foundDir && DIAG)
    console.error(`[diag] No @pair/pair-cli package found with bundle-cli directory`)
  return foundDir
}

export function findNpmReleasePackage(
  fsService: FileSystemService,
  repoRoot: string,
): string | null {
  const DIAG = process.env['PAIR_DIAG'] === '1' || process.env['PAIR_DIAG'] === 'true'
  const packageJsonPath = join(repoRoot, 'package.json')
  const bundleCliPath = join(repoRoot, 'bundle-cli')

  if (DIAG) {
    console.error(
      `[diag] Checking NPM package at: ${packageJsonPath} exists=${fsService.existsSync(packageJsonPath)}`,
    )
    console.error(
      `[diag] Checking bundle-cli at: ${bundleCliPath} exists=${fsService.existsSync(bundleCliPath)}`,
    )
  }

  if (!fsService.existsSync(packageJsonPath) || !fsService.existsSync(bundleCliPath)) {
    if (DIAG)
      console.error(`[diag] NPM @foomakers/pair-cli package or bundle-cli directory not found`)
    return null
  }

  return validatePackageName(fsService, packageJsonPath, repoRoot, DIAG)
}

function validatePackageName(
  fsService: FileSystemService,
  pkgPath: string,
  rootDir: string,
  diag: boolean,
): string | null {
  try {
    const pkg = JSON.parse(fsService.readFileSync(pkgPath))
    if (pkg.name === '@foomakers/pair-cli') {
      if (diag) console.error(`[diag] Found valid NPM @foomakers/pair-cli package at: ${rootDir}`)
      return rootDir
    }
    if (diag)
      console.error(
        `[diag] Package at ${pkgPath} has name '${pkg.name}', expected '@foomakers/pair-cli'`,
      )
  } catch (error) {
    if (diag) console.error(`[diag] Error reading/parsing package.json at ${pkgPath}: ${error}`)
  }
  return null
}

export function isInRelease(fsService: FileSystemService, currentDir: string): boolean {
  return getPackageJsonPath(fsService, currentDir) === null
}
