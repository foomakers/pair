import type { FileSystemService } from '@pair/content-ops'
import type { LogEntry } from '#diagnostics'
import type { SourceDeclarationOutcome } from '#config'
import { postCopyOps, type RegistryConfig } from '#registry'
import {
  SKIP_NOT_SHIPPED,
  SKIP_UNKNOWN_REGISTRY,
  type CliPresenter,
  type RegistryResult,
} from '#ui'

/**
 * The steps `install` and `update` perform IDENTICALLY on each registry.
 *
 * Both commands own their own loop — install continues past a broken registry, update
 * rolls the whole run back — but the three steps here have no command-specific behaviour,
 * and were byte-identical copies in the two handlers before this module existed. Anything
 * that differs between the commands stays in the handler; this file only holds what must
 * not be allowed to drift.
 */
export interface RegistryRunCtx {
  fs: FileSystemService
  registryName: string
  registryConfig: RegistryConfig
  baseTarget: string
  pushLog: (level: LogEntry['level'], message: string) => void
  presenter: CliPresenter
}

/** Symlinks, transforms and the rest of the post-copy work for one registry. */
export async function finalizeRegistryCopy(
  ctx: Pick<RegistryRunCtx, 'fs' | 'registryConfig' | 'baseTarget'>,
  paths: { effectiveTarget: string; datasetPath: string },
): Promise<void> {
  const { fs, registryConfig, baseTarget } = ctx
  await postCopyOps({ fs, registryConfig, baseTarget, ...paths })
}

/**
 * Absent is not failed: the source simply does not contain this registry, and there is
 * nothing to copy. Only a registry that IS shipped and breaks is a failure (US-396 AC1).
 */
export function reportNotShipped(
  ctx: Pick<RegistryRunCtx, 'registryName' | 'pushLog' | 'presenter'>,
  paths: { effectiveTarget: string; datasetPath: string },
): RegistryResult {
  const { registryName, pushLog, presenter } = ctx
  pushLog('debug', `Registry '${registryName}' has no source at ${paths.datasetPath}`)
  presenter.registrySkipped(registryName, SKIP_NOT_SHIPPED)
  return {
    name: registryName,
    target: paths.effectiveTarget,
    status: 'skipped',
    reason: SKIP_NOT_SHIPPED,
  }
}

/**
 * Registries the source declared that this CLI has no definition for: named as skipped
 * with their own reason, never silently dropped (US-396 edge case: newer KB, older CLI).
 *
 * `target` is empty by construction — the registry was never resolved to one, and naming
 * the project root here would tell a reader the install was aimed at it.
 */
export function declaredButUnknownResults(
  declaration: SourceDeclarationOutcome | undefined,
): RegistryResult[] {
  if (!declaration) return []
  return declaration.unknownRegistries.map(name => ({
    name,
    target: '',
    status: 'skipped' as const,
    reason: SKIP_UNKNOWN_REGISTRY,
  }))
}

/**
 * What a source KB's declaration has to tell the user, in both commands: a declaration
 * that could not be used, and — when one WAS used — the resolution chain that names it.
 * The chain is the only place a KB maintainer can see their declaration was honoured
 * without reverse-engineering the installed directory names (US-396).
 */
export function reportSourceDeclaration(ctx: {
  declaration: SourceDeclarationOutcome | undefined
  resolution: string
  presenter: CliPresenter
}): void {
  const { declaration, resolution, presenter } = ctx
  if (declaration?.warning) presenter.warning(declaration.warning)
  if (declaration?.applied) presenter.phase(`Configuration: ${resolution}`)
}

/** Prints what `declaredButUnknownResults` built — computing results prints nothing. */
export function reportDeclaredButUnknown(
  results: RegistryResult[],
  presenter: CliPresenter,
): RegistryResult[] {
  for (const result of results) {
    presenter.registrySkipped(result.name, result.reason ?? SKIP_UNKNOWN_REGISTRY)
  }
  return results
}
