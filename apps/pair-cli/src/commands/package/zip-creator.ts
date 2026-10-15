import type { FileSystemService } from '@pair/content-ops'
import { rewriteLinksInFile } from '@pair/content-ops'
import type { ManifestMetadata } from './metadata'
import type { RegistryConfig } from '#registry'
import { rewriteFileLinks } from './link-rewriter'
import {
  collectLayoutFiles,
  getCanonicalTarget,
  resolveLayoutPaths,
  type LayoutMode,
} from '../../registry/layout'
import { createHash } from 'crypto'
import path from 'path'
import { comparePathsDeterministic } from '../kb-verify/sort-paths'

interface ZipOptions {
  projectRoot: string
  registries: RegistryConfig[]
  manifest: ManifestMetadata
  outputPath: string
  root?: string
  layout?: LayoutMode
}

/**
 * Creates a ZIP package containing KB content from configured registries.
 */
export async function createPackageZip(
  options: ZipOptions,
  fsService: FileSystemService,
): Promise<void> {
  validateOutputDirectory(options.outputPath, fsService)

  const tempDir = path.join(path.dirname(options.outputPath), '.zip-temp')

  try {
    await fsService.mkdir(tempDir, { recursive: true })
    // Copy content first
    await copyRegistrySources(tempDir, options, fsService)
    await copySourceDeclaration(tempDir, options.projectRoot, fsService)
    // Compute checksum over content files
    const contentChecksum = await computeContentChecksum(tempDir, fsService)
    // Write manifest with checksum
    const manifestWithChecksum = { ...options.manifest, contentChecksum }
    await writeManifest(tempDir, manifestWithChecksum, fsService)
    // Create ZIP
    await fsService.createZip([tempDir], options.outputPath)
  } catch (error) {
    await cleanupOnError(options.outputPath, fsService)
    throw error
  } finally {
    await cleanupTempDirectory(tempDir, fsService)
  }
}

/**
 * Compute SHA-256 checksum over all content files in temp directory
 * Files are processed in sorted order for deterministic results
 * Excludes manifest.json which will be added after checksum computation
 */
async function computeContentChecksum(
  tempDir: string,
  fsService: FileSystemService,
): Promise<string> {
  const hash = createHash('sha256')
  const files = await collectAllFiles(tempDir, fsService)

  // Convert to relative paths and sort for deterministic order
  const relativePaths = files.map(f => path.relative(tempDir, f)).sort(comparePathsDeterministic)

  for (const relativePath of relativePaths) {
    const absolutePath = path.join(tempDir, relativePath)
    const content = fsService.readFileSync(absolutePath)
    hash.update(content)
  }

  return hash.digest('hex')
}

/**
 * Recursively collect all files in directory
 */
