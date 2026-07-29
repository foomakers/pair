import path from 'path'
import type { FileSystemService } from '@pair/content-ops'
import type { ScaffoldFile, ScaffoldPlan } from './scaffold-plan'

/** Asks whether a modified scaffold-owned file may be regenerated. */
export type ConfirmOverwrite = (relativePath: string) => Promise<boolean>

export type FileAction = 'created' | 'overwritten' | 'unchanged' | 'skipped'

export interface FileOutcome {
  path: string
  action: FileAction
  reason?: string
}

export interface ApplyResult {
  root: string
  directories: string[]
  outcomes: FileOutcome[]
}

export interface ApplyOptions {
  /** Regenerate modified scaffold-owned files without asking */
  force: boolean
  confirmOverwrite: ConfirmOverwrite
}

const SEED_REASON = 'existing KB content'
const DECLINED_REASON = 'overwrite declined'

async function resolveOutcome(
  file: ScaffoldFile,
  absolutePath: string,
  fs: FileSystemService,
  options: ApplyOptions,
): Promise<FileOutcome> {
  if (!fs.existsSync(absolutePath)) return { path: file.path, action: 'created' }

  if ((await fs.readFile(absolutePath)) === file.content) {
    return { path: file.path, action: 'unchanged' }
  }

  if (file.kind === 'seed') {
    return { path: file.path, action: 'skipped', reason: SEED_REASON }
  }

  if (options.force || (await options.confirmOverwrite(file.path))) {
    return { path: file.path, action: 'overwritten' }
  }

  return { path: file.path, action: 'skipped', reason: DECLINED_REASON }
}

/** 0o755: the generated release script carries a shebang, so it must be runnable directly. */
const EXECUTABLE_MODE = 0o755

async function applyFile(
  file: ScaffoldFile,
  plan: ScaffoldPlan,
  fs: FileSystemService,
  options: ApplyOptions,
): Promise<FileOutcome> {
  const absolutePath = path.join(plan.root, file.path)
  const outcome = await resolveOutcome(file, absolutePath, fs, options)

  if (outcome.action === 'created' || outcome.action === 'overwritten') {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, file.content)
  }

  // Also repairs the mode on an unchanged/kept file scaffolded before this was set
  if (file.executable && fs.existsSync(absolutePath)) {
    await fs.chmod(absolutePath, EXECUTABLE_MODE)
  }

  return outcome
}

/**
 * Write a scaffold plan to disk, idempotently.
 *
 * Regenerable by construction: identical files are left alone (no prompt, no
 * churn), maintainer-authored KB content is never touched, and a modified
 * scaffold-owned file is only regenerated after explicit confirmation (or
 * `--force`) — never silently overwritten.
 */
export async function applyScaffoldPlan(
  plan: ScaffoldPlan,
  fs: FileSystemService,
  options: ApplyOptions,
): Promise<ApplyResult> {
  await fs.mkdir(plan.root, { recursive: true })
  for (const directory of plan.directories) {
    await fs.mkdir(path.join(plan.root, directory), { recursive: true })
  }

  const outcomes: FileOutcome[] = []
  for (const file of plan.files) {
    outcomes.push(await applyFile(file, plan, fs, options))
  }

  return { root: plan.root, directories: plan.directories, outcomes }
}
