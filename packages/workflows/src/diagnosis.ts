import type { RunHost } from './engine'

export interface ProcessDiagnostics {
  readonly exitCode: number | null
  readonly signal: string | null
  readonly elapsedMs: number
  readonly stderrTail: readonly string[]
}

export interface Diagnosis extends ProcessDiagnostics {
  readonly kind: 'timeout' | 'idle' | 'crash' | 'no-result' | 'invalid-result'
  readonly detail: string
  /** Configured limit of the watchdog that stopped this attempt. */
  readonly timeoutSeconds?: number
}

export interface FaultAttempt extends Diagnosis {
  readonly origin?:
    | {
        readonly host: RunHost
        readonly engine?: string | undefined
        readonly model?: string | undefined
        readonly effort?: string | undefined
      }
    | undefined
  readonly attempt: number
  readonly round?: number
}

export interface StepFaults {
  readonly step: string
  readonly attempts: readonly FaultAttempt[]
}

export const ENGINE_CREDITS_EXHAUSTED = 'engine-credits-exhausted'

export function isCreditExhausted(fault: Diagnosis): boolean {
  return (
    fault.kind === 'crash' &&
    /^terminal event: Your workspace is out of credits\. Add credits to continue\./i.test(
      fault.detail,
    )
  )
}
