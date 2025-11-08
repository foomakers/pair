import { join, relative, dirname } from 'path'
import { FileSystemService } from '../file-system/file-system-service'
import { detectRepoRoot } from '../path-resolution/root-detection'

export function resolveMarkdownPath(
  file: string,
  linkPath: string,
  docsFolders: string[],
  datasetRoot: string,
) {
  if (!linkPath) throw new Error('linkPath is undefined')

  const noAnchor = linkPath.split('#')[0] ?? ''
  const firstSegment = noAnchor.split('/')[0] ?? ''

  let result: string
  if (docsFolders.includes(firstSegment)) {
    result = join(datasetRoot, noAnchor)
  } else if (noAnchor.startsWith('./') || noAnchor.startsWith('../') || !noAnchor.includes('/')) {
    result = join(dirname(file), noAnchor)
  } else {
    const fileRelativeDir = relative(datasetRoot, dirname(file))
    result = join(datasetRoot, fileRelativeDir, noAnchor)
  }

  return result
}

type PathResolutionContext = {
  file: string
  linkPath: string
  docsFolders: string[]
  fileService: FileSystemService
  datasetRoot: string
}

export async function tryResolvePathVariants(context: PathResolutionContext) {
  const { file, linkPath, docsFolders, fileService, datasetRoot } = context

  if (!linkPath.startsWith('../')) return null

  const segments = linkPath.split('/')
  const maxBackSteps = segments.filter(s => s === '..').length

  const candidates = Array.from({ length: maxBackSteps + 1 }, (_, i) => {
    const candidate = segments.slice(i).join('/')
    return candidate.startsWith('.') ? candidate : './' + candidate
  })

  for (const candidate of candidates) {
    const resolved = resolveMarkdownPath(file, candidate, docsFolders, datasetRoot)
    if (await fileService.exists(resolved)) {
      return candidate
    }
  }
  return null
}

/**
 * Async wrapper that detects the dataset root when it's not provided and
 * delegates to `resolveMarkdownPath`. This is low-risk: it doesn't change
 * existing sync behavior and is opt-in for callers that can await.
 */
export type ResolveMarkdownPathAutoOpts = {
  file: string
  linkPath: string
  docsFolders: string[]
  fileService: FileSystemService
  datasetRoot?: string
}

export async function resolveMarkdownPathAuto(opts: ResolveMarkdownPathAutoOpts) {
  const { file, linkPath, docsFolders, fileService, datasetRoot } = opts
  let root = datasetRoot
  if (!root) {
    // start detection from the file's directory
    const start = dirname(file)
    const detected = await detectRepoRoot(start, fileService)
    root = detected ?? dirname(file)
  }

  // Use existing resolver
  const resolved = resolveMarkdownPath(file, linkPath, docsFolders, root)

  // normalize path to absolute using fileService.resolve to preserve FS semantics
  return fileService.resolve(resolved)
}
