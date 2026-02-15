import type { FileSystemService, SkillNameMap } from '@pair/content-ops'
import { rewriteSkillReferences, walkMarkdownFiles } from '@pair/content-ops'
import type { LogEntry } from '#diagnostics'
import type { RegistryConfig } from './resolver'
import { getNonSymlinkTargets } from './layout'

/** Minimal context for skill reference rewrite operations. */
export type SkillRefContext = {
  fs: FileSystemService
  baseTarget: string
  pushLog: (level: LogEntry['level'], message: string) => void
}

/**
 * Rewrites skill references in all markdown files under a target path.
 * If target is a file, rewrites that single file. If a directory, walks all .md files.
 * No-op when target doesn't exist or is a non-markdown file.
 */
export async function rewriteSkillRefsInTarget(
  fs: FileSystemService,
  target: string,
  skillNameMap: SkillNameMap,
  pushLog: (level: LogEntry['level'], message: string) => void,
): Promise<void> {
  if (!(await fs.exists(target))) return

  const stat = await fs.stat(target)
  const files: string[] = stat.isDirectory()
    ? await walkMarkdownFiles(target, fs)
    : target.endsWith('.md')
      ? [target]
      : []

  for (const filePath of files) {
    const content = await fs.readFile(filePath)
    const rewritten = rewriteSkillReferences(content, skillNameMap)
    if (rewritten !== content) {
      await fs.writeFile(filePath, rewritten)
      pushLog('info', `Skill reference rewriter: updated ${filePath}`)
    }
  }
}

/**
 * Applies skill reference rewrites to non-skills registries (e.g., AGENTS.md).
 * Skips registries that use flatten/prefix (skills registries themselves).
 * Skips symlink targets.
 */
export async function applySkillRefsToNonSkillRegistries(
  context: SkillRefContext,
  registries: Record<string, RegistryConfig>,
  skillNameMap: SkillNameMap,
): Promise<void> {
  const { fs, baseTarget, pushLog } = context

  for (const [, config] of Object.entries(registries)) {
    if (config.flatten || config.prefix) continue // skip skills registries themselves

    for (const targetCfg of getNonSymlinkTargets(config)) {
      const target = baseTarget
        ? fs.resolve(baseTarget, targetCfg.path)
        : fs.resolve(targetCfg.path)
      await rewriteSkillRefsInTarget(fs, target, skillNameMap, pushLog)
    }
  }
}
