import { basename, dirname, join } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import { isStageOwnerAlive } from '../kb-manager/cache-manager'

/**
 * Atomic writes into a project's registry targets (US-134).
 *
 * Same mechanism as the KB cache slot (`cache-manager.writeSlotAtomically`, #423): build the
 * result in a SIBLING of the target (same filesystem, so `rename` cannot hit EXDEV), then make
 * it visible with renames only. Two differences from the cache, both forced by the target
 * being the user's live tree:
 *
 * - the stage is SEEDED from the live target, so the unchanged copy/cleanup pipeline (with its
 *   ownership rules) runs against the stage and decides what is written and deleted;
 * - the swap is rename-target-aside -> rename-stage-in -> delete-aside. Deleting first would
 *   leave neither tree when the delete fails (EBUSY/EPERM).
 *
 * No lock: a second run is never blocked; the later swap wins wholesale (last-writer-wins).
 * Windows: `rename` over an existing directory is not atomic on Win32; the guarantees above
 * are POSIX guarantees.
 */

const STAGE_INFIX = '.tmp-'
const ASIDE_INFIX = '.bak.tmp-'
let counter = 0

function uniqueSuffix(): string {
  return `${process.pid}-${(counter++).toString(36)}`
}

/** `<target>.tmp-<pid>-<n>` — the pid is what the orphan sweep interrogates. */
export function stagePathFor(target: string): string {
  return `${target}${STAGE_INFIX}${uniqueSuffix()}`
}

function asidePathFor(target: string): string {
  return `${target}${ASIDE_INFIX}${uniqueSuffix()}`
}

async function discard(path: string, fs: FileSystemService): Promise<void> {
  await fs.rm(path, { recursive: true, force: true })
}

/**
 * Crash recovery for one target, run before every write. Only DEAD processes' leftovers are
 * touched: a live pid's stage or aside is a concurrent run in flight.
 *
 * - orphan stage -> removed
 * - orphan aside, target absent (a swap died between its two renames) -> restored
 * - orphan aside, target present -> removed (the swap completed; only the delete was lost)
 */
export async function recoverTarget(target: string, fs: FileSystemService): Promise<void> {
  const parent = dirname(target)
  if (!fs.existsSync(parent)) return
  const name = basename(target)
  const stagePrefix = `${name}${STAGE_INFIX}`
  const asidePrefix = `${name}${ASIDE_INFIX}`
  for (const entry of await fs.readdir(parent)) {
    const isStage = entry.name.startsWith(stagePrefix)
    const isAside = entry.name.startsWith(asidePrefix)
    if ((!isStage && !isAside) || isStageOwnerAlive(entry.name)) continue
    const path = join(parent, entry.name)
    if (isAside && !fs.existsSync(target)) {
      await fs.rename(path, target)
    } else {
      await discard(path, fs)
    }
  }
}

/** Recursive copy preserving symlinks as symlinks (the `.github/skills` link must stay a link). */
async function copyTree(fs: FileSystemService, from: string, to: string): Promise<void> {
  await fs.mkdir(to, { recursive: true })
  for (const entry of await fs.readdir(from)) {
    const src = join(from, entry.name)
    const dst = join(to, entry.name)
    if (entry.isSymbolicLink()) {
      await fs.symlink(await fs.readlink(src), dst)
    } else if (entry.isDirectory()) {
      await copyTree(fs, src, dst)
    } else {
      await fs.copy(src, dst)
    }
  }
}

/**
 * Replaces `target` with the stage in three renames. When the stage cannot be moved in, the
 * aside is put back, so the observable tree is never "neither".
 */
async function swap(stage: string, target: string, fs: FileSystemService): Promise<void> {
  const aside = asidePathFor(target)
  let asideTaken = false
  try {
    if (fs.existsSync(target)) {
      await fs.rename(target, aside)
      asideTaken = true
    }
  } catch {
    // Another run swapped the target away between the check and the rename: nothing to set aside.
  }
  try {
    await fs.rename(stage, target)
  } catch (first) {
    // Lost a race: a concurrent run landed `target` meanwhile (ENOTEMPTY/EEXIST/EPERM by
    // platform). Last writer wins: set ITS tree aside and put ours in, once.
    try {
      const raced = asidePathFor(target)
      await fs.rename(target, raced)
      await fs.rename(stage, target)
      await discard(raced, fs)
    } catch {
      if (asideTaken && !fs.existsSync(target)) await fs.rename(aside, target)
      throw first
    }
  }
  if (asideTaken) await discard(aside, fs).catch(() => undefined)
}

/**
 * Runs `populate` against a stage seeded from `target`, then swaps the stage in. A failing
 * `populate` removes the stage and rethrows: the live tree was never touched. The stage is
 * created before anything else, so an unwritable parent fails before any change.
 */
export async function writeDirAtomically(
  target: string,
  fs: FileSystemService,
  populate: (stagePath: string) => Promise<void>,
): Promise<void> {
  await recoverTarget(target, fs)
  const stage = stagePathFor(target)
  await fs.mkdir(stage, { recursive: true })
  try {
    if (fs.existsSync(target)) await copyTree(fs, target, stage)
    await populate(stage)
    await swap(stage, target, fs)
  } catch (err) {
    await discard(stage, fs).catch(() => undefined)
    throw err
  }
}

/** File-valued targets: write a sibling, then rename it onto the final path. */
export async function writeFileAtomically(
  target: string,
  fs: FileSystemService,
  produce: (tmpPath: string) => Promise<void>,
): Promise<void> {
  await recoverTarget(target, fs)
  const tmp = stagePathFor(target)
  try {
    await produce(tmp)
    await fs.rename(tmp, target)
  } catch (err) {
    await discard(tmp, fs).catch(() => undefined)
    throw err
  }
}
