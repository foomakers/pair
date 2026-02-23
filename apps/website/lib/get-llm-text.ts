import fs from 'node:fs'
import path from 'node:path'

export interface LlmPage {
  title: string
  url: string
  content: string
}

interface Frontmatter {
  [key: string]: string | boolean
}

interface ParsedMdx {
  data: Frontmatter
  content: string
}

export function parseFrontmatter(raw: string): ParsedMdx {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match?.[1] || !match[2]) return { data: {}, content: raw }

  const data: Frontmatter = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const val = line.slice(colonIdx + 1).trim()
    if (key) data[key] = val
  }

  return { data, content: match[2] }
}

export function stripJsx(content: string): string {
  let result = content
  // Iterative stripping handles nested same-type components:
  // inner components are removed first, making outer ones matchable next pass
  let prev = ''
  while (prev !== result) {
    prev = result
    // Remove JSX blocks: <Component ...>...</Component> (including multiline)
    result = result.replace(/<[A-Z][a-zA-Z]*[^>]*>[\s\S]*?<\/[A-Z][a-zA-Z]*>/g, '')
    // Remove self-closing JSX tags: <Component ... />
    result = result.replace(/<[A-Z][^>]*\/>/g, '')
    // Remove remaining JSX opening/closing tags
    result = result.replace(/<\/?[A-Z][a-zA-Z]*[^>]*>/g, '')
  }
  // Collapse multiple blank lines
  result = result.replace(/\n{3,}/g, '\n\n')
  return result.trim()
}

export function getUrlFromFilePath(filePath: string, contentDir: string): string {
  const relative = path
    .relative(contentDir, filePath)
    .replace(/\.mdx$/, '')
    .replace(/\\/g, '/')
  if (relative === 'index') return '/docs'
  const withoutIndex = relative.replace(/\/index$/, '')
  return `/docs/${withoutIndex}`
}

function getAllMdxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const files: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...getAllMdxFiles(fullPath))
    } else if (entry.name.endsWith('.mdx')) {
      files.push(fullPath)
    }
  }
  return files
}

export function getLlmPages(contentDir?: string): LlmPage[] {
  const dir = contentDir ?? path.join(process.cwd(), 'content', 'docs')
  const files = getAllMdxFiles(dir)
  const pages: LlmPage[] = []

  for (const file of files) {
    if (path.basename(file) === 'meta.json') continue

    const raw = fs.readFileSync(file, 'utf-8')
    const { data, content } = parseFrontmatter(raw)

    const draft = data['draft']
    if (draft === true || draft === 'true') continue

    const rawTitle = data['title']
    const title = typeof rawTitle === 'string' ? rawTitle : path.basename(file, '.mdx')
    const url = getUrlFromFilePath(file, dir)
    const cleanContent = stripJsx(content)

    pages.push({ title, url, content: cleanContent })
  }

  return pages.sort((a, b) => a.url.localeCompare(b.url))
}

export function formatLlmsIndex(pages: LlmPage[], siteUrl: string): string {
  const lines = [
    '# pair',
    '',
    '> AI-assisted software development — structured Knowledge Base, Agent Skills, and adoption files for AI coding assistants.',
    '',
  ]

  const sections = new Map<string, { title: string; url: string }[]>()

  for (const page of pages) {
    const parts = page.url.replace('/docs/', '').split('/')
    const section = parts.length > 1 ? (parts[0] ?? 'root') : 'root'
    if (!sections.has(section)) sections.set(section, [])
    sections.get(section)!.push({ title: page.title, url: page.url })
  }

  for (const [section, items] of sections) {
    const heading =
      section === 'root'
        ? 'Docs'
        : section.charAt(0).toUpperCase() + section.slice(1).replace(/-/g, ' ')
    lines.push(`## ${heading}`, '')
    for (const item of items) {
      lines.push(`- [${item.title}](${siteUrl}${item.url})`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function formatLlmsFull(pages: LlmPage[], siteUrl: string): string {
  const parts = [
    '# pair',
    '',
    '> AI-assisted software development — structured Knowledge Base, Agent Skills, and adoption files for AI coding assistants.',
    '',
  ]

  for (const page of pages) {
    parts.push(`## ${page.title}`, '')
    parts.push(`Source: ${siteUrl}${page.url}`, '')
    parts.push(page.content, '')
    parts.push('---', '')
  }

  return parts.join('\n')
}
