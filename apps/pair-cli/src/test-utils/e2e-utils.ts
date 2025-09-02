import { join, dirname } from 'path'
import InMemoryFileSystemService from '@pair/content-ops/test-utils/in-memory-fs'

export function seedDatasetForMonorepo(initial: Record<string, string>) {
  // Build seed that contains both /dataset and monorepo packages/knowledge-hub/dataset
  const monorepoRoot = dirname(dirname(process.cwd()))
  const realDatasetPath = join(monorepoRoot, 'packages', 'knowledge-hub', 'dataset')

  const seed: Record<string, string> = {}
  for (const [p, content] of Object.entries(initial)) {
    // p is a path under dataset, e.g. '.github/workflows/ci.yml'
    seed[join('/dataset', p)] = content
    seed[join(realDatasetPath, p)] = content
  }

  return seed
}

export function makeFsWithSeed(initial: Record<string, string>) {
  const seed = seedDatasetForMonorepo(initial)
  return new InMemoryFileSystemService(seed)
}

export default { seedDatasetForMonorepo, makeFsWithSeed }
