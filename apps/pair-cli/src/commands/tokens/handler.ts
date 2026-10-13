import type { FileSystemService } from '@pair/content-ops'
import { join } from 'path'
import { TOKEN_AREAS, type TokenArea, type TokensCommandConfig } from './parser'

interface Item {
  path: string
  words: number
  tokens: number
}

const TEMPLATES = '.pair/knowledge/guidelines/collaboration/templates'
const ADOPTION = '.pair/adoption'
const ADR = `${ADOPTION}/tech/adr`
const DECISION_LOG = `${ADOPTION}/decision-log`
const GUIDELINES = '.pair/knowledge/guidelines'
const SKILL_MD = /^\.claude\/skills\/[^/]+\/SKILL\.md$/

const under = (p: string, dir: string) => p.startsWith(`${dir}/`)

/** area -> directory to walk + filter on the root-relative path. Disjoint by construction. */
const AREAS: Record<TokenArea, { dir: string; keep: (p: string) => boolean }> = {
  templates: { dir: TEMPLATES, keep: () => true },
  adoption: {
    dir: ADOPTION,
    keep: p => !under(p, ADR) && !under(p, DECISION_LOG),
  },
  adr: { dir: ADR, keep: () => true },
  'decision-log': { dir: DECISION_LOG, keep: () => true },
  skills: { dir: '.claude/skills', keep: p => SKILL_MD.test(p) },
  guidelines: { dir: GUIDELINES, keep: p => !under(p, TEMPLATES) },
  'agent-context': { dir: '', keep: p => p === 'AGENTS.md' || p === 'CLAUDE.md' },
}

/** Root-relative paths of every .md under `rel`. A `.md` entry is always treated as a file. */
async function walk(fs: FileSystemService, root: string, rel: string): Promise<string[]> {
  if (!(await fs.exists(join(root, rel)))) return []
  const out: string[] = []
  for (const e of await fs.readdir(join(root, rel))) {
    const p = rel ? `${rel}/${e.name}` : e.name
    if (e.name.endsWith('.md')) out.push(p)
    // agent-context walks the root non-recursively: only its two files matter
    else if (e.isDirectory() && rel !== '') out.push(...(await walk(fs, root, p)))
  }
  return out
}

async function measure(fs: FileSystemService, root: string, paths: string[]): Promise<Item[]> {
  const items: Item[] = []
  for (const path of paths.sort()) {
    try {
      const text = await fs.readFile(join(root, path))
      items.push({
        path,
        words: text.split(/\s+/).filter(Boolean).length,
        tokens: Math.ceil(text.length / 4),
      })
    } catch (err) {
      console.error(`warning: skipped ${path}: ${err instanceof Error ? err.message : err}`)
    }
  }
  return items
}

const sum = (items: { words: number; tokens: number }[]) => ({
  words: items.reduce((n, i) => n + i.words, 0),
  tokens: items.reduce((n, i) => n + i.tokens, 0),
})

export async function handleTokensCommand(
  config: TokensCommandConfig,
  fs: FileSystemService,
): Promise<number> {
  try {
    const names = config.area ? [config.area] : TOKEN_AREAS
    const areas = []
    for (const name of names) {
      const { dir, keep } = AREAS[name]
      const items = await measure(fs, config.root, (await walk(fs, config.root, dir)).filter(keep))
      areas.push({ name, files: items.length, ...sum(items), items })
    }
    const total = { files: areas.reduce((n, a) => n + a.files, 0), ...sum(areas) }

    if (config.json) console.log(JSON.stringify({ areas, total }, null, 2))
    else {
      for (const a of areas)
        console.log(`${a.name.padEnd(14)} ${a.files} files  ${a.words} words  ${a.tokens} tokens`)
      console.log(
        `${'total'.padEnd(14)} ${total.files} files  ${total.words} words  ${total.tokens} tokens`,
      )
    }
    return 0
  } catch (error) {
    console.error(`tokens failed: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}
