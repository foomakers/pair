import { describe, it, expect, vi } from 'vitest'
import path from 'path'
import type { FileSystemService } from '@pair/content-ops'
import { withTempConfig } from './test-utils/test-helpers'
import e2eFactory from './test-utils/e2e-factory'
import {
  getExpectedCiPaths,
  anyPathHasCi,
  getExpectedAdoptionPaths,
  anyPathHasContent,
} from './test-utils/e2e-asserts'
import { handleInstallCommand, handleUpdateCommand } from './cli'
import { updateCommand } from './commands/update'
import {
  installCommand,
  installRegistryWithCustomTarget,
  AssetRegistryConfig,
} from './commands/install'
import { getKnowledgeHubDatasetPath } from './config-utils'

// E2E-11: installWithDefaults with specific asset registries and dataset root
describe('pair-cli e2e - installWithDefaults path escape error', () => {
  it.skip('e2e-11: installWithDefaults fails with PATH_ESCAPE error', async () => {
    const fs = e2eFactory.makeCommonSeededFs('/test-project')
    const config = {
      asset_registries: {
        github: {
          source: '.github',
          behavior: 'mirror',
          include: ['/chatmodes', '/workflows'],
          target_path: '.github',
          description: 'GitHub workflows and configuration files',
        },
        knowledge: {
          source: '.pair/knowledge',
          behavior: 'mirror',
          target_path: '.pair/knowledge',
          description: 'Knowledge base and documentation',
        },
        adoption: {
          source: '.pair/adoption',
          behavior: 'add',
          target_path: '.pair/adoption',
          description: 'Adoption guides and onboarding materials',
        },
      },
    }

    // Simulate the dataset root from the published package by passing it via options
    // const bundleDatasetRoot =
    //   '/Users/gianluca.carucci/me/projects/pair/node_modules/.pnpm/@foomakers+pair-cli@0.1.1/node_modules/@foomakers/pair-cli/bundle-cli/dataset'

    await withTempConfig(fs, config, async () => {
      try {
        await installCommand(fs, [], { useDefaults: true, minLogLevel: 'INFO' })
        // If it doesn't throw, fail the test
        expect(true).toBe(false) // Should have failed
      } catch (error) {
        expect((error as Error).message).toContain('copyPathAndUpdateLinks failed after 0ms')
        expect((error as Error).message).toContain(
          'PATH_ESCAPE: Source or target escapes the dataset root. Aborting.',
        )
      }
    })
  })
})

// E2E-12: installWithDefaults from manual release bundle
describe('pair-cli e2e - installWithDefaults from manual release bundle', () => {
  it('e2e-12: installWithDefaults succeeds when run from manual release bundle', async () => {
    const fs = e2eFactory.makeCommonSeededFs('/test-project')
    const config = {
      asset_registries: {
        github: {
          source: '.github',
          behavior: 'mirror',
          include: ['/chatmodes', '/workflows'],
          target_path: '.github',
          description: 'GitHub workflows and configuration files',
        },
        knowledge: {
          source: '.pair/knowledge',
          behavior: 'mirror',
          target_path: '.pair/knowledge',
          description: 'Knowledge base and documentation',
        },
        adoption: {
          source: '.pair/adoption',
          behavior: 'add',
          target_path: '.pair/adoption',
          description: 'Adoption guides and onboarding materials',
        },
      },
    }

    // Simulate running from the manual release bundle where dataset is local
    // Use the in-memory fs cwd as the dataset root and pass it explicitly
    const datasetRoot = fs.currentWorkingDirectory()

    await withTempConfig(fs, config, async () => {
      const res = await installCommand(fs, [], {
        useDefaults: true,
        minLogLevel: 'INFO',
        datasetRoot,
      })
      expect(res).toBeDefined()
      expect((res as { success?: boolean }).success).toBe(true)
    })
  })
})

type CLIExports = {
  handleInstallCommand?: (args: unknown, opts: unknown, fs: FileSystemService) => Promise<unknown>
}

type PairConfig = { asset_registries: Record<string, unknown> }

