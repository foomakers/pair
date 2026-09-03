/**
 * llms-txt-regenerate — the command `llms-txt-drift-check` names in every failure
 * (story #416, `pnpm llms-index:regen`).
 *
 * WHY IT EXISTS. A gate whose remedy cannot be typed is a gate that teaches
 * contributors to hand-edit the artifact — which is how `.pair/llms.txt` went stale in
 * the first place. The remedy used to read "regenerate with `pair update`", and this
 * repo has no `pair` executable: not on `PATH`, not in any workspace
 * `node_modules/.bin` (`apps/pair-cli` publishes its bin as `pair-cli`), and no root
 * script by that name. Resolving it to the nearest real binary is worse than the
 * `command not found`: `pair-cli update` with no `--source` installs the PUBLISHED
 * knowledge base over `.pair/knowledge/**`, reverting the very guideline whose
 * addition reddened the gate.
 *
 * WHAT IT IS. The exact INVERSE of the check, and deliberately nothing more: the same
 * `generateLlmsTxt` over the same tree, written to the same `TRACKED_INDEX_PATH` the
 * check reads. One file is written — `.pair/llms.txt` — so the advice a contributor
 * obeys under time pressure cannot cost them anything else. It is NOT a mirror
 * realignment: `pair-cli update --source <dataset>` rewrites `.pair/knowledge/**`,
 * `.claude/**` and `AGENTS.md`, and DELETES target-only files under a `mirror`
 * registry (an untracked `.pair/knowledge/wip-draft.md` does not survive it) — a
 * blast radius nobody should accept for a stale index. Story #419 owns that command
 * (`pnpm mirrors:regenerate`) for the mirror guards' own remedy; the two are
 * complementary, not alternatives — see the ADL cited below.
 *
 * WHAT IT REFUSES, and why refusing is the feature. The check's message carries
 * preconditions ("once the checkout is normalized to LF", "once the tree is
 * complete") because on those states regenerating is the wrong move — it either
 * cannot work (git rewrites the terminators straight back) or destroys what the
 * caution exists to protect (a sparse checkout's missing section, committed as a
 * deletion). A remedy command that ignored the preconditions its own gate prints
 * would deliver that damage to anyone who scrolled to the last paragraph. So the
 * regeneration runs the CHECK first and writes only when the check's verdict is
 * "stale index, complete tree": every other outcome is reported with the gate's own
 * message and a non-zero exit.
 *
 * ADR-014 shape, shared with the siblings in this folder: exported, unit-tested
 * functions (`llms-txt-regenerate.test.ts`, fixture trees only) plus a `main()` behind
 * a `require.main` guard as the thin CLI, run as
 * `ts-node -T src/quality-gates/llms-txt-regenerate.ts` (package script
 * `llms-index:regen`, delegated from the repo-root script of the same name).
 * `-T` for the same reason the check uses it: it compiles a source file from
 * `apps/pair-cli`, and a remedy that dies with `TS2307` on a fresh `pnpm install` is
 * no remedy. Exit 0 = written or already in sync, exit 1 = refused.
 *
 * THIS SCRIPT WRITES, so it is on `pre-push-gate-composition`'s offender list — the
 * gate must stay check-only (ADL `2026-07-31-pre-push-gate-is-check-only.md`), and
 * adding a write script to this repo means adding it to that list.
 *
 * Decision: `.pair/adoption/decision-log/2026-09-03-a-gate-names-a-remedy-it-can-run.md`.
 */
import { mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

import {
  type LlmsSourceFs,
  generateLlmsTxt,
} from '../../../../apps/pair-cli/src/registry/llms-generation'
import {
  TRACKED_INDEX_PATH,
  checkLlmsIndexDrift,
  formatUnreadableTree,
  readOnlyFileSystem,
} from './llms-txt-drift-check'
import { REPO_ROOT } from './repo-root'

/**
 * The write half, as its own two-method capability. The check is handed
 * `LlmsSourceFs` so that "this gate cannot write" is a type fact; the mirror of that
 * decision is that the writer's extra power is declared here and nowhere else.
 */
export interface LlmsIndexSink {
  mkdir: (path: string) => Promise<void>
  writeFile: (file: string, content: string) => Promise<void>
}

export const fileSystemSink: LlmsIndexSink = {
  mkdir: async path => {
    await mkdir(path, { recursive: true })
  },
  writeFile: (file, content) => writeFile(file, content, 'utf-8'),
}

/**
 * Three outcomes, and only the first one writes.
 *
 * `already-in-sync` is not folded into `written`: re-writing identical bytes would
 * still bump the mtime, and this command is run by a contributor whose build is
 * watching the file. It is also the honest answer when the drift the contributor saw
 * came from somewhere else.
 */
export type RegenerationOutcome =
  | { kind: 'written'; path: string }
  | { kind: 'already-in-sync'; path: string }
  | { kind: 'refused'; path: string; message: string }

/**
 * Run the check, then write only on the one verdict where writing is the fix.
 *
 * The refusal branches all reuse the CHECK's message verbatim — the contributor gets
 * the same diagnosis and the same recipe (`rm` + `git checkout --`, "restore the tree
 * first") whether they discovered the problem through `llms-index:check` or by typing
 * the remedy it printed. Two wordings for one state is how the second one goes stale.
 */
export async function regenerateLlmsIndex(
  baseTarget: string = REPO_ROOT,
  fs: LlmsSourceFs = readOnlyFileSystem,
  sink: LlmsIndexSink = fileSystemSink,
): Promise<RegenerationOutcome> {
  const outputPath = join(baseTarget, TRACKED_INDEX_PATH)

  let check
  try {
    check = await checkLlmsIndexDrift(baseTarget, fs)
  } catch (error) {
    // The KB tree itself is unreadable (a `chmod 000` directory under it). Writing an
    // index from a tree that could not be walked is the one thing worse than failing.
    return { kind: 'refused', path: outputPath, message: formatUnreadableTree(error, baseTarget) }
  }

  if (check.report.kind === 'in-sync') return { kind: 'already-in-sync', path: outputPath }

  const blocked =
    check.report.kind !== 'drift' ||
    check.report.trackedCarriesCr ||
    check.report.emptiedSections.length > 0
  if (blocked) return { kind: 'refused', path: outputPath, message: check.message }

  const content = await generateLlmsTxt(fs, baseTarget)
  // Owns its own directory for the same reason `writeProjectLlmsTxt` does: `.pair/`
  // is not guaranteed to exist on a tree that has adoption content and no index.
  await sink.mkdir(dirname(outputPath))
  await sink.writeFile(outputPath, content)
  return { kind: 'written', path: outputPath }
}

/** Thin CLI wrapper: print what happened and set the exit code. */
export async function main(baseTarget: string = REPO_ROOT): Promise<void> {
  const outcome = await regenerateLlmsIndex(baseTarget)

  if (outcome.kind === 'refused') {
    console.error(`\n${outcome.message}\n`)
    console.error(`Nothing was written to ${outcome.path}.\n`)
    process.exitCode = 1
    return
  }

  console.log(
    outcome.kind === 'written'
      ? `✓ llms-index: regenerated ${TRACKED_INDEX_PATH} — commit the result.`
      : `✓ llms-index: ${TRACKED_INDEX_PATH} already matches the generator; nothing written.`,
  )
}

if (require.main === module) {
  void main()
}
