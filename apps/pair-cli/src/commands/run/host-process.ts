import { runHostProcess as run, type HostProcess } from '@pair/workflows/cli'
import { relayHostRetries } from './host-retry-audit'
import { trackEngine } from './interrupt'

export type { HostProcessResult } from '@pair/workflows/cli'

export const runHostProcess: HostProcess = (bin, args, cwd, options) =>
  run(bin, args, cwd, { ...options, track: trackEngine, onStderr: relayHostRetries })