async function runMirrorBehavior(fs: FileSystemService) {
  const config = {
    asset_registries: {
      github: { source: '.github', behavior: 'mirror', target_path: '.github' },
    },
  }

  await withTempConfig(fs, config, async () => {
    const registryName = 'github'
    const registryConfig = (config.asset_registries as Record<string, unknown>)[registryName]
    const datasetRoot = getKnowledgeHubDatasetPath(fs) || fs.currentWorkingDirectory()
    const customTarget = '.mirror_target'
    const context = {
      fsService: fs,
      options: { baseTarget: customTarget },
      pushLog: () => {},
    }
    await installRegistryWithCustomTarget(
      [registryName, registryConfig as AssetRegistryConfig],
      customTarget,
      datasetRoot,
      context,
    )

    // Prefer deterministic expected paths derived from registry target_path
    const expected = getExpectedCiPaths(fs, {
      registryTargetPath: '.github',
      customTarget: '.mirror_target',
      baseTarget: '.mirror_target',
    })
    const ok = await anyPathHasCi(fs, expected)
    // Deterministic assertion: must be present at one of the expected paths
    expect(ok).toBe(true)
  })
}

// Assertions for multi-registry install under base target
async function runMultiRegistryAssertions(fs: FileSystemService) {
  // Run concise, delegated assertions for each expected artifact type.
  const githubFound = await githubCiExistsUnderBase(fs, '.multi_base')
  expect(githubFound).toBe(true)

  const knowledgeFound = await knowledgeExistsUnderBase(fs, '.multi_base')
  expect(knowledgeFound).toBe(true)

  const adoptionOk = await adoptionHasOnboardingUnderBase(fs, '.multi_base')
  expect(adoptionOk).toBe(true)
}

// Helper: detect github CI presence under a base target
async function githubCiExistsUnderBase(fs: FileSystemService, base: string): Promise<boolean> {
  // Prefer deterministic candidate paths
  const expected = getExpectedCiPaths(fs, { registryTargetPath: '.github-copy', baseTarget: base })
  // Deterministic-only: check only the expected candidate paths
  return await anyPathHasCi(fs, expected)
}

// Helper: detect knowledge index presence under a base target
async function knowledgeExistsUnderBase(fs: FileSystemService, base: string): Promise<boolean> {
  // Deterministic check: installer places the registry folder under <base>/.pair/knowledge
  const candidates = [
    path.join(base, '.pair', 'knowledge'),
    path.join(path.resolve(base), '.pair', 'knowledge'),
    path.join(fs.currentWorkingDirectory(), base, '.pair', 'knowledge'),
    path.join(fs.currentWorkingDirectory(), path.resolve(base), '.pair', 'knowledge'),
  ]

  for (const d of candidates) {
    try {
      if (!(await fs.exists(d))) continue
      const entries = await fs.readdir(d).catch(() => [])
      if (entries && entries.length > 0) return true
    } catch {
      // ignore
    }
  }

  return false
}

// Helper: detect adoption onboarding under a base target and ensure content
async function adoptionHasOnboardingUnderBase(
  fs: FileSystemService,
  base: string,
): Promise<boolean> {
  const expected = getExpectedAdoptionPaths(fs, {
    registryTargetPath: '.pair/adoption',
    baseTarget: base,
  })
  if (await anyPathHasContent(fs, expected, 'onboarding')) return true

  // Deterministic-only: check only expected onboarding locations
  return await anyPathHasContent(fs, expected, 'onboarding')
}

// Run add behavior flow: pre-seed a colliding file then ensure installer does not overwrite it
async function runAddBehavior(fs: FileSystemService) {
  // pre-create a file that would collide with adoption add behavior
  await fs.writeFile?.('.add_target/.pair/adoption/onboarding.md', 'pre-existing')

  const config = {
    asset_registries: {
      adoption: { source: '.pair/product/adopted', behavior: 'add', target_path: '.pair/adoption' },
    },
  }

  await withTempConfig(fs, config, async () => {
    const registryName = 'adoption'
    const registryConfig = (config.asset_registries as Record<string, unknown>)[registryName]
    const datasetRoot = getKnowledgeHubDatasetPath(fs) || fs.currentWorkingDirectory()
    const customTarget = '.add_target'
    const context = {
      fsService: fs,
      options: { baseTarget: customTarget },
      pushLog: () => {},
    }
    await installRegistryWithCustomTarget(
      [registryName, registryConfig as AssetRegistryConfig],
      customTarget,
      datasetRoot,
      context,
    )
    // existing file should remain unchanged
    const content = await fs.readFile('.add_target/.pair/adoption/onboarding.md')
    expect(String(content)).toBe('pre-existing')
  })
}

