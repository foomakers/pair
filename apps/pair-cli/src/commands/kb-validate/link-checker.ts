import type { FileSystemService } from '@pair/content-ops'
import type { HttpClientService } from '@pair/content-ops'
import { join, dirname, isAbsolute } from 'path'

/**
 * Link validation result
 */
export interface LinkValidationResult {
  file: string
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Options for link validation
 */
export interface LinkValidationOptions {
  baseDir: string
  files: string[]
  fs: FileSystemService
  httpClient?: HttpClientService
  strict?: boolean
}

/**
 * Validates links in markdown files
 * @param options - Validation options
 * @returns Validation results per file
 */
export async function validateLinks(
  options: LinkValidationOptions,
): Promise<LinkValidationResult[]> {
  const { baseDir, files, fs, httpClient, strict } = options

  const results: LinkValidationResult[] = []

  for (const file of files) {
    const result =
      strict && httpClient
        ? await validateFileLinks({ file, baseDir, fs, httpClient })
        : await validateFileLinks({ file, baseDir, fs })
    results.push(result)
  }

  return results
}

/**
 * Validates links in a single file
 */
async function validateFileLinks(params: {
  file: string
  baseDir: string
  fs: FileSystemService
  httpClient?: HttpClientService
}): Promise<LinkValidationResult> {
  const { file, baseDir, fs, httpClient } = params

  const errors: string[] = []
  const warnings: string[] = []

  // Read file content
  const content = await fs.readFile(file)

  // Extract links from markdown
  const links = extractLinks(content)

  // Validate each link
  for (const link of links) {
    if (isExternalLink(link)) {
      // External link - only validate if httpClient provided (strict mode)
      if (httpClient) {
        const externalResult = await validateExternalLink(link, httpClient)
        if (!externalResult.valid) {
          warnings.push(`Unreachable external link: ${link}`)
        }
      }
    } else {
      // Internal link - always validate
      const internalResult = await validateInternalLink(link, file, baseDir, fs)
      if (!internalResult.valid) {
        errors.push(`Broken internal link: ${link}`)
      }
    }
  }

  return {
    file,
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Strip fenced code blocks from markdown content to avoid false-positive link matches
 * inside code examples (e.g. regex with pipes, JS callbacks parsed as links).
 */
function stripFencedCodeBlocks(content: string): string {
  // Match ``` or ```` (with optional language) to closing fence of same length
  return content.replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '')
}

/**
 * Extracts markdown links from content
 * Matches [text](url) format, ignoring content inside fenced code blocks
 */
function extractLinks(content: string): string[] {
  const stripped = stripFencedCodeBlocks(content)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  const links: string[] = []

  let match
  while ((match = linkRegex.exec(stripped)) !== null) {
    const url = match[2]
    if (url) {
      links.push(url)
    }
  }

  return links
}

/**
 * Checks if a link is external (http/https)
 */
function isExternalLink(link: string): boolean {
  return link.startsWith('http://') || link.startsWith('https://')
}

/**
 * Validates an internal link
 */
async function validateInternalLink(
  link: string,
  sourceFile: string,
  baseDir: string,
  fs: FileSystemService,
): Promise<{ valid: boolean }> {
  // Handle anchor-only links (#section)
  if (link.startsWith('#')) {
    // Anchor within same file - assume valid
    return { valid: true }
  }

  // Split link and anchor (path#anchor)
  const [pathPart] = link.split('#')
  if (!pathPart) {
    return { valid: true }
  }

  // Resolve link path
  let targetPath: string
  if (isAbsolute(pathPart)) {
    // Absolute path - resolve from baseDir
    targetPath = join(baseDir, pathPart)
  } else {
    // Relative path - resolve from source file directory
    const sourceDir = dirname(sourceFile)
    targetPath = join(sourceDir, pathPart)
  }

  // Check if target exists
  const exists = await fs.exists(targetPath)
  return { valid: exists }
}

/**
 * Validates an external link via HTTP HEAD
 * Includes a 2-second timeout to prevent hanging on unreachable URLs
 */
async function validateExternalLink(
  link: string,
  httpClient: HttpClientService,
): Promise<{ valid: boolean }> {
  return new Promise(resolve => {
    let resolved = false

    // Timeout after 2 seconds
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        resolve({ valid: false })
      }
    }, 2000)

    const request = httpClient.request(link, { method: 'HEAD' }, res => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        // Any response (even 4xx/5xx) means the link is reachable
        resolve({ valid: !!res })
      }
    })

    request.on('error', () => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        resolve({ valid: false })
      }
    })

    request.end()
  })
}
