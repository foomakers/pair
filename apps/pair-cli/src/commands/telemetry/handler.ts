import type { FileSystemService } from '@pair/content-ops'
import { finalizeManualCard, recordManualStep } from '../run/telemetry-manual'
import { telemetryEnabled } from '../run/telemetry-policy'
import type { TelemetryCommandConfig as C } from './parser'

/** Same switch as the driver. Never fails the step: a write problem is a warning, exit 0. */
export async function handleTelemetryCommand(c: C, _fs: FileSystemService): Promise<number> {
  const enabled = telemetryEnabled(c.root)
  const ok =
    c.mode === 'step'
      ? recordManualStep({
          root: c.root,
          enabled,
          card: c.card,
          step: c.step!,
          engine: c.engine!,
          start: c.start!,
          end: c.end!,
          ...(c.pr !== undefined && { pr: c.pr }),
          ...(c.phase !== undefined && { phase: c.phase }),
          ...(c.model !== undefined && { model: c.model }),
          ...(c.effort !== undefined && { effort: c.effort }),
          ...(c.tokens !== undefined && { tokens: c.tokens }),
          ...(c.session !== undefined && { sessionId: c.session }),
          ...(c.outcome !== undefined && { outcome: c.outcome }),
        })
      : finalizeManualCard({
          root: c.root,
          enabled,
          card: c.card,
          outcome: c.outcome!,
          end: c.end!,
          ...(c.pr !== undefined && { pr: c.pr }),
        })
  if (!ok) console.error('warning: telemetry not written (file unwritable)')
  return 0
}