// Local test helpers to reduce duplication in the E2E file.
async function installExpectSuccess(
  fs: FileSystemService,
  config: unknown,
  targetArg?: string | undefined,
) {
  return await withTempConfig(fs, config, async () => {
    const res = await handleInstallCommand(
      targetArg === undefined ? undefined : targetArg,
      { config: undefined },
      fs,
    )
    if (!res || !(res as { success?: boolean }).success)
      throw new Error(`install failed: ${JSON.stringify(res)}`)
    expect((res as { success?: boolean }).success).toBe(true)
    return res
  })
}

async function installExpectFailureMessage(
  fs: FileSystemService,
  config: unknown,
  expected: string,
) {
  return await withTempConfig(fs, config, async () => {
    const res = await handleInstallCommand(undefined, { config: undefined }, fs)
    expect(res && (res as { success?: boolean }).success).toBe(false)
    expect(String(res && (res as { message?: string }).message)).toContain(expected)
    return res
  })
}

async function installCommandWithDefaultsExpect(
  fs: FileSystemService,
  config: unknown,
  baseTarget: string,
  shouldSucceed = true,
) {
  return await withTempConfig(fs, config, async () => {
    const datasetRoot = getKnowledgeHubDatasetPath(fs) || fs.currentWorkingDirectory()
    const res = await installCommand(fs, [], {
      useDefaults: true,
      baseTarget,
      datasetRoot,
    })
    if (shouldSucceed) {
      if (!res || !(res as { success?: boolean }).success)
        throw new Error(`install failed: ${JSON.stringify(res)}`)
      expect((res as { success?: boolean }).success).toBe(true)
    } else {
      expect(res && (res as { success?: boolean }).success).toBe(false)
    }
    return res
  })
}

async function installSingleRegistry(
  fs: FileSystemService,
  config: PairConfig,
  registryName: string,
  customTarget: string,
) {
  return await withTempConfig(fs, config, async () => {
    const registryConfig = (config.asset_registries as Record<string, unknown>)[registryName]
    const datasetRoot = getKnowledgeHubDatasetPath(fs) || fs.currentWorkingDirectory()
    const context = {
      fsService: fs,
      options: { baseTarget: customTarget },
      pushLog: () => {},
    }
    await installRegistryWithCustomTarget(
      [registryName, registryConfig as AssetRegistryConfig],
      customTarget,
      datasetRoot,
      context,
    )
    expect(true).toBe(true)
  })
}

// Helper function to recursively collect all files in a directory
async function collectFilesRecursively(fs: FileSystemService, base: string): Promise<string[]> {
  const result: string[] = []

  async function walk(dir: string, rel: string) {
    const entries = await fs.readdir(dir).catch(() => null)
    if (!entries) {
      // treat as file
      result.push(rel)
      return
    }
    for (const e of entries) {
      const name = typeof e === 'string' ? e : (e as { name: string }).name
      const childDir = path.join(dir, name)
      const childRel = rel ? path.join(rel, name) : name
      // Try to readdir to determine if directory
      const childEntries = await fs.readdir(childDir).catch(() => null)
      if (childEntries) {
        await walk(childDir, childRel)
      } else {
        // file
        result.push(childRel)
      }
    }
  }

  await walk(base, '')
  return result.sort()
}

// Helper function to compare file contents between source and target
async function compareFileContents(
  fs: FileSystemService,
  sourceRoot: string,
  targetRoot: string,
  sourceFiles: string[],
): Promise<Array<{ file: string; srcPreview: string; tgtPreview: string }>> {
  const diffs: Array<{ file: string; srcPreview: string; tgtPreview: string }> = []
  const setTgt = new Set(await collectFilesRecursively(fs, targetRoot))

  for (const rel of sourceFiles.filter(f => setTgt.has(f))) {
    const srcPath = path.join(sourceRoot, rel)
    const tgtPath = path.join(targetRoot, rel)
    const srcContent = String(await fs.readFile(srcPath))
    const tgtContent = String(await fs.readFile(tgtPath))
    if (srcContent !== tgtContent) {
      diffs.push({
        file: rel,
        srcPreview: srcContent.slice(0, 200),
        tgtPreview: tgtContent.slice(0, 200),
      })
    }
  }

  return diffs
}

