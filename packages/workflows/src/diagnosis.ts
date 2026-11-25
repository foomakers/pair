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
  readonly attempt: number
  readonly round?: number
}

export interface StepFaults {
  readonly step: string
  readonly attempts: readonly FaultAttempt[]
}
