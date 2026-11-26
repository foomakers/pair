import { hostGateRunners } from '@pair/workflows/cli'
import { runHostProcess } from './host-process'

export const { GATE_TIMEOUT_MS, gateRunner, performHostKind, runStepGates } =
  hostGateRunners(runHostProcess)
