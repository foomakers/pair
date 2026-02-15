import type { FileSystemService } from '@pair/content-ops'

/**
 * Options for rewriting absolute links
 */
export interface RewriteAbsoluteLinksOptions {
  path: string
  root: string
  fs: FileSystemService
}

/**
 * Options for rewriting file links
 */
export interface RewriteFileLinksOptions {
  filePath: string
  root: string
  fs: FileSystemService
}

/**
 * Options for rewriting directory links
 */
export interface RewriteDirectoryLinksOptions {
  dirPath: string
  root: string
  fs: FileSystemService
}

/**
 * Rewrites absolute links in a file or directory
 * Detects whether path is file or directory and calls appropriate function
 * @param options - Rewrite options
 * @returns List of modified file paths
 */
export async function rewriteAbsoluteLinks(
  options: RewriteAbsoluteLinksOptions,
): Promise<string[]> {
  const { path, root, fs } = options

  const exists = await fs.exists(path)
  if (!exists) {
    throw new Error(`Path does not exist: ${path}`)
  }

  const stat = await fs.stat(path)

  if (stat.isDirectory()) {
    return rewriteDirectoryLinks({ dirPath: path, root, fs })
  } else {
    const content = await rewriteFileLinks({ filePath: path, root, fs })
    await fs.writeFile(path, content)
    return [path]
  }
}

/**
 * Rewrites absolute links in a single file
 * @param options - Rewrite options
 * @returns Modified file content
 */
export async function rewriteFileLinks(options: RewriteFileLinksOptions): Promise<string> {
  const { filePath, root, fs } = options

  const content = await fs.readFile(filePath)

  // Normalize root: remove leading/trailing slashes
  const normalizedRoot = root.replace(/^\/+|\/+$/g, '')

  // Regex to match markdown links: [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g

  const rewritten = content.replace(linkRegex, (_match, text, url) => {
    // Skip external links (http/https)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return `[${text}](${url})`
    }

    // Skip relative links (. or ..)
    if (url.startsWith('./') || url.startsWith('../')) {
      return `[${text}](${url})`
    }

    // Skip non-absolute links (no leading slash)
    if (!url.startsWith('/')) {
      return `[${text}](${url})`
    }

    // Absolute link - convert to relative
    const absolutePath = url.replace(/^\/+/, '')

    // Check if link is within root
    if (absolutePath.startsWith(normalizedRoot + '/')) {
      // Link is within root - make it relative to root
      const relativePath = absolutePath.slice(normalizedRoot.length + 1)
      return `[${text}](${relativePath})`
    } else if (absolutePath === normalizedRoot) {
      // Link is exactly root
      return `[${text}](.)`
    } else {
      // Link is outside root - compute relative path
      const rootSegments = normalizedRoot.split('/').filter(s => s.length > 0)
      const upLevels = rootSegments.length

      const prefix = upLevels > 0 ? '../'.repeat(upLevels) : ''
      return `[${text}](${prefix}${absolutePath})`
    }
  })

  return rewritten
}

/**
 * Rewrites absolute links in all markdown files in a directory (non-recursive)
 * @param options - Rewrite options
 * @returns List of modified file paths
 */
export async function rewriteDirectoryLinks(
  options: RewriteDirectoryLinksOptions,
): Promise<string[]> {
  const { dirPath, root, fs } = options

  const entries = await fs.readdir(dirPath)
  const modifiedFiles: string[] = []

  for (const entry of entries) {
    const fullPath = fs.resolve(dirPath, entry.name)
    const stat = await fs.stat(fullPath)

    // Skip subdirectories - only process files in current directory
    if (stat.isDirectory()) continue

    // Only process markdown files
    if (!entry.name.endsWith('.md')) continue

    const content = await rewriteFileLinks({ filePath: fullPath, root, fs })
    await fs.writeFile(fullPath, content)
    modifiedFiles.push(fullPath)
  }

  return modifiedFiles
}
