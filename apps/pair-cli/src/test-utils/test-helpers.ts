import { join, dirname } from 'path'
import type { FileSystemService } from '@pair/content-ops/file-system'
import InMemoryFileSystemService from '@pair/content-ops/test-utils/in-memory-fs'

export const DEFAULT_CONFIG = {
  asset_registries: {
    github: {
      source: '.github',
      behavior: 'mirror' as const,
      include: ['/agents', '/workflows'],
      target_path: '.github',
      description: 'GitHub workflows and configuration files',
    },
    knowledge: {
      source: '.pair/knowledge',
      behavior: 'add' as const,
      target_path: '.pair-knowledge',
      description: 'Knowledge base and documentation',
    },
    adoption: {
      source: '.pair/adoption',
      behavior: 'add' as const,
      target_path: '.pair-adoption',
      description: 'Adoption guides and onboarding materials',
    },
  },
}

export const GITHUB_KNOWLEDGE_CONFIG = {
  asset_registries: {
    github: {
      source: '.github',
      behavior: 'mirror' as const,
      include: ['/agents', '/workflows'],
      target_path: '.github',
      description: 'GitHub workflows and configuration files',
    },
    knowledge: {
      source: '.pair/knowledge',
      behavior: 'mirror' as const,
      target_path: '.pair-knowledge',
      description: 'Knowledge base and documentation',
    },
  },
}

export const OVERLAPPING_CONFIG = {
  asset_registries: {
    pairroot: {
      source: '.pair',
      behavior: 'mirror' as const,
      target_path: '.pair',
      description: '',
    },
    adoption: {
      source: '.pair/adoption',
      behavior: 'add' as const,
      target_path: '.pair/adoption',
      description: '',
    },
  },
}

export const CLEAN_CONFIG = {
  asset_registries: {
    github: {
      source: '.github',
      behavior: 'mirror' as const,
      include: [],
      target_path: '.github',
      description: 'GitHub workflows and configuration files',
    },
    knowledge: {
      source: '.pair/knowledge',
      behavior: 'mirror' as const,
      target_path: '.pair-knowledge',
      description: 'Knowledge base and documentation',
    },
    adoption: {
      source: '.pair/adoption',
      behavior: 'add' as const,
      target_path: '.pair-adoption',
      description: 'Adoption guides and onboarding materials',
    },
  },
}

export const GITHUB_ONLY_CONFIG = {
  asset_registries: {
    github: {
      source: '.github',
      behavior: 'mirror' as const,
      include: ['/agents', '/workflows'],
      target_path: '.github',
      description: 'GitHub workflows and configuration files',
    },
  },
}

export function createTestFs(
  config: unknown,
  extraFiles: Record<string, string> = {},
  cwd: string,
) {
  return new InMemoryFileSystemService(
    {
      [`${cwd}/config.json`]: JSON.stringify(config),
      ...extraFiles,
    },
    cwd,
    cwd,
  )
}

// Common targets that tests may create; remove them before running scenarios
export const DEFAULT_TEST_TARGETS = [
  '.github',
  '.github-copy',
  '.pair',
  '.pair-knowledge',
  '.pair-adoption',
  '.pair-knowledge',
  '.pair-adopted',
  '.e2e_base',
  '.existing_base',
  '.clean_test',
  '.smoke_test',
  '.single_github',
  '.mirror_target',
  '.add_target',
  '.skip_target',
]

function writeTempConfig(fs: FileSystemService, config: unknown, fileName = 'pair.config.json') {
  const cwd = fs.currentWorkingDirectory()
  const pairPath = join(cwd, fileName)
  const configPath = join(cwd, 'config.json')
  const serialized = JSON.stringify(config)

  fs.writeFile(pairPath, serialized)
  fs.writeFile(configPath, serialized)

  return pairPath
}

export async function cleanTestTargets(fs: FileSystemService) {
  const cwd = fs.currentWorkingDirectory()
  const monorepoRoot = dirname(dirname(cwd))

  // If the working directory has a .seed marker, this is a seeded test
  // environment and we should skip cleanup to preserve input fixtures.
  const cwdSeedMarker = join(cwd, '.seed')
  if (await fs.exists(cwdSeedMarker)) {
    return
  }

  for (const t of DEFAULT_TEST_TARGETS) {
    // If this path appears to also be part of the seeded dataset (either
    // under /dataset or the monorepo knowledge-hub dataset) then skip
    // deletion to avoid removing test input fixtures. This keeps
    // cleanTestTargets safe to run even when the seed places files under
    // the working directory for bundle-mode tests.
    const candidate = join(cwd, t)
    const datasetCandidate = join('/dataset', t)
    const monorepoCandidate = join(monorepoRoot, 'packages', 'knowledge-hub', 'dataset', t)

    // Only skip deletion when the candidate is exactly a seeded source folder.
    // It's possible for the seeded dataset to contain files under a path like
    // '/dataset/.github/workflows' which would make a simple exists() check
    // return true for '/dataset', but we still want to allow tests to create
    // and remove their own target folders under the working directory. Check
    // for exact folder presence by attempting to stat an index file or a
    // known marker inside the seeded path. We'll consider the path seeded
    // only when the dataset contains the same top-level folder name.
    // Only skip deletion when a .seed marker is present in either the
    // dataset or monorepo seeded locations. The e2e-utils helper writes
    // these markers when seeding fixtures.
    const datasetSeedMarker = join(datasetCandidate, '.seed')
    const monorepoSeedMarker = join(monorepoCandidate, '.seed')
    if ((await fs.exists(datasetSeedMarker)) || (await fs.exists(monorepoSeedMarker))) {
      continue
    }
    await fs.rm(candidate, { recursive: true, force: true })
  }
}

function removeTempConfig(fs: FileSystemService, fileName = 'pair.config.json') {
  const cwd = fs.currentWorkingDirectory()
  const pairPath = join(cwd, fileName)
  const configPath = join(cwd, 'config.json')
  fs.unlink(pairPath)
  fs.unlink(configPath)
}

export async function withTempConfig(
  fs: FileSystemService,
  config: unknown,
  cb: () => Promise<unknown> | unknown,
) {
  await cleanTestTargets(fs)
  writeTempConfig(fs, config)
  try {
    return await cb()
  } finally {
    removeTempConfig(fs)
  }
}
