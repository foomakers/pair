import type { FileSystemService } from '@pair/content-ops'
import type { ManifestMetadata } from './metadata'
import type { AssetRegistryConfig } from '../install'
import AdmZip from 'adm-zip'
import fs from 'fs'
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

  const zip = new AdmZip()

  try {
    await addManifestToZip(zip, options.manifest)
    await addRegistriesToZip(zip, options, fsService)
    await writeZipFile(zip, options.outputPath)
  } catch (error) {
    cleanupPartialZip(options.outputPath)
    throw error
  }
}

function validateOutputDirectory(outputPath: string, fsService: FileSystemService): void {
  const outputDir = path.dirname(outputPath)
  if (!fsService.existsSync(outputDir)) {
    throw new Error(`Output directory does not exist: ${outputDir}`)
  }
}

async function addManifestToZip(zip: AdmZip, manifest: ManifestMetadata): Promise<void> {
  const manifestJson = JSON.stringify(manifest, null, 2)
  zip.addFile('manifest.json', Buffer.from(manifestJson, 'utf-8'))
}

async function addRegistriesToZip(
  zip: AdmZip,
  options: ZipOptions,
  fsService: FileSystemService,
): Promise<void> {
  for (const registry of options.registries) {
    if (!registry.source) {
      throw new Error(`Registry missing source field`)
    }

    const sourcePath = path.join(options.projectRoot, registry.source)
    await addRegistrySource(zip, sourcePath, registry.source, fsService)
  }
}

async function addRegistrySource(
  zip: AdmZip,
  sourcePath: string,
  relativePath: string,
  fsService: FileSystemService,
): Promise<void> {
  const exists = await fsService.exists(sourcePath)
  if (!exists) {
    throw new Error(`Registry source does not exist: ${relativePath}`)
  }

  const stats = await fsService.stat(sourcePath)

  if (stats.isDirectory()) {
    await addDirectoryToZip(zip, sourcePath, relativePath, fsService)
  } else {
    const content = await fsService.readFile(sourcePath)
    zip.addFile(relativePath, Buffer.from(content))
  }
}

async function addDirectoryToZip(
  zip: AdmZip,
  dirPath: string,
  relativePath: string,
  fsService: FileSystemService,
): Promise<void> {
  const entries = await fsService.readdir(dirPath)

  for (const entry of entries) {
    await processDirectoryEntry({ zip, dirPath, relativePath, entry, fsService })
  }
}

interface ProcessEntryOptions {
  zip: AdmZip
  dirPath: string
  relativePath: string
  entry: {
    name: string
    isDirectory: () => boolean
    isSymbolicLink: () => boolean
    isFile: () => boolean
  }
  fsService: FileSystemService
}

async function processDirectoryEntry(options: ProcessEntryOptions): Promise<void> {
  const { zip, dirPath, relativePath, entry, fsService } = options

  if (entry.isSymbolicLink()) {
    return
  }

  const fullPath = path.join(dirPath, entry.name)
  const entryRelativePath = path.join(relativePath, entry.name)

  if (entry.isDirectory()) {
    await addDirectoryToZip(zip, fullPath, entryRelativePath, fsService)
  } else if (entry.isFile()) {
    const content = await fsService.readFile(fullPath)
    zip.addFile(entryRelativePath, Buffer.from(content))
  }
}

async function writeZipFile(zip: AdmZip, outputPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    try {
      zip.writeZip(outputPath)
      resolve()
    } catch (error) {
      reject(error)
    }
  })
}

function cleanupPartialZip(outputPath: string): void {
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath)
  }
}
