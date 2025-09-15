import { join } from 'path'
import type { FileSystemService } from '@pair/content-ops/file-system'
import InMemoryFileSystemService from '@pair/content-ops/test-utils/in-memory-fs'

export const DEFAULT_CONFIG = {
  asset_registries: {
    github: {
      source: '.github',
      behavior: 'mirror' as const,
      include: ['/chatmodes', '/workflows'],
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

export const GITHUB_KNOWLEDGE_CONFIG = {
  asset_registries: {
    github: {
      source: '.github',
      behavior: 'mirror' as const,
      include: ['/chatmodes', '/workflows'],
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
      include: ['/chatmodes', '/workflows'],
      target_path: '.github',
      description: 'GitHub workflows and configuration files',
    },
  },
}

export function createTestFs(config: unknown, extraFiles: Record<string, string> = {}) {
  return new InMemoryFileSystemService({
    [join(__dirname, '..', '..', 'config.json')]: JSON.stringify(config),
    ...extraFiles,
  })
}

function writeTempConfig(fs: FileSystemService, config: unknown, fileName = 'pair.config.json') {
  const path = join(process.cwd(), fileName)
  fs.writeFile(path, JSON.stringify(config))
  return path
}

function removeTempConfig(fs: FileSystemService, fileName = 'pair.config.json') {
  try {
    fs.unlink(join(process.cwd(), fileName))
  } catch {
    /* ignore */
  }
}

// Execute a callback while a temp config is installed. This helper intentionally
// avoids importing any test runner APIs so it stays safe to compile.
export async function withTempConfig(
  fs: FileSystemService,
  config: unknown,
  cb: () => Promise<unknown> | unknown,
) {
  writeTempConfig(fs, config)
  try {
    return await cb()
  } finally {
    removeTempConfig(fs)
  }
}
