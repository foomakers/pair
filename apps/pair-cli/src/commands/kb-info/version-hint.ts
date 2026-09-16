import type { FileSystemService } from '@pair/content-ops'
import type { CliPresenter } from '#ui'
import {
  readVersionFromDirectory,
  resolveInstalledVersion,
  writeInstalledVersion,
} from './version-resolver'
import { buildMigrationUrl } from './migration-url'
import { isUpgrade } from './version-check'

/**
 * Non-blocking pre-install/update hint (AC3): if the KB about to be applied
 * differs from what's currently installed, print a heads-up with the
 * migration-page pointer. Never throws — a resolution failure here must
 * never block install/update (D20: check-only, no migration logic in the CLI).
 */
export async function emitVersionDriftHint(deps: {
  fs: FileSystemService
  datasetRoot: string
  baseTarget: string
  presenter: CliPresenter
}): Promise<void> {
  const { fs, datasetRoot, baseTarget, presenter } = deps
  try {
    const newVersion = readVersionFromDirectory(fs, datasetRoot)
    if (!newVersion) return

    const installed = resolveInstalledVersion(fs, baseTarget)
    if (!installed.version || installed.version === newVersion) return

    // Only an upgrade has a v{old}-to-v{new} migration page; a downgrade or a
    // pre-release drift is flagged without a (non-existent) URL — same guard as
    // compareVersions, so both call sites agree.
    const migrationUrl = isUpgrade(installed.version, newVersion)
      ? buildMigrationUrl(installed.version, newVersion)
      : undefined
    presenter.phase(
      `KB version drift: installed ${installed.version}, applying ${newVersion}.` +
        (migrationUrl ? ` Migration guide: ${migrationUrl}` : ''),
    )
  } catch {
    // best-effort hint only — never block install/update
  }
}

/**
 * Record the just-applied KB version (AC4) so future `pair-cli kb-info` checks
 * have something to compare against instead of "unknown installed version".
 */
export async function recordInstalledVersion(deps: {
  fs: FileSystemService
  datasetRoot: string
  baseTarget: string
}): Promise<void> {
  const { fs, datasetRoot, baseTarget } = deps
  try {
    const newVersion = readVersionFromDirectory(fs, datasetRoot)
    if (!newVersion) return
    await writeInstalledVersion(fs, baseTarget, newVersion)
  } catch {
    // best-effort — never block install/update
  }
}
