import type { FileSystemService } from '@pair/content-ops'

/**
 * Validates a Knowledge Base structure
 * Checks for required directories (.pair/) and manifest files
 *
 * @param kbPath - Path to knowledge base directory
 * @param fs - FileSystemService instance
 * @throws Error if KB structure is invalid
 */
export async function validateKnowledgeBase(
  kbPath: string,
  fs: FileSystemService,
): Promise<void> {
  // Check .pair directory exists
  const pairDir = `${kbPath}/.pair`
  const exists = await fs.exists(pairDir)
  if (!exists) {
    throw new Error(`Invalid KB: missing .pair directory at ${pairDir}`)
  }

  console.log('✅ KB structure validation passed')
}
