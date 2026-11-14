import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'

export type Tokens =
  | {
      readonly freshIn: number
      readonly cachedIn: number
      readonly out: number
      readonly reasoning: number | 'not measured'
    }
  | 'not measured'

export interface EngineObservation {
  readonly sessionId?: string
  readonly tokens?: Tokens
}

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

const count = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined

/** Read only fields present in the engine event; never infer missing usage. */
export function observeEngineEvent(
  prior: EngineObservation,
  engine: string,
  payload: unknown,
): EngineObservation {
  const event = object(payload)
  if (event === undefined) return prior
  const session =
    engine === 'codex'
      ? event['thread_id']
      : engine === 'pi'
        ? event['sessionId']
        : event['session_id']
  const sessionId = typeof session === 'string' ? session : prior.sessionId
  const usage = object(event['usage'])
  let tokens = prior.tokens ?? 'not measured'
  if (usage !== undefined && engine === 'codex') {
    const input = count(usage['input_tokens'])
    const cached = count(usage['cached_input_tokens'])
    const out = count(usage['output_tokens'])
    if (input !== undefined && cached !== undefined && cached <= input && out !== undefined)
      tokens = {
        freshIn: input - cached,
        cachedIn: cached,
        out,
        reasoning: count(usage['reasoning_output_tokens']) ?? 'not measured',
      }
  }
  if (usage !== undefined && engine === 'claude') {
    const fresh = count(usage['input_tokens'])
    const cached = count(usage['cache_read_input_tokens'])
    const out = count(usage['output_tokens'])
    if (fresh !== undefined && cached !== undefined && out !== undefined)
      tokens = { freshIn: fresh, cachedIn: cached, out, reasoning: 'not measured' }
  }
  if (engine === 'pi' && event['type'] === 'message_end') {
    const message = object(event['message'])
    const piUsage = message?.['role'] === 'assistant' ? object(message['usage']) : undefined
    const fresh = count(piUsage?.['input'])
    const cached = count(piUsage?.['cacheRead'])
    const out = count(piUsage?.['output'])
    if (fresh !== undefined && cached !== undefined && out !== undefined) {
      const previous = typeof tokens === 'string' ? undefined : tokens
      tokens = {
        freshIn: (previous?.freshIn ?? 0) + fresh,
        cachedIn: (previous?.cachedIn ?? 0) + cached,
        out: (previous?.out ?? 0) + out,
        reasoning: 'not measured',
      }
    }
  }
  return { ...(sessionId !== undefined && { sessionId }), tokens }
}

export interface TelemetryRecord {
  readonly id: string
  readonly kind: 'stage' | 'card'
  readonly [key: string]: unknown
}

export interface StageTelemetryInput {
  readonly id: string
  readonly card: string
  readonly step: string
  readonly phase?: string
  readonly start: number
  readonly end: number
  readonly previousEnd: number
  readonly engine: string
  readonly model?: string
  readonly processOutcome: 'success' | 'failed'
  readonly finalStatus?: string
  readonly retries: number
  readonly observation: EngineObservation
}

export function stageTelemetryRecord(input: StageTelemetryInput): TelemetryRecord {
  const outcomeClass =
    input.finalStatus === 'rejected' ||
    input.finalStatus === 'refused' ||
    input.finalStatus === 'parked'
      ? input.finalStatus
      : input.processOutcome === 'success' && !input.finalStatus?.startsWith('failed')
        ? 'ok'
        : 'failed'
  return {
    kind: 'stage',
    id: input.id,
    card: input.card,
    step: input.step,
    ...(input.phase !== undefined && { phase: input.phase }),
    start: input.start,
    end: input.end,
    durationMs: input.end - input.start,
    driverOverheadMs: input.start - input.previousEnd,
    engine: input.engine,
    model: input.model ?? 'not measured',
    sessionId: input.observation.sessionId ?? 'not measured',
    tokens: input.observation.tokens ?? 'not measured',
    outcomeClass,
    retries: input.retries,
  }
}

/** The run directory is local and ignored; a repeated terminal write is a no-op by record id. */
export function appendTelemetry(root: string, record: TelemetryRecord): void {
  const dir = join(root, '.pair', 'working', 'telemetry')
  const path = join(dir, 'records.jsonl')
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line) continue
      const existing = JSON.parse(line) as TelemetryRecord
      if (existing.id === record.id) return
    }
  }
  mkdirSync(dir, { recursive: true })
  appendFileSync(path, `${JSON.stringify(record)}\n`)
}
