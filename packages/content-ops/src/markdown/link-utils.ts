import { FileSystemService, walkMarkdownFiles } from '../file-system'
import { isExternalLink } from '../file-system/file-system-utils'
import { extractLinks } from './markdown-parser'

/**
 * Detect the dominant link style in markdown files within a directory
 * Returns 'relative' if relative links are >= absolute links, otherwise 'absolute'
 */
export async function detectLinkStyle(
  fsService: FileSystemService,
  targetPath: string,
): Promise<'relative' | 'absolute'> {
  const files = await walkMarkdownFiles(targetPath, fsService)
  let relativeCount = 0
  let absoluteCount = 0

  for (const file of files) {
    const content = await fsService.readFile(file)
    const links = await extractLinks(content)

    for (const link of links) {
      if (isExternalLink(link.href)) continue
      if (link.href.startsWith('#')) continue

      if (link.href.startsWith('/')) {
        absoluteCount++
      } else {
        relativeCount++
      }
    }
  }

  return relativeCount >= absoluteCount ? 'relative' : 'absolute'
}
