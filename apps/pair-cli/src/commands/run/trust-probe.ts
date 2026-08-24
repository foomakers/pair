import { homedir } from 'os'
import { dirname, resolve } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import type { ProjectTrustProbe } from './autonomy'

/**
 * Reads an engine's project-trust store — READ-ONLY, always.
 *
 * The store's shape and lookup rule are pi's own (`dist/core/trust-manager.js`, verified in
 * `@earendil-works/pi-coding-agent@0.84.3`): a flat `{ "<absolute path>": boolean }` map, with
 * the NEAREST ANCESTOR entry winning. Re-implementing the read rather than the write is the
 * whole point — provisioning trust belongs to the engine or to
 * `/pair-capability-setup-harness`, never to an unattended driver (AC6).
 *
 * `undefined` means "no decision recorded", which the caller treats exactly like `false`:
 * fail-safe, so a store this driver cannot parse never reads as trust.
 */
export function createProjectTrustProbe(
  fs: FileSystemService,
  home: string = homedir(),
): ProjectTrustProbe {
  return (store: string, projectPath: string) => {
    const storePath = store.startsWith('~/') ? resolve(home, store.slice(2)) : store
    if (!fs.existsSync(storePath)) return undefined

    let decisions: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(storePath))
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
      decisions = parsed as Record<string, unknown>
    } catch {
      return undefined
    }

    let current = resolve(projectPath)
    for (;;) {
      const decision = decisions[current]
      if (typeof decision === 'boolean') return decision
      const parent = dirname(current)
      if (parent === current) return undefined
      current = parent
    }
  }
}
