import { makeFsWithSeed } from './e2e-utils'
import type { FileSystemService } from '@pair/content-ops'

// Centralized factory helpers for E2E tests to reduce duplication.
// Keep these helpers free of test-runner imports so they're safe to compile.
export function makeCommonSeededFs(cwd: string): FileSystemService {
  return makeFsWithSeed(
    {
      '.github/workflows/ci.yml': 'workflow: ci',
      '.pair/intro.md': '# Intro',
      '.pair/knowledge/index.md': 'knowledge index',
      '.pair/product/adopted/onboarding.md': 'onboarding',
      '.pair/adoption/readme.md': 'adoption readme',
      '.pair/knowledge.md': 'knowledge',
      'config.json': JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['chatmodes', 'workflows'],
            target_path: '.github-copy',
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            target_path: '.pair-knowledge',
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            target_path: '.pair-adoption',
            description: 'Adoption guides and onboarding materials',
          },
        },
        default_target_folders: { pair: '.pair', github: '.github' },
      }),
    },
    cwd,
  ) as unknown as FileSystemService
}

export function makeMinimalSeededFs(cwd: string): FileSystemService {
  return makeFsWithSeed(
    {
      '.github/workflows/ci.yml': 'workflow: ci',
      'config.json': JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            target_path: '.github-copy',
            description: 'GitHub workflows',
          },
        },
      }),
    },
    cwd,
  ) as unknown as FileSystemService
}

export function remappedDefaultsConfig() {
  return {
    asset_registries: {
      github: { source: '.github', behavior: 'mirror', target_path: '.github-copy' },
      knowledge: { source: '.pair', behavior: 'mirror', target_path: '.pair-knowledge' },
      adoption: { source: '.pair/product/adopted', behavior: 'add', target_path: '.pair-adopted' },
    },
  }
}

export function nestedDefaultsConfig() {
  return {
    asset_registries: {
      github: { source: '.github', behavior: 'mirror', target_path: '.github-copy' },
      knowledge: { source: '.pair', behavior: 'mirror', target_path: '.pair' },
      adoption: {
        source: '.pair/product/adopted',
        behavior: 'add',
        target_path: '.pair/product/adopted',
      },
    },
  }
}

export function customSingleBaseConfig() {
  return {
    asset_registries: {
      github: { source: '.github', behavior: 'mirror', target_path: '.github-copy' },
      knowledge: { source: '.pair', behavior: 'mirror', target_path: '.pair' },
      adoption: { source: '.pair/product/adopted', behavior: 'add', target_path: '.pair-adopted' },
    },
  }
}

export function realisticConfig() {
  return {
    asset_registries: {
      github: { source: '.github', behavior: 'mirror', target_path: '.github-copy' },
      knowledge: { source: '.pair', behavior: 'add', target_path: '.pair/knowledge' },
      adoption: { source: '.pair/product/adopted', behavior: 'add', target_path: '.pair/adoption' },
    },
  }
}

export default {
  makeCommonSeededFs,
  makeMinimalSeededFs,
  remappedDefaultsConfig,
  nestedDefaultsConfig,
  customSingleBaseConfig,
  realisticConfig,
}
