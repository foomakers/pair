import type { FileSystemService, SkillNameMap } from '@pair/content-ops'
import {
  rewriteSkillReferences,
  findSkillReferences,
  walkMarkdownFiles,
  readSkillNameManifest,
  writeSkillNameManifest,
  buildTransitionMap,
  findOrphanedInstalledNames,
  mergeSkillNameMaps,
} from '@pair/content-ops'
import type { LogEntry } from '#diagnostics'
import type { RegistryConfig } from './resolver'
import { getNonSymlinkTargets } from './layout'

/**
 * Path of the CLI-internal manifest that records the skill name map from
 * the last install/update run. Deliberately outside every registry's
 * target scope (`.pair/knowledge`, `.pair/adoption`, `.skills` targets)
 * so it is never touched by mirror cleanup or content diffing.
 */
export function resolveSkillNameManifestPath(fs: FileSystemService, baseTarget: string): string {
  return baseTarget
    ? fs.resolve(baseTarget, '.pair', '.skill-name-map.json')
    : fs.resolve('.pair', '.skill-name-map.json')
}

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

/**
 * Warns when a skill invocation still references an installed name that no
 * longer has a matching entry in the registry (the skill was removed or
 * disabled between runs). Such references are intentionally left as-is —
 * there is no correct new name to rewrite them to — so this only reports,
 * it never modifies content.
 */
export async function detectOrphanedSkillReferences(
  context: SkillRefContext,
  registries: Record<string, RegistryConfig>,
  orphanedInstalledNames: string[],
): Promise<void> {
  if (orphanedInstalledNames.length === 0) return

  const { fs, baseTarget, pushLog } = context

  for (const [, config] of Object.entries(registries)) {
    for (const targetCfg of getNonSymlinkTargets(config)) {
      const target = baseTarget
        ? fs.resolve(baseTarget, targetCfg.path)
        : fs.resolve(targetCfg.path)
      if (!(await fs.exists(target))) continue

      const stat = await fs.stat(target)
      const files: string[] = stat.isDirectory()
        ? await walkMarkdownFiles(target, fs)
        : target.endsWith('.md')
          ? [target]
          : []

      for (const filePath of files) {
        const content = await fs.readFile(filePath)
        const found = findSkillReferences(content, orphanedInstalledNames)
        for (const name of found) {
          pushLog(
            'warn',
            `Skill reference rewriter: /${name} invoked in ${filePath} is no longer in the skill registry (removed or disabled) — left as-is`,
          )
        }
      }
    }
  }
}

/**
 * Reconciles this run's skill name map against the previously recorded one
 * (see `resolveSkillNameManifestPath`), then rewrites references and warns
 * about orphaned ones, and finally records the new mapping for next time.
 *
 * This is what makes cross-reference rewriting idempotent across a prefix
 * (or flatten) change: an already-installed reference like `/pair-next`
 * that lives in a file never re-derived from source (e.g. an `add`-behavior
 * adoption doc) still gets rewritten to `/foo-next`, because the previous
 * install/update's mapping — not a guess from the current config — tells us
 * `pair-next` used to mean `next`.
 *
 * No-op (including no manifest write) when this run produced no renames —
 * e.g. flatten/prefix disabled — so a stale manifest from an earlier,
 * different configuration is left untouched rather than misinterpreted.
 */
export async function reconcileSkillNameRegistry(
  context: SkillRefContext,
  registries: Record<string, RegistryConfig>,
  skillNameMap: SkillNameMap,
): Promise<void> {
  // Covers both "no manifest yet" and "flatten/prefix disabled for every
  // registry this run" (accumulated map empty either way — see
  // `hasNamingTransforms` in copyPathOps.ts, which skips building a
  // skillNameMap entirely when no transform is active). Intentionally a
  // full no-op in both cases: with an empty current map we cannot tell
  // "skill removed from the registry" apart from "skill still installed,
  // just no longer prefixed" (the latter never produces a map entry), so
  // even attempting orphan detection from the stale manifest alone would
  // misreport still-installed skills as removed. See
  // skill-refs.test.ts > reconcileSkillNameRegistry for the locked-in case.
  if (skillNameMap.size === 0) return

  const { fs, baseTarget } = context
  const manifestPath = resolveSkillNameManifestPath(fs, baseTarget)

  const previousMap = await readSkillNameManifest(fs, manifestPath)
  const transitionMap = buildTransitionMap(previousMap, skillNameMap)
  const orphanedNames = findOrphanedInstalledNames(previousMap, skillNameMap)

  const combinedMap = mergeSkillNameMaps(skillNameMap, transitionMap)
  await applySkillRefsToNonSkillRegistries(context, registries, combinedMap)
  await detectOrphanedSkillReferences(context, registries, orphanedNames)

  // Not atomic with the two passes above: if either throws partway through, the
  // manifest is left un-updated for a run that partially applied its rewrites.
  // Low impact by design — rewriting is idempotent, so the next successful run
  // re-diffs against the still-valid (if stale) previous map and self-corrects.
  await writeSkillNameManifest(fs, manifestPath, skillNameMap)
}