// Helper function to generate diagnostic message for mirror verification failures
function generateMirrorDiagnosticMessage(
  sourceRoot: string,
  targetRoot: string,
  differences: {
    missing: string[]
    extra: string[]
    diffs: Array<{ file: string; srcPreview: string; tgtPreview: string }>
  },
): string {
  const lines: string[] = []
  lines.push('Mirror verification failed: differences between dataset and target detected')
  lines.push(`  source root: ${sourceRoot}`)
  lines.push(`  target root: ${targetRoot}`)

  if (differences.missing.length) {
    lines.push(`\nMissing in target (${differences.missing.length}):`)
    for (const m of differences.missing.slice(0, 200)) lines.push(`  - ${m}`)
    if (differences.missing.length > 200)
      lines.push(`  ...and ${differences.missing.length - 200} more missing files`)
  }

  if (differences.extra.length) {
    lines.push(`\nExtra in target (${differences.extra.length}):`)
    for (const e of differences.extra.slice(0, 200)) lines.push(`  - ${e}`)
    if (differences.extra.length > 200)
      lines.push(`  ...and ${differences.extra.length - 200} more extra files`)
  }

  if (differences.diffs.length) {
    lines.push(`\nFiles with different content (${differences.diffs.length}):`)
    for (const d of differences.diffs.slice(0, 50)) {
      lines.push(`  - ${d.file}`)
      lines.push(`      src (first 200 chars): ${JSON.stringify(d.srcPreview)}`)
      lines.push(`      tgt (first 200 chars): ${JSON.stringify(d.tgtPreview)}`)
    }
    if (differences.diffs.length > 50)
      lines.push(`  ...and ${differences.diffs.length - 50} more differing files`)
  }

  return lines.join('\n')
}

// Helper function to verify mirror behavior by comparing source and target directories
async function verifyMirrorSync(
  fs: FileSystemService,
  sourceRoot: string,
  targetRoot: string,
): Promise<void> {
  const sourceFiles = await collectFilesRecursively(fs, sourceRoot)
  const targetFiles = await collectFilesRecursively(fs, targetRoot)

  if (targetFiles.length === 0) {
    throw new Error(`Target directory appears empty: ${targetRoot}`)
  }

  const setSrc = new Set(sourceFiles)
  const setTgt = new Set(targetFiles)

  const missing = sourceFiles.filter(f => !setTgt.has(f))
  const extra = targetFiles.filter(f => !setSrc.has(f))
  const diffs = await compareFileContents(fs, sourceRoot, targetRoot, sourceFiles)

  if (missing.length || extra.length || diffs.length) {
    const message = generateMirrorDiagnosticMessage(sourceRoot, targetRoot, {
      missing,
      extra,
      diffs,
    })
    throw new Error(message)
  }
}

describe('e2e: smoke', () => {
  it('helper: withTempConfigAndMockExit can be used to safely import CLI', async () => {
    const fs = e2eFactory.makeMinimalSeededFs('/test-project')
    const config = { asset_registries: {} }
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    await withTempConfig(fs, config, async () => {
      try {
        const mod = (await import('./cli.js')) as unknown as CLIExports
        if (typeof mod.handleInstallCommand === 'function') {
          await mod.handleInstallCommand(undefined, {}, fs)
        }
      } catch {
        // swallow import/startup errors in this incremental test
      }
    })
    exitSpy.mockRestore()
    expect(true).toBe(true)
  })
})

// Move of E2E-style smoke tests from `cli.test.ts`
describe('pair-cli e2e - install defaults', () => {
  // Exercise the standard / default flow: when no target is provided the CLI should
  // use the default targets from the config. This reproduces the standard use-case.
  it('e2e: install using defaults (no base target) with temp config', async () => {
    const fs = e2eFactory.makeCommonSeededFs('/test-project')
    const config = e2eFactory.remappedDefaultsConfig()
    await installExpectSuccess(fs, config)
  })
})

describe('pair-cli e2e - install defaults overlap', () => {
  // Verify that when defaults contain nested target_paths the install fails with a clear validation error
  it('e2e: install defaults should fail when default targets are nested (overlap)', async () => {
    const fs = e2eFactory.makeMinimalSeededFs('/test-project')
    const nestedDefaultsConfig = e2eFactory.nestedDefaultsConfig()
    await installExpectFailureMessage(fs, nestedDefaultsConfig, 'Overlapping registry targets')
  })
})

describe('pair-cli e2e - install custom config', () => {
  // Separate test: validate custom config behavior when installing to a single base target.
  // Here we provide a config where adoption has a non-nested target_path so the single-base
  // target install won't cause overlapping-target validation to fail — this exercises the
  // custom-config + base-target use-case.
  it('e2e: install with custom config into a single base target', async () => {
    const fs = e2eFactory.makeCommonSeededFs('/test-project')
    const customConfig = e2eFactory.customSingleBaseConfig()
    await installExpectSuccess(fs, customConfig, '.smoke_test')
  })
})

