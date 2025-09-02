import type { Link, Root } from 'mdast'
import { getUnifiedInstance, getRemarkParseInstance } from '../file-system/lazy-loader'

export type ParsedLink = {
  href: string
  text: string
  line: number
  start: number | undefined
  end: number | undefined
}

let cachedProcessor: {
  use: (p: unknown) => unknown
  parse: (s: string) => unknown
} | null = null

async function getProcessor() {
  if (cachedProcessor) return cachedProcessor

  const unified = await getUnifiedInstance()
  const remarkParse = await getRemarkParseInstance()
  const processor = (
    unified as { (): { use: (p: unknown) => unknown; parse: (s: string) => unknown } }
  )() as {
    use: (p: unknown) => unknown
    parse: (s: string) => unknown
  }
  processor.use(remarkParse as unknown)
  cachedProcessor = processor
  return processor
}

export async function extractLinks(content: string): Promise<ParsedLink[]> {
  const processor = await getProcessor()
  const tree = processor.parse(content) as Root
  const links: ParsedLink[] = []

  function visit(node: Root | Link) {
    if (node.type === 'link') addLink(node as Link)
    visitChildren(node)
  }

  function addLink(linkNode: Link) {
    const url = linkNode.url || ''
    const text = extractLinkText(linkNode)

    const line = linkNode.position?.start?.line ?? 1
    const start = linkNode.position?.start?.offset
    const end = linkNode.position?.end?.offset

    links.push({ href: url, text, line, start, end })
  }

  function visitChildren(node: Root | Link) {
    if ('children' in node && Array.isArray(node.children)) {
      for (const c of node.children) visit(c as Root | Link)
    }
  }

  visit(tree)

  return links
}

function extractLinkText(linkNode: Link): string {
  let text = ''
  if (!Array.isArray(linkNode.children)) return text
  for (const c of linkNode.children) {
    if (c.type === 'text' && 'value' in c) {
      text += c.value
    }
  }
  return text
}
