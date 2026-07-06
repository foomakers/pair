import type { FileSystemService } from '@pair/content-ops'
import type { CliPresenter } from '#ui'
import {
  readVersionFromDirectory,
  resolveInstalledVersion,
  writeInstalledVersion,
} from './version-resolver'
import { buildMigrationUrl } from './migration-url'

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

    const migrationUrl = buildMigrationUrl(installed.version, newVersion)
    presenter.phase(
      `KB version drift: installed ${installed.version}, applying ${newVersion}. Migration guide: ${migrationUrl}`,
    )
  } catch {
    // best-effort hint only — never block install/update
  }
}

/**
 * Record the just-applied KB version (AC4) so future `pair kb-info` checks
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