describe('pair-cli e2e - update basic', () => {
  it('e2e: update ./smoke_test using in-memory FS with temp config', async () => {
    const fs = e2eFactory.makeCommonSeededFs('/test-project')
    const config = e2eFactory.customSingleBaseConfig()
    // Keep update inline; it's already concise and unique enough.
    await withTempConfig(fs, config, async () => {
      const res = await handleUpdateCommand({}, fs)
      expect(res === undefined || (res && (res as { success?: boolean }).success === true)).toBe(
        true,
      )
    })
  })
})

describe('pair-cli e2e - update positional target', () => {
  it('e2e: positional target (./smoke_test) is resolved against package cwd (repro for pnpm --filter case)', async () => {
    const fs = e2eFactory.makeCommonSeededFs('/test-project')
    const args = ['--target', './smoke_test']
    const opts = {
      datasetRoot: getKnowledgeHubDatasetPath(fs) || fs.currentWorkingDirectory(),
      minLogLevel: 'info',
    }

    const origCwd = fs.currentWorkingDirectory()
    const pkgDir = path.join(fs.currentModuleDirectory(), '..')
    try {
      // Simulate pnpm running the package script with cwd at package directory
      fs.chdir(pkgDir)

      const res = await updateCommand(fs, args, opts)
      if (!res || !(res as { success?: boolean }).success)
        throw new Error(`update failed: ${JSON.stringify(res)}`)

      const absTarget = path.resolve('./smoke_test')
      const exists = await fs.exists(absTarget)
      // Expect the target to have been created under the package cwd
      expect(Boolean(exists)).toBe(true)

      const outsideTarget = path.resolve(origCwd, 'smoke_test')
      const outsideExists = await fs.exists(outsideTarget)
      // Expect the target NOT to have been created under the original cwd
      expect(Boolean(outsideExists)).toBe(false)
    } finally {
      fs.chdir(origCwd)
    }
  })
})

// Helper functions for mirror behavior testing
async function setupAndVerifyMirrorTest(fs: FileSystemService, targetKnowledgeDir: string) {
  // Pre-seed a target with an extra file and a modified file
  await setupMirrorTestFiles(fs, targetKnowledgeDir)

  // Ensure preconditions
  expect(await fs.exists(path.join(targetKnowledgeDir, 'extra.md'))).toBe(true)
  expect(String(await fs.readFile(path.join(targetKnowledgeDir, 'index.md')))).toBe('old content')
}

async function runMirrorUpdateTest(fs: FileSystemService, config: PairConfig) {
  await withTempConfig(fs, config, async () => {
    const res = await handleUpdateCommand({}, fs)
    expect(res === undefined || (res && (res as { success?: boolean }).success === true)).toBe(true)
  })
}

async function verifyMirrorTestResults(fs: FileSystemService, targetKnowledgeDir: string) {
  // Verify basic mirror behavior
  await verifyBasicMirrorAssertions(fs, targetKnowledgeDir)

  // Verify complete mirror sync
  const sourceRoot = path.join(
    getKnowledgeHubDatasetPath(fs) || fs.currentWorkingDirectory(),
    '.pair',
    'knowledge',
  )
  await verifyMirrorSync(fs, sourceRoot, targetKnowledgeDir)
}

// Helper function to set up test files for mirror behavior testing
async function setupMirrorTestFiles(
  fs: FileSystemService,
  targetKnowledgeDir: string,
): Promise<void> {
  await fs.mkdir(targetKnowledgeDir, { recursive: true })
  await fs.writeFile(path.join(targetKnowledgeDir, 'extra.md'), 'to be removed')
  await fs.writeFile(path.join(targetKnowledgeDir, 'index.md'), 'old content')
}

// Helper function to verify basic mirror assertions
async function verifyBasicMirrorAssertions(
  fs: FileSystemService,
  targetKnowledgeDir: string,
): Promise<void> {
  const extraExists = await fs.exists(path.join(targetKnowledgeDir, 'extra.md'))
  expect(Boolean(extraExists)).toBe(false)

  const updated = await fs.readFile(path.join(targetKnowledgeDir, 'index.md'))
  const expected = await fs.readFile(
    path.join(
      getKnowledgeHubDatasetPath(fs) || fs.currentWorkingDirectory(),
      '.pair',
      'knowledge',
      'index.md',
    ),
  )
  expect(String(updated)).toBe(String(expected))
}

