import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'

export const NEUTRAL_AGENTS_DIR = '.agents/agents'
const FM = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/

/** Frontmatter `key: value`, with folded/literal (`>`/`|`) blocks joined into one line. */
function frontmatter(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  let key = ''
  for (const line of block.split('\n')) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (m) {
      key = m[1] as string
      out[key] = /^[>|][+-]?$/.test(m[2] as string) ? '' : (m[2] as string).trim()
    } else if (key) out[key] = `${out[key]} ${line.trim()}`.trim()
  }
  return out
}

/** Agent markdown -> codex role TOML (`.codex/agents`). */
export function toCodexRole(md: string): string {
  const m = FM.exec(md.replace(/\r\n/g, '\n'))
  const fm = m ? frontmatter(m[1] as string) : {}
  if (!fm['name']) throw new Error('agent file needs frontmatter with a name')
  const writes = /\b(Edit|Write)\b/.test(fm['tools'] ?? '')
  return [
    `name = ${JSON.stringify(fm['name'])}`,
    `description = ${JSON.stringify(fm['description'] ?? '')}`,
    `sandbox_mode = "${writes ? 'workspace-write' : 'read-only'}"`,
    `developer_instructions = ${JSON.stringify(((m?.[2] as string) ?? '').trim() + '\n')}`,
    '',
  ].join('\n')
}

/**
 * Generates the per-engine agent dirs from the neutral source: `.claude/agents/*.md` (verbatim)
 * and/or `.codex/agents/*.toml`, only for the listed targets. No source dir ⇒ nothing to do.
 * A file that cannot be converted is skipped and reported, never aborts the run.
 */
export function syncAgents(
  root: string,
  targets: string[],
  source = NEUTRAL_AGENTS_DIR,
): { written: string[]; skipped: string[] } {
  const res = { written: [] as string[], skipped: [] as string[] }
  if (!existsSync(join(root, source))) return res
  const emit = (dir: string, name: string, text: string) => {
    mkdirSync(join(root, dir), { recursive: true })
    writeFileSync(join(root, dir, name), text)
    res.written.push(`${dir}/${name}`)
  }
  for (const f of readdirSync(join(root, source)).filter(f => f.endsWith('.md'))) {
    const md = readFileSync(join(root, source, f), 'utf8')
    try {
      if (targets.includes('claude')) emit('.claude/agents', f, md)
      if (targets.includes('codex'))
        emit('.codex/agents', f.replace(/\.md$/, '.toml'), toCodexRole(md))
    } catch (e) {
      res.skipped.push(`${f}: ${(e as Error).message}`)
    }
  }
  return res
}

/** `pair.config.json` `agents.targets` (default: none generated) decides which agent dirs are produced. */
export function syncAgentsFromConfig(config: object, root: string): ReturnType<typeof syncAgents> {
  const targets = (config as { agents?: { targets?: string[] } }).agents?.targets ?? []
  const res = syncAgents(root, targets)
  res.skipped.forEach(s => console.warn(`agents: skipped ${s}`))
  return res
}
