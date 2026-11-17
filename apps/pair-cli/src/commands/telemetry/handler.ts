import type { FileSystemService } from '@pair/content-ops'
import { finalizeManualCard, recordManualStep } from '../run/telemetry-manual'
import { telemetryEnabled } from '../run/telemetry-policy'
import type { TelemetryCommandConfig } from './parser'

/** Same switch as the driver. Never fails the step: a write problem is a warning, exit 0. */
export async function handleTelemetryCommand(
  config: TelemetryCommandConfig,
  _fs: FileSystemService,
): Promise<number> {
  const { command: _command, mode, ...input } = config
  const ok = (mode === 'step' ? recordManualStep : finalizeManualCard)({
    ...input,
    enabled: telemetryEnabled(config.root),
  } as never)
  if (!ok) console.error('warning: telemetry not written (file unwritable)')
  return 0
}
