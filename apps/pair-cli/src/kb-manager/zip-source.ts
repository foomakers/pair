import { createHash } from 'crypto'
import type { FileSystemService } from '@pair/content-ops'
import { resolveSourcePath, type KBSource } from './cache-slot-key'

/** The one `KBSource` form whose identity is derived from file CONTENT. */
export type ZipKBSource = Extract<KBSource, { kind: 'zip' }>

/**
 * Identity of a local ZIP source (US-395/#429): the sha256 of the archive's BYTES,
 * read with the byte-mode API. The text-mode `readFile` decodes utf-8 lossily, and a
 * hash of a lossily decoded binary is not an identity to defend in a security-adjacent
 * path — two different archives could collapse onto one slot through the decode.
 *
 * This is the ONLY producer of a `zip` KBSource, so a slot key can never be derived
 * from anything but the bytes on disk. Content keying is what collapses the same
 * archive copied to two directories into ONE slot; a directory source stays path-bound
 * because it is read in place and owns no slot at all (`LocalKBSource`).
 */
export async function zipKBSource(rawPath: string, fs: FileSystemService): Promise<ZipKBSource> {
  const path = resolveSourcePath(rawPath, fs)
  if (!fs.existsSync(path)) {
    throw new Error(`ZIP file not found: ${path}`)
  }
  const contentHash = createHash('sha256').update(await fs.readFileBytes(path)).digest('hex')
  return { kind: 'zip', path, contentHash }
}

export default { zipKBSource }