async function collectAllFiles(dir: string, fsService: FileSystemService): Promise<string[]> {
  const files: string[] = []
  const entries = await fsService.readdir(dir)

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      const subFiles = await collectAllFiles(fullPath, fsService)
      files.push(...subFiles)
    } else if (entry.isFile()) {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * A KB's own `pair.config.json` travels WITH the package: `install --source` honours the
 * source's declaration (US-396), and a release ZIP that dropped it would apply the
 * declared prefix from a directory or git source but not from the released artifact.
 */
async function copySourceDeclaration(
  tempDir: string,
  projectRoot: string,
  fsService: FileSystemService,
): Promise<void> {
  const declarationPath = path.join(projectRoot, 'pair.config.json')
  if (!fsService.existsSync(declarationPath)) return
  await fsService.writeFile(
    path.join(tempDir, 'pair.config.json'),
    await fsService.readFile(declarationPath),
  )
}

async function writeManifest(
  tempDir: string,
  manifest: ManifestMetadata,
  fsService: FileSystemService,
): Promise<void> {
  const manifestJson = JSON.stringify(manifest, null, 2)
  await fsService.writeFile(path.join(tempDir, 'manifest.json'), manifestJson)
}

async function copyRegistrySources(
  tempDir: string,
  options: ZipOptions,
  fsService: FileSystemService,
): Promise<void> {
  const layout: LayoutMode = options.layout || 'source'

  const plans: Array<{ registry: RegistryConfig; files: string[]; layoutPaths: string[] }> = []
  for (const declared of options.registries) {
    if (!declared.source) {
      throw new Error(`Registry missing source field`)
    }
    // Target layout packages the canonical copy only: `copy`-mode targets (CLAUDE.md) are derived
    const canonical = layout === 'target' ? getCanonicalTarget(declared.targets) : undefined
    const registry = canonical ? { ...declared, targets: [canonical] } : declared

    const files = await collectLayoutFiles({
      registry,
      layout,
      baseDir: options.projectRoot,
      fs: fsService,
    })

    if (files.length === 0) {
      throw new Error(`Registry source contains no files: ${registry.source}`)
    }

    const layoutPaths = resolveLayoutPaths({
      name: '',
      registry,
      layout,
      baseDir: options.projectRoot,
      fs: fsService,
    })
    plans.push({ registry, files, layoutPaths })
  }

  // Global: a link in ANY registry may point into a directory another registry moved
  const movedDirs =
    layout === 'target'
      ? plans.flatMap(p => collectMovedSkillDirs(p.files, p.layoutPaths, p.registry, options))
      : []

  for (const { registry, files, layoutPaths } of plans) {
    for (const filePath of files) {
      await copyFileToTemp({ filePath, layoutPaths, registry, tempDir, options, fsService, movedDirs })
    }
  }
}

interface CopyFileOptions {
  filePath: string
  layoutPaths: string[]
  registry: RegistryConfig
  tempDir: string
  options: ZipOptions
  fsService: FileSystemService
  movedDirs: MovedDir[]
}

type MovedDir = { originalDir: string; newDir: string }

/**
 * Reverse of flatten+prefix (`naming-transforms.ts`): `<prefix>-<category>-<name>` → `<category>/<name>`.
 * Flatten re-joins with `-`, so the installed name round-trips. Single-segment entries
 * (`<prefix>-next`) keep their name; a name without the prefix is left alone.
 */
export function unflattenEntry(entry: string, prefix: string): string {
  if (!entry.startsWith(`${prefix}-`)) return entry
  return entry.slice(prefix.length + 1).replace('-', '/')
}

function entryOf(filePath: string, layoutPaths: string[], registry: RegistryConfig, projectRoot: string) {
  const base = layoutPaths.find(p => filePath.startsWith(p + '/') || filePath === p)
  const baseDir = base ?? path.join(projectRoot, registry.source)
  const relative = path.relative(baseDir, filePath)
  return { baseDir, relative, entry: relative.split(path.sep)[0] ?? '' }
}

function isUnflattening(registry: RegistryConfig): registry is RegistryConfig & { prefix: string } {
  return !!registry.flatten && !!registry.prefix
}

function collectMovedSkillDirs(
  files: string[],
  layoutPaths: string[],
  registry: RegistryConfig,
  options: ZipOptions,
): MovedDir[] {
  if (!isUnflattening(registry)) return []
  const seen = new Map<string, MovedDir>()
  for (const f of files) {
    const { baseDir, relative, entry } = entryOf(f, layoutPaths, registry, options.projectRoot)
    if (!relative.includes(path.sep) || seen.has(entry)) continue
    seen.set(entry, {
      originalDir: path.join(options.projectRoot, path.relative(options.projectRoot, baseDir), entry),
      newDir: path.join(options.projectRoot, registry.source, unflattenEntry(entry, registry.prefix)),
    })
  }
  return [...seen.values()]
}

async function copyFileToTemp(opts: CopyFileOptions): Promise<void> {
  const { filePath, layoutPaths, registry, tempDir, options, fsService, movedDirs } = opts
  const layout: LayoutMode = options.layout || 'source'
  const basePath = layoutPaths.find(p => filePath.startsWith(p + '/') || filePath === p)
  const baseForRelative = basePath || path.join(options.projectRoot, registry.source)

  let relativePath = path.relative(baseForRelative, filePath)
  if (layout === 'target' && isUnflattening(registry) && relativePath.includes(path.sep)) {
    const [entry = '', ...rest] = relativePath.split(path.sep)
    relativePath = path.join(unflattenEntry(entry, registry.prefix), ...rest)
  }
  const targetPath = path.join(tempDir, registry.source, relativePath)

  await fsService.mkdir(path.dirname(targetPath), { recursive: true })

  let content = await fsService.readFile(filePath)

  if (options.root && filePath.endsWith('.md')) {
    content = await rewriteFileLinks({ filePath, root: options.root, fs: fsService })
  }

  await fsService.writeFile(targetPath, content)

  // Adjust relative link depth when packaging from target layout to source layout
  if (layout === 'target' && filePath.endsWith('.md')) {
    const originalDir = path.relative(options.projectRoot, path.dirname(filePath))
    const newDir = path.dirname(path.join(registry.source, relativePath))
    if (originalDir !== newDir || movedDirs.length > 0) {
      await rewriteLinksInFile({
        fileService: fsService,
        filePath: targetPath,
        originalDir,
        newDir,
        datasetRoot: options.projectRoot,
        movedDirs,
      })
    }
  }
}

async function cleanupOnError(outputPath: string, fsService: FileSystemService): Promise<void> {
  if (await fsService.exists(outputPath)) {
    await fsService.unlink(outputPath)
  }
}

async function cleanupTempDirectory(tempDir: string, fsService: FileSystemService): Promise<void> {
  if (await fsService.exists(tempDir)) {
    await fsService.rm(tempDir, { recursive: true, force: true })
  }
}

function validateOutputDirectory(outputPath: string, fsService: FileSystemService): void {
  const outputDir = path.dirname(outputPath)
  if (!fsService.existsSync(outputDir)) {
    fsService.mkdirSync(outputDir, { recursive: true })
  }
}
