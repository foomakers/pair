import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'fs'
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

export interface ManualIntervention {
  readonly kind: string
  readonly who: string
  readonly reason: string
}

/** Read the cycle's own durable intervention trail, without treating card prose as authority. */
export function readInterventions(runDir: string): ManualIntervention[] {
  if (!existsSync(runDir)) return []
  const entries: ManualIntervention[] = []
  const index = join(runDir, 'maintainer-interventions.md')
  if (existsSync(index)) {
    for (const line of readFileSync(index, 'utf8').split('\n')) {
      if (!line.startsWith('| ') || line.includes('| --- |') || line.includes('| file |')) continue
      const cells = line
        .split('|')
        .slice(1, -1)
        .map(cell => cell.trim())
      if (cells.length === 5 && cells[2] && cells[3])
        entries.push({ kind: 'supersede', reason: cells[2], who: cells[3] })
    }
  }
  const seen = new Set<string>()
  for (const name of readdirSync(runDir)
    .filter(name => /review-phase-\d+\.json$/.test(name))
    .sort()) {
    const data = object(JSON.parse(readFileSync(join(runDir, name), 'utf8')))
    if (data?.['recordType'] !== 'decision' || !Array.isArray(data['humanDecisions'])) continue
    for (const raw of data['humanDecisions']) {
      const decision = object(raw)
      if (typeof decision?.['by'] !== 'string' || typeof decision['decision'] !== 'string') continue
      const key = JSON.stringify(decision)
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ kind: 'decision', who: decision['by'], reason: decision['decision'] })
    }
  }
  return entries
}

export interface CardTelemetryInput {
  readonly id: string
  readonly card: string
  readonly run: string
  readonly pr?: number
  readonly pairVersion: string
  readonly workflowVersion: string
  readonly profile: string
  readonly engine: string
  readonly model?: string
  readonly outcome: string
  readonly cause?: string
  readonly start: number
  readonly end: number
  readonly stages: readonly TelemetryRecord[]
  readonly interventions: readonly ManualIntervention[]
}

/** The card's numbers come from observed stage records; missing usage stays missing. */
export function cardTelemetryRecord(input: CardTelemetryInput): TelemetryRecord {
  const stages = input.stages
  const activeMs = stages.reduce((total, stage) => total + Number(stage['durationMs'] ?? 0), 0)
  const wallMs = input.end - input.start
  const measured = stages.map(stage => stage['tokens'])
  const tokens =
    measured.length > 0 && measured.every(value => object(value) !== undefined)
      ? {
          freshIn: measured.reduce<number>(
            (total, value) => total + Number(object(value)?.['freshIn'] ?? 0),
            0,
          ),
          cachedIn: measured.reduce<number>(
            (total, value) => total + Number(object(value)?.['cachedIn'] ?? 0),
            0,
          ),
          out: measured.reduce<number>(
            (total, value) => total + Number(object(value)?.['out'] ?? 0),
            0,
          ),
        }
      : 'not measured'
  return {
    kind: 'card',
    id: input.id,
    card: input.card,
    run: input.run,
    pr: input.pr ?? 'not measured',
    pairVersion: input.pairVersion,
    workflowVersion: input.workflowVersion,
    profile: input.profile,
    engine: input.engine,
    model: input.model ?? 'not measured',
    outcome: input.outcome,
    ...(input.cause !== undefined && { cause: input.cause }),
    start: input.start,
    end: input.end,
    wallMs,
    activeMs,
    idleMs: Math.max(0, wallMs - activeMs),
    rounds: new Set(stages.filter(stage => stage['step'] === 'verify').map(stage => stage['phase']))
      .size,
    dispatches: stages.length,
    retries: stages.reduce((total, stage) => total + Number(stage['retries'] ?? 0), 0),
    tokens,
    interventions: input.interventions,
  }
}

export function readTelemetry(root: string, run: string, card: string): TelemetryRecord[] {
  const path = join(root, '.pair', 'working', 'telemetry', 'records.jsonl')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as TelemetryRecord)
    .filter(record => record.kind === 'stage' && record['run'] === run && record['card'] === card)
}

export interface StageTelemetryInput {
  readonly id: string
  readonly run?: string
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
    ...(input.run !== undefined && { run: input.run }),
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
