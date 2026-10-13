import type { FileSystemService } from '@pair/content-ops'
import { join, resolve } from 'path'
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

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

interface Baseline {
  areas: { name: string; words: number; tokens: number }[]
  total: { words: number; tokens: number }
}

/** A baseline is a previous `--json` report; anything else is an error, never a silent no-delta. */
async function loadBaseline(fs: FileSystemService, config: TokensCommandConfig): Promise<Baseline> {
  const file = resolve(config.baseline as string)
  let j: Baseline
  try {
    j = JSON.parse(await fs.readFile(file))
  } catch (err) {
    throw new Error(`cannot read baseline ${file}: ${err instanceof Error ? err.message : err}`)
  }
  if (!Array.isArray(j?.areas) || !j.total)
    throw new Error(`baseline ${file} is not a tokens --json report`)
  return j
}

type Row = { name: string; files: number; words: number; tokens: number }

function report(json: boolean, areas: Row[], total: Omit<Row, 'name'>, base?: Baseline) {
  const diff = (r: { words: number; tokens: number }, b?: { words: number; tokens: number }) =>
    b ? { delta: { words: r.words - b.words, tokens: r.tokens - b.tokens } } : {}
  const rows = areas.map(a => ({
    ...a,
    ...diff(
      a,
      base?.areas.find(x => x.name === a.name),
    ),
  }))
  // total delta only when the baseline covers every measured area, summed over those areas
  const sel = base && areas.map(a => base.areas.find(b => b.name === a.name))
  const all = {
    ...total,
    ...(sel?.every(Boolean) ? diff(total, sum(sel as Baseline['areas'])) : {}),
  }
  if (json) {
    console.log(JSON.stringify({ areas: rows, total: all }, null, 2))
    return
  }
  for (const [name, r] of [...rows.map(a => [a.name, a] as const), ['total', all] as const]) {
    const d =
      'delta' in r ? `  Δ ${signed(r.delta.words)} words  ${signed(r.delta.tokens)} tokens` : ''
    console.log(`${name.padEnd(14)} ${r.files} files  ${r.words} words  ${r.tokens} tokens${d}`)
  }
}

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

    const base = config.baseline ? await loadBaseline(fs, config) : undefined
    report(config.json, areas, total, base)
    return 0
  } catch (error) {
    console.error(`tokens failed: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}
