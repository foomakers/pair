import path from 'path'
import type { FileSystemService } from '@pair/content-ops'
import type { ScaffoldKbCommandConfig } from './parser'
import { resolveKbIdentity } from './identity'
import { buildScaffoldPlan } from './scaffold-plan'
import { applyScaffoldPlan, type ConfirmOverwrite } from './apply-plan'
import { createConfirmOverwrite } from './confirm-overwrite'
import { formatScaffoldReport } from './report-formatter'

export interface ScaffoldKbHandlerOptions {
  /** Injected in tests; production uses the interactive/TTY-aware confirmation */
  confirmOverwrite?: ConfirmOverwrite
}

/**
 * Handles the scaffold-kb command execution.
 *
 * Produces a pure external KB repository (knowledge + skills + config + README +
 * .gitignore + release script) that installs like the official KB. Publishing is
 * NOT done here — it lives entirely in the generated release script, so the CLI
 * stays code-host agnostic.
 */
export async function handleScaffoldKbCommand(
  config: ScaffoldKbCommandConfig,
  fs: FileSystemService,
  options: ScaffoldKbHandlerOptions = {},
): Promise<void> {
  const root = path.isAbsolute(config.path)
    ? config.path
    : path.join(fs.currentWorkingDirectory(), config.path)

  const identity = resolveKbIdentity({ name: config.name, targetPath: root })
  const plan = buildScaffoldPlan({ root, identity, host: config.host })

  const result = await applyScaffoldPlan(plan, fs, {
    force: config.force,
    confirmOverwrite: options.confirmOverwrite ?? createConfirmOverwrite(),
  })

  console.log(formatScaffoldReport(result, { identity, host: config.host }))
}