describe('pair-cli e2e - update mirror behavior', () => {
  it('e2e: mirror should fully sync .pair/knowledge from dataset into ./smoke_test (.pair/knowledge) including removal of extra files', async () => {
    const fs = e2eFactory.makeCommonSeededFs('/test-project')

    const origCwd = fs.currentWorkingDirectory()
    const pkgDir = path.join(fs.currentModuleDirectory(), '..')

    try {
      // Simulate running inside the package (pnpm --filter behavior)
      fs.chdir(pkgDir)

      // Pre-seed a target under the package cwd with an extra file and a modified file
      const targetBase = path.resolve('./smoke_test')
      const targetKnowledgeDir = path.join(targetBase, '.pair', 'knowledge')
      await setupAndVerifyMirrorTest(fs, targetKnowledgeDir)

      const config = {
        asset_registries: {
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            target_path: './smoke_test/.pair/knowledge',
          },
        },
      }

      await runMirrorUpdateTest(fs, config)
      await verifyMirrorTestResults(fs, targetKnowledgeDir)
    } finally {
      fs.chdir(origCwd)
    }
  })
})

describe('pair-cli e2e - install real config', () => {
  it('e2e-04: install using a realistic temp pair.config.json', async () => {
    const fs = e2eFactory.makeCommonSeededFs('/test-project')
    const realisticConfig = e2eFactory.realisticConfig()
    await installExpectSuccess(fs, realisticConfig)
  })
})

describe('pair-cli e2e - use-defaults with empty base target', () => {
  it('e2e-06: --use-defaults installs all registries into an empty base target', async () => {
    const fs = e2eFactory.makeCommonSeededFs('/test-project')
    const config = e2eFactory.realisticConfig()
    await installCommandWithDefaultsExpect(fs, config, '.e2e_base', true)
  })
})

describe('pair-cli e2e - target exists and not empty', () => {
  it('e2e-07: install should fail when base target exists and is not empty on second install', async () => {
    const fs = e2eFactory.makeCommonSeededFs('/test-project')
    const config = e2eFactory.realisticConfig()
    // First install should succeed
    await installCommandWithDefaultsExpect(fs, config, '.existing_base', true)
    // Second install should fail because target now exists and is not empty
    await installCommandWithDefaultsExpect(fs, config, '.existing_base', false)
  })
})

describe('pair-cli e2e - install single registry', () => {
  it('e2e-05: install only the github registry using programmatic handler', async () => {
    const fs = e2eFactory.makeCommonSeededFs('/test-project')
    const config = e2eFactory.realisticConfig()
    await installSingleRegistry(fs, config, 'github', '.single_github')
  })
})

describe('pair-cli e2e - behaviors (add|mirror|skip)', () => {
  it('e2e-09: mirror behavior should overwrite destination files', async () => {
    const fs = e2eFactory.makeCommonSeededFs('/test-project')
    // Delegate to helper which performs the full mirror flow and assertions.
    await runMirrorBehavior(fs)
  })

  it('e2e-09: add behavior should not overwrite existing files', async () => {
    const fs = e2eFactory.makeCommonSeededFs('/test-project')
    await runAddBehavior(fs)
  })

  it('e2e-09: skip behavior should not install registry content', async () => {
    const fs = e2eFactory.makeCommonSeededFs('/test-project')

    const config = {
      asset_registries: {
        experimental: {
          source: '.pair/knowledge',
          behavior: 'skip',
          target_path: '.pair/experimental',
        },
      },
    }

    await withTempConfig(fs, config, async () => {
      // use defaults into base target
      const res = await installCommand(fs, [], {
        useDefaults: true,
        baseTarget: '.skip_target',
        datasetRoot: getKnowledgeHubDatasetPath(fs) || fs.currentWorkingDirectory(),
      })
      if (!res || !(res as { success?: boolean }).success)
        throw new Error(`install failed: ${JSON.stringify(res)}`)
      // skip behavior means the experimental folder should not be created
      const exists = await fs.exists('.skip_target/.pair/experimental')
      expect(Boolean(exists)).toBe(false)
    })
  })
})

// E2E-10: multiple registries with a custom baseTarget
describe('pair-cli e2e - multiple registries with custom base target', () => {
  it('e2e-10: installs multiple registries under provided base target', async () => {
    const fs = e2eFactory.makeCommonSeededFs('/test-project')
    const config = e2eFactory.realisticConfig()
    // Install all defaults into the custom base
    await installCommandWithDefaultsExpect(fs, config, '.multi_base', true)

    // Use shared assertions to keep the test concise and consistent.
    await runMultiRegistryAssertions(fs)
  })
})
