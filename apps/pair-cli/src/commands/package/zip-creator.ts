import type { FileSystemService } from '@pair/content-ops'
import type { ManifestMetadata } from './metadata'
import type { RegistryConfig } from '#registry'
import { rewriteFileLinks } from './link-rewriter'
import { collectLayoutFiles, resolveLayoutPaths, type LayoutMode } from '../../registry/layout'
import path from 'path'

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
    await writeManifest(tempDir, options.manifest, fsService)
    await copyRegistrySources(tempDir, options, fsService)
    await fsService.createZip([tempDir], options.outputPath)
  } catch (error) {
    await cleanupOnError(options.outputPath, fsService)
    throw error
  } finally {
    await cleanupTempDirectory(tempDir, fsService)
  }
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

  for (const registry of options.registries) {
    if (!registry.source) {
      throw new Error(`Registry missing source field`)
    }

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

    for (const filePath of files) {
      await copyFileToTemp({
        filePath,
        layoutPaths,
        registry,
        tempDir,
        options,
        fsService,
      })
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
}

async function copyFileToTemp(opts: CopyFileOptions): Promise<void> {
  const { filePath, layoutPaths, registry, tempDir, options, fsService } = opts
  const basePath = layoutPaths.find(p => filePath.startsWith(p + '/') || filePath === p)
  const baseForRelative = basePath || path.join(options.projectRoot, registry.source)

  const relativePath = path.relative(baseForRelative, filePath)
  const targetPath = path.join(tempDir, registry.source, relativePath)

  await fsService.mkdir(path.dirname(targetPath), { recursive: true })

  let content = await fsService.readFile(filePath)

  if (options.root && filePath.endsWith('.md')) {
    content = await rewriteFileLinks({ filePath, root: options.root, fs: fsService })
  }

  await fsService.writeFile(targetPath, content)
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
