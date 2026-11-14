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

function codexTokens(usage: Record<string, unknown>): Tokens | undefined {
  const input = count(usage['input_tokens'])
  const cached = count(usage['cached_input_tokens'])
  const out = count(usage['output_tokens'])
  if (input === undefined || cached === undefined || out === undefined || cached > input)
    return undefined
  return {
    freshIn: input - cached,
    cachedIn: cached,
    out,
    reasoning: count(usage['reasoning_output_tokens']) ?? 'not measured',
  }
}

function claudeTokens(usage: Record<string, unknown>): Tokens | undefined {
  const fresh = count(usage['input_tokens'])
  const cached = count(usage['cache_read_input_tokens'])
  const out = count(usage['output_tokens'])
  return fresh === undefined || cached === undefined || out === undefined
    ? undefined
    : { freshIn: fresh, cachedIn: cached, out, reasoning: 'not measured' }
}

function piUsage(
  event: Record<string, unknown>,
): { fresh: number; cached: number; out: number } | undefined {
  if (event['type'] !== 'message_end') return undefined
  const message = object(event['message'])
  if (message?.['role'] !== 'assistant') return undefined
  const usage = object(message['usage'])
  if (usage === undefined) return undefined
  const fresh = count(usage['input'])
  const cached = count(usage['cacheRead'])
  const out = count(usage['output'])
  if (fresh === undefined || cached === undefined || out === undefined) return undefined
  return { fresh, cached, out }
}

function piTokens(event: Record<string, unknown>, prior: Tokens): Tokens | undefined {
  const usage = piUsage(event)
  if (usage === undefined) return undefined
  const previous = typeof prior === 'string' ? undefined : prior
  return {
    freshIn: (previous?.freshIn ?? 0) + usage.fresh,
    cachedIn: (previous?.cachedIn ?? 0) + usage.cached,
    out: (previous?.out ?? 0) + usage.out,
    reasoning: 'not measured',
  }
}

function observedTokens(engine: string, event: Record<string, unknown>, prior: Tokens): Tokens {
  const usage = object(event['usage'])
  if (engine === 'codex' && usage !== undefined) return codexTokens(usage) ?? prior
  if (engine === 'claude' && usage !== undefined) return claudeTokens(usage) ?? prior
  if (engine === 'pi') return piTokens(event, prior) ?? prior
  return prior
}

/** Read only fields present in the engine event; never infer missing usage. */
export function observeEngineEvent(
  prior: EngineObservation,
  engine: string,
  payload: unknown,
): EngineObservation {
  const event = object(payload)
  if (event === undefined) return prior
  const sessionKey = engine === 'codex' ? 'thread_id' : engine === 'pi' ? 'sessionId' : 'session_id'
  const session = event[sessionKey]
  const sessionId = typeof session === 'string' ? session : prior.sessionId
  const previous = prior.tokens ?? 'not measured'
  return {
    ...(sessionId !== undefined && { sessionId }),
    tokens: observedTokens(engine, event, previous),
  }
}

export interface TelemetryRecord {
  readonly id: string
  readonly kind: 'stage' | 'card'
  readonly [key: string]: unknown
}

export function parseTelemetryLine(line: string): TelemetryRecord | undefined {
  try {
    const value = JSON.parse(line) as unknown
    const record = object(value)
    return (record?.['kind'] === 'stage' || record?.['kind'] === 'card') &&
      typeof record['id'] === 'string'
      ? (record as unknown as TelemetryRecord)
      : undefined
  } catch {
    return undefined
  }
}

export interface ManualIntervention {
  readonly kind: string
  readonly who: string
  readonly reason: string
}

function readSupersedes(runDir: string): ManualIntervention[] {
  const entries: ManualIntervention[] = []
  const index = join(runDir, 'maintainer-interventions.md')
  if (!existsSync(index)) return entries
  for (const line of readFileSync(index, 'utf8').split('\n')) {
    if (!line.startsWith('| ') || line.includes('| --- |') || line.includes('| file |')) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim())
    if (cells.length === 5 && cells[2] && cells[3])
      entries.push({ kind: 'supersede', reason: cells[2], who: cells[3] })
  }
  return entries
}

