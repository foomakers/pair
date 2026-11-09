import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, relative } from 'path'

const FM = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/

/** Claude agent markdown -> codex role TOML (`.codex/agents`). */
export function toCodexRole(md: string): string {
  const m = FM.exec(md)
  if (!m) throw new Error('agent file has no frontmatter')
  const fm = Object.fromEntries(
    (m[1] ?? '')
      .split('\n')
      .map(l => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]),
  ) as Record<string, string>
  const writes = /\b(Edit|Write)\b/.test(fm['tools'] ?? '')
  return [
    `name = ${JSON.stringify(fm['name'])}`,
    `description = ${JSON.stringify(fm['description'] ?? '')}`,
    `sandbox_mode = "${writes ? 'workspace-write' : 'read-only'}"`,
    `developer_instructions = ${JSON.stringify((m[2] ?? '').trim() + '\n')}`,
    '',
  ].join('\n')
}

/** Generates `.codex/agents/*.toml` from the installed agents when `targets` lists codex. */
export function syncCodexAgents(root: string, agentsDir: string, targets: string[]): string[] {
  if (!targets.includes('codex') || !existsSync(join(root, agentsDir))) return []
  const out = join(root, '.codex/agents')
  mkdirSync(out, { recursive: true })
  return readdirSync(join(root, agentsDir))
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const name = f.replace(/\.md$/, '.toml')
      writeFileSync(join(out, name), toCodexRole(readFileSync(join(root, agentsDir, f), 'utf8')))
      return name
    })
}

/** `pair.config.json` `agents.targets` (default claude only) decides which agent dirs are generated. */
export function syncAgentsFromConfig(config: object, root: string, agentsDir: string): string[] {
  const targets = (config as { agents?: { targets?: string[] } }).agents?.targets ?? ['claude']
  return syncCodexAgents(root, relative(root, agentsDir), targets)
}
