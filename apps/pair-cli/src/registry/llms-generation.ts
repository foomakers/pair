import type { FileSystemService } from '@pair/content-ops'
import { join } from 'path'
import type { LogEntry } from '#diagnostics'

interface LlmsEntry {
  title: string
  path: string
}

async function scanSection(
  fs: FileSystemService,
  baseDir: string,
  sectionPath: string,
): Promise<LlmsEntry[]> {
  const fullPath = join(baseDir, sectionPath)
  if (!(await fs.exists(fullPath))) return []

  const entries: LlmsEntry[] = []
  const dirents = await fs.readdir(fullPath)

  for (const dirent of dirents) {
    const entryPath = join(fullPath, dirent.name)
    if (dirent.isDirectory()) {
      const nested = await scanSection(fs, baseDir, join(sectionPath, dirent.name))
      entries.push(...nested)
    } else if (dirent.name.endsWith('.md') || dirent.name.endsWith('.mdx')) {
      const content = await fs.readFile(entryPath)
      const titleMatch = content.match(/^#\s+(.+)$/m)
      const title = titleMatch?.[1] ?? dirent.name.replace(/\.mdx?$/, '')
      entries.push({ title, path: join(sectionPath, dirent.name) })
    }
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path))
}

export async function generateLlmsTxt(fs: FileSystemService, baseTarget: string): Promise<string> {
  const pairDir = join(baseTarget, '.pair')

  const sections: { heading: string; entries: LlmsEntry[] }[] = []

  const sectionDefs = [
    { heading: 'Adoption — Product', path: '.pair/product/adopted' },
    { heading: 'Adoption — Tech', path: '.pair/tech/adopted' },
    { heading: 'How-To Guides', path: '.pair/knowledge/how-to' },
    { heading: 'Guidelines', path: '.pair/knowledge/guidelines' },
  ]

  for (const def of sectionDefs) {
    const entries = await scanSection(fs, baseTarget, def.path)
    if (entries.length > 0) {
      sections.push({ heading: def.heading, entries })
    }
  }

  // Check for skills guide
  const skillsGuidePath = join(pairDir, 'knowledge', 'skills-guide.md')
  if (await fs.exists(skillsGuidePath)) {
    sections.push({
      heading: 'Skills',
      entries: [{ title: 'Skills Guide', path: '.pair/knowledge/skills-guide.md' }],
    })
  }

  const lines = ['# pair', '', '> AI-assisted development knowledge base for this project.', '']

  for (const section of sections) {
    lines.push(`## ${section.heading}`, '')
    for (const entry of section.entries) {
      lines.push(`- [${entry.title}](${entry.path})`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export async function writeProjectLlmsTxt(
  fs: FileSystemService,
  baseTarget: string,
  pushLog: (level: LogEntry['level'], message: string) => void,
): Promise<void> {
  try {
    const content = await generateLlmsTxt(fs, baseTarget)
    const outputPath = join(baseTarget, '.pair', 'llms.txt')
    await fs.writeFile(outputPath, content)
    pushLog('info', 'Generated .pair/llms.txt')
  } catch (err) {
    pushLog('warn', `Failed to generate .pair/llms.txt: ${String(err)}`)
  }
}
