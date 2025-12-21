import type { FileSystemService } from '@pair/content-ops'
import type { ManifestMetadata } from './metadata'
import type { AssetRegistryConfig } from '../install'
import path from 'path'

interface ZipOptions {
  projectRoot: string
  registries: AssetRegistryConfig[]
  manifest: ManifestMetadata
  outputPath: string
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
  for (const registry of options.registries) {
    if (!registry.source) {
      throw new Error(`Registry missing source field`)
    }

    const sourcePath = path.join(options.projectRoot, registry.source)
    const exists = await fsService.exists(sourcePath)
    if (!exists) {
      throw new Error(`Registry source does not exist: ${registry.source}`)
    }

    const targetPath = path.join(tempDir, registry.source)
    await copyRecursive(sourcePath, targetPath, fsService)
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

async function copyRecursive(
  sourcePath: string,
  targetPath: string,
  fsService: FileSystemService,
): Promise<void> {
  const stats = await fsService.stat(sourcePath)

  if (stats.isDirectory()) {
    await fsService.mkdir(targetPath, { recursive: true })
    const entries = await fsService.readdir(sourcePath)

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue

      const srcPath = path.join(sourcePath, entry.name)
      const dstPath = path.join(targetPath, entry.name)
      await copyRecursive(srcPath, dstPath, fsService)
    }
  } else {
    const content = await fsService.readFile(sourcePath)
    await fsService.writeFile(targetPath, content)
  }
}

function validateOutputDirectory(outputPath: string, fsService: FileSystemService): void {
  const outputDir = path.dirname(outputPath)
  if (!fsService.existsSync(outputDir)) {
    fsService.mkdirSync(outputDir, { recursive: true })
  }
}
