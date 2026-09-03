import type { FileSystemService } from '@pair/content-ops'
import type { Dirent } from 'fs'
import { dirname, join, posix } from 'path'
import type { LogEntry } from '#diagnostics'

/**
 * The READ-ONLY slice of a file system the index generator needs.
 *
 * Declared structurally instead of taking the whole `FileSystemService` because of
 * who else runs this generator: the `.pair/llms.txt` drift gate (#416, in
 * `@pair/dev-tools`) calls it to compute what the tracked index SHOULD be. A gate
 * that could regenerate the file would silently fix the drift it exists to reveal
 * (check-only gate, ADL 2026-07-31) — so it hands in an adapter that has no
 * `writeFile` to call. The narrowing makes "this gate cannot write" a type fact
 * rather than a review promise.
 *
 * `fileSystemService` satisfies it structurally, so every existing caller is
 * unchanged.
 */
export interface LlmsSourceFs {
  exists: (path: string) => Promise<boolean>
  readdir: (path: string) => Promise<Dirent[]>
  readFile: (file: string) => Promise<string>
}

interface LlmsEntry {
  title: string
  path: string
}

/**
 * Walk one section directory and return its entries, ordered.
 *
 * TWO `join`s, ON PURPOSE. `fullPath`/`entryPath` are FILE-SYSTEM paths and keep the
 * platform's own separator (`join`); the `path` field is EMITTED into the index, so it
 * is built with `posix.join`. Sharing one call conflated the two jobs and was a bug:
 * `path.join` is bound to the platform, so a Windows run emitted
 * `.pair\knowledge\...` — a link no markdown renderer and no agent resolves, shipped
 * into every adopter's `.pair/llms.txt` by `pair install`/`update`. Measured on this
 * repo's real index with Node's real `path.win32`: all 562 entries change, and the
 * drift gate reports 562 missing + 562 extra with nothing naming the cause.
 *
 * ORDER IS A FUNCTION OF THE CONTENT, NOT of the runtime — the index is a TRACKED,
 * byte-compared artifact (#416's drift gate). `localeCompare` with no locale argument
 * uses the runtime's ICU default: measured on this repo's index, 458 of 560 entries sit
 * in a different position under ICU collation (ICU puts
 * `.pair/adoption/product/context-map.md` before `PRD.md`, this comparator the
 * reverse), so on a Node built without full ICU the gate would go red on an untouched
 * tree and send the contributor to regenerate environment-dependent churn.
 * `<`/`>` compares UTF-16 CODE UNITS — codepoint order for every BMP path, i.e. every
 * path a KB has carried; the two diverge only above U+FFFF, where a surrogate pair
 * sorts below U+E000-U+FFFF. Both are environment-independent, which is the invariant.
 *
 * The separator belongs to that same invariant, and not only to the link form: it is a
 * SORT KEY. `\` is U+005C, `/` is U+002F, so `a/b.md` sorts before `a5.md` on POSIX
 * and after it on Windows.
 *
 * ADL `2026-09-01-a-byte-compared-generated-artifact-sorts-by-codepoint.md`, rules 1
 * and 3.
 */
async function scanSection(
  fs: LlmsSourceFs,
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
      const nested = await scanSection(fs, baseDir, posix.join(sectionPath, dirent.name))
      entries.push(...nested)
    } else if (dirent.name.endsWith('.md') || dirent.name.endsWith('.mdx')) {
      const content = await fs.readFile(entryPath)
      const titleMatch = content.match(/^#\s+(.+)$/m)
      const title = titleMatch?.[1] ?? dirent.name.replace(/\.mdx?$/, '')
      entries.push({ title, path: posix.join(sectionPath, dirent.name) })
    }
  }

  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

export async function generateLlmsTxt(fs: LlmsSourceFs, baseTarget: string): Promise<string> {
  const pairDir = join(baseTarget, '.pair')

  const sections: { heading: string; entries: LlmsEntry[] }[] = []

  const sectionDefs = [
    { heading: 'Adoption — Product', path: '.pair/adoption/product' },
    { heading: 'Adoption — Tech', path: '.pair/adoption/tech' },
    // ADRs live under `adoption/tech/adr/` (reached by the Tech section above); ADL
    // and analysis entries live here. Without this def the index presents the
    // decision record as ADR-only. Absent directory ⇒ scanSection returns [] ⇒ no
    // empty section is emitted, so adopters without a decision log are unaffected.
    { heading: 'Adoption — Decisions', path: '.pair/adoption/decision-log' },
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
    // Owns its own directory: `.pair/` is not guaranteed by any registry having been
    // installed (a source may ship `skills` and nothing under `.pair/`).
    await fs.mkdir(dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, content)
    pushLog('info', 'Generated .pair/llms.txt')
  } catch (err) {
    pushLog('warn', `Failed to generate .pair/llms.txt: ${String(err)}`)
  }
}