function readDecisionFile(path: string): Record<string, unknown> | undefined {
  try {
    return object(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return undefined
  }
}

function readHumanDecisions(runDir: string): ManualIntervention[] {
  const entries: ManualIntervention[] = []
  const seen = new Set<string>()
  for (const name of readdirSync(runDir)
    .filter(name => /review-phase-\d+\.json$/.test(name))
    .sort()) {
    const data = readDecisionFile(join(runDir, name))
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

/** Read the cycle's own durable intervention trail, without treating card prose as authority. */
export function readInterventions(runDir: string): ManualIntervention[] {
  if (!existsSync(runDir)) return []
  return [...readSupersedes(runDir), ...readHumanDecisions(runDir)]
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
  readonly findingsByRound?: Readonly<Record<string, Readonly<Record<string, number>>>>
  readonly repairs?: number
}

function cardTokens(
  stages: readonly TelemetryRecord[],
): Tokens | Omit<Exclude<Tokens, string>, 'reasoning'> {
  const measured = stages.map(stage => stage['tokens'])
  if (measured.length === 0 || measured.some(value => object(value) === undefined))
    return 'not measured'
  return {
    freshIn: measured.reduce<number>(
      (total, value) => total + Number(object(value)?.['freshIn'] ?? 0),
      0,
    ),
    cachedIn: measured.reduce<number>(
      (total, value) => total + Number(object(value)?.['cachedIn'] ?? 0),
      0,
    ),
    out: measured.reduce<number>((total, value) => total + Number(object(value)?.['out'] ?? 0), 0),
  }
}

/** The card's numbers come from observed stage records; missing usage stays missing. */
export function cardTelemetryRecord(input: CardTelemetryInput): TelemetryRecord {
  const stages = input.stages
  const activeMs = stages.reduce((total, stage) => total + Number(stage['durationMs'] ?? 0), 0)
  const start = Math.min(input.start, ...stages.map(stage => Number(stage['start'] ?? input.start)))
  const wallMs = input.end - start
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
    start,
    end: input.end,
    wallMs,
    activeMs,
    idleMs: Math.max(0, wallMs - activeMs),
    rounds: new Set(stages.filter(stage => stage['step'] === 'verify').map(stage => stage['phase']))
      .size,
    dispatches: stages.length,
    retries: stages.reduce((total, stage) => total + Number(stage['retries'] ?? 0), 0),
    findingsByRound: input.findingsByRound ?? {},
    repairs: input.repairs ?? 0,
    tokens: cardTokens(stages),
    interventions: input.interventions,
  }
}

function repairCount(handoff: Record<string, unknown>): number {
  if (handoff['skill'] === 'green-fix') return 1
  if (handoff['skill'] !== 'red-spec') return 0
  const attempt = count(handoff['attempt'])
  return attempt !== undefined && attempt > 1 ? 1 : 0
}

function reviewFindings(handoff: Record<string, unknown>): Record<string, number> | undefined {
  if (handoff['skill'] !== 'review-phase' || !Array.isArray(handoff['findings'])) return undefined
  const severities: Record<string, number> = {}
  for (const raw of handoff['findings']) {
    const severity = object(raw)?.['severity']
    if (typeof severity === 'string') severities[severity] = (severities[severity] ?? 0) + 1
  }
  return severities
}

/** Count only durable handoffs, so a resumed invocation sees the full card history. */
export function readCycleProgress(runDir: string): {
  findingsByRound: Record<string, Record<string, number>>
  repairs: number
} {
  const findingsByRound: Record<string, Record<string, number>> = {}
  let repairs = 0
  if (!existsSync(runDir)) return { findingsByRound, repairs }
  for (const name of readdirSync(runDir)
    .filter(name => name.endsWith('.json'))
    .sort()) {
    const handoff = readDecisionFile(join(runDir, name))
    if (handoff === undefined) continue
    repairs += repairCount(handoff)
    const phase = handoff['phase']
    const severities = reviewFindings(handoff)
    if (typeof phase === 'string' && severities !== undefined) findingsByRound[phase] = severities
  }
  return { findingsByRound, repairs }
}

export function readTelemetry(root: string, run: string, card: string): TelemetryRecord[] {
  const path = join(root, '.pair', 'working', 'telemetry', 'records.jsonl')
  if (!existsSync(path)) return []
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .flatMap(line => parseTelemetryLine(line) ?? [])
      .filter(record => record.kind === 'stage' && record['run'] === run && record['card'] === card)
  } catch {
    return []
  }
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

function stageOutcomeClass(input: StageTelemetryInput): string {
  if (input.finalStatus === 'rejected') return 'rejected'
  if (input.finalStatus === 'refused') return 'refused'
  if (input.finalStatus === 'parked') return 'parked'
  return input.processOutcome === 'success' && !input.finalStatus?.startsWith('failed')
    ? 'ok'
    : 'failed'
}

export function stageTelemetryRecord(input: StageTelemetryInput): TelemetryRecord {
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
    outcomeClass: stageOutcomeClass(input),
    retries: input.retries,
  }
}

/** The run directory is local and ignored; a repeated terminal write is a no-op by record id. */
export function appendTelemetry(root: string, record: TelemetryRecord): void {
  const dir = join(root, '.pair', 'working', 'telemetry')
  const path = join(dir, 'records.jsonl')
  try {
    if (existsSync(path)) {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (parseTelemetryLine(line)?.id === record.id) return
      }
    }
    mkdirSync(dir, { recursive: true })
    appendFileSync(path, `${JSON.stringify(record)}\n`)
  } catch {
    // Telemetry is best effort; a local file error cannot fail delivery.
  }
}
