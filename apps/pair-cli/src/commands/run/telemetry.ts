import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'fs'
import { dirname, join, posix, win32 } from 'path'

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

const optionalCount = (value: unknown): number | undefined =>
  value === undefined ? 0 : count(value)

function noncachedInput(input: unknown, cacheWrite: unknown): number | undefined {
  const fresh = count(input)
  const write = optionalCount(cacheWrite)
  return fresh === undefined || write === undefined ? undefined : count(fresh + write)
}

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
  const noncached = noncachedInput(usage['input_tokens'], usage['cache_creation_input_tokens'])
  const cached = count(usage['cache_read_input_tokens'])
  const out = count(usage['output_tokens'])
  return noncached === undefined || cached === undefined || out === undefined
    ? undefined
    : { freshIn: noncached, cachedIn: cached, out, reasoning: 'not measured' }
}

function piUsage(
  event: Record<string, unknown>,
): { fresh: number; cached: number; out: number; reasoning: number | 'not measured' } | undefined {
  if (event['type'] !== 'message_end') return undefined
  const message = object(event['message'])
  if (message?.['role'] !== 'assistant') return undefined
  const usage = object(message['usage'])
  if (usage === undefined) return undefined
  const noncached = noncachedInput(usage['input'], usage['cacheWrite'])
  const cached = count(usage['cacheRead'])
  const out = count(usage['output'])
  if (noncached === undefined || cached === undefined || out === undefined) return undefined
  return { fresh: noncached, cached, out, reasoning: count(usage['reasoning']) ?? 'not measured' }
}

function sumReasoning(prior: Tokens, current: number | 'not measured'): number | 'not measured' {
  if (typeof prior === 'string') return current
  return typeof prior.reasoning === 'number' && typeof current === 'number'
    ? (count(prior.reasoning + current) ?? 'not measured')
    : 'not measured'
}

function piTokens(event: Record<string, unknown>, prior: Tokens): Tokens | undefined {
  const usage = piUsage(event)
  if (usage === undefined) return undefined
  const previous = typeof prior === 'string' ? undefined : prior
  return {
    freshIn: (previous?.freshIn ?? 0) + usage.fresh,
    cachedIn: (previous?.cachedIn ?? 0) + usage.cached,
    out: (previous?.out ?? 0) + usage.out,
    reasoning: sumReasoning(prior, usage.reasoning),
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
  const sessionKey =
    engine === 'codex'
      ? 'thread_id'
      : engine === 'pi'
        ? event['type'] === 'session'
          ? 'id'
          : 'sessionId'
        : 'session_id'
  const session = event[sessionKey]
  const sessionId = typeof session === 'string' ? session : prior.sessionId
  const previous = prior.tokens ?? 'not measured'
  return {
    ...(sessionId !== undefined && { sessionId }),
    tokens: observedTokens(engine, event, previous),
  }
}

/** `stage` is the v1 end record (read, never rewritten); `start`/`end`/`event` are the v2 envelope kinds. */
export type TelemetryKind = 'stage' | 'card' | 'start' | 'end' | 'event'
const KINDS: readonly unknown[] = ['stage', 'card', 'start', 'end', 'event']

export interface TelemetryRecord {
  readonly id: string
  readonly kind: TelemetryKind
  readonly [key: string]: unknown
}

export function telemetryFile(root: string, platform: NodeJS.Platform = process.platform): string {
  const paths = platform === 'win32' ? win32 : posix
  return paths.join(root, '.pair', 'working', 'telemetry', 'records.jsonl')
}

export function parseTelemetryLine(line: string): TelemetryRecord | undefined {
  try {
    const value = JSON.parse(line) as unknown
    const record = object(value)
    return KINDS.includes(record?.['kind']) && typeof record?.['id'] === 'string'
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
    const cells = interventionRow(line)
    // US-647: a maintainer-decision row is counted from maintainer-decisions.json (with its choice), not twice here.
    if (cells?.[2] && cells[3] && !cells[1]?.startsWith('maintainer decision:'))
      entries.push({ kind: 'supersede', reason: cells[2], who: cells[3] })
  }
  return entries
}

/** The five cells of one `maintainer-interventions.md` table row, or undefined for a header/separator/prose line. */
function interventionRow(line: string): string[] | undefined {
  if (!line.startsWith('| ') || line.includes('| --- |') || line.includes('| file |'))
    return undefined
  const cells = line
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map(cell => cell.trim().replace(/\\\|/g, '|'))
  return cells.length === 5 ? cells : undefined
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
    .filter(name => /review-phase(?:\.attempt-\d+)?\.json$/.test(name))
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

function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    return object(JSON.parse(text))
  } catch {
    return undefined
  }
}

/** #642 AC-7: human board repairs (`board-audit --apply`) appended to the card's run trail. */
function readManualUnblocks(runDir: string): ManualIntervention[] {
  const file = join(runDir, 'manual-unblocks.jsonl')
  if (!existsSync(file)) return []
  const entries: ManualIntervention[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const entry = parseObject(line)
    if (typeof entry?.['who'] === 'string' && typeof entry['reason'] === 'string')
      entries.push({ kind: 'manual-unblock', who: entry['who'], reason: entry['reason'] })
  }
  return entries
}

/** US-647: every maintainer decision comment the script recorded — accepted (by choice), revoked or ignored, never its text as authority. */
function readMaintainerDecisions(runDir: string): ManualIntervention[] {
  const path = join(runDir, 'maintainer-decisions.json')
  if (!existsSync(path)) return []
  const list = JSON.parse(readFileSync(path, 'utf8')) as unknown
  return (Array.isArray(list) ? list : []).flatMap(raw => {
    const r = object(raw)
    return typeof r?.['author'] === 'string' ? [decisionIntervention(r, r['author'])] : []
  })
}

function decisionIntervention(r: Record<string, unknown>, who: string): ManualIntervention {
  const value = object(r['value'])
  // review r1-1: a revocation is the host's observation (a comment edited or deleted, by anyone with write access) —
  // never attributed to the maintainer who authored the decision.
  if (r['status'] === 'revoked')
    return {
      kind: 'maintainer-revoked',
      who: 'host',
      reason: `${String(r['revokedReason'] ?? '')} (decision by ${who})`,
    }
  if (r['status'] === 'accepted' && typeof value?.['choice'] === 'string')
    return { kind: `maintainer-${value['choice']}`, who, reason: String(value['reason'] ?? '') }
  return { kind: 'maintainer-ignored', who, reason: String(r['reason'] ?? '') }
}

/** Read the cycle's own durable intervention trail, without treating card prose as authority. */
export function readInterventions(runDir: string): ManualIntervention[] {
  try {
    if (!existsSync(runDir)) return []
    return [
      ...readSupersedes(runDir),
      ...readHumanDecisions(runDir),
      ...readMaintainerDecisions(runDir),
      ...readManualUnblocks(runDir),
    ]
  } catch {
    return [] // best effort: telemetry never fails delivery
  }
}

export interface CardTelemetryInput {
  readonly id: string
  readonly card: string
  readonly run: string
  readonly pr?: number
  readonly pairVersion: string
  readonly workflowVersion: string
  readonly profile: string
  readonly engine?: string
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
  const measured = stages
    .filter(stage => stage['step'] !== 'merge') // deterministic: no engine usage
    .map(stage => stage['tokens'])
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

/** Retries = dispatches of a logical stage beyond its first, from durable records (survives resume). */
function retryCount(stages: readonly TelemetryRecord[]): number {
  const dispatches = new Map<string, number>()
  for (const stage of stages) {
    const key = `${String(stage['step'])}:${String(stage['phase'] ?? '')}`
    dispatches.set(key, (dispatches.get(key) ?? 0) + 1)
  }
  return [...dispatches.values()].reduce((total, n) => total + n - 1, 0)
}

/** v1 `stage` and v2 `end` read as one shape; an `end` supersedes the `stage` written for the same dispatch. */
function normalizedStages(records: readonly TelemetryRecord[]): TelemetryRecord[] {
  const superseded = new Set(records.filter(r => r.kind === 'end').map(r => r['legacyId']))
  return records
    .filter(r => r.kind === 'end' || (r.kind === 'stage' && !superseded.has(r.id)))
    .map(r => {
      if (r.kind !== 'end') return r
      const durationMs = Number(r['durationMs'] ?? 0)
      return {
        ...r,
        start: Date.parse(String(r['ts'])) - durationMs,
        outcomeClass: String(r['outcome']),
      }
    })
}

type Totals = { stages: number; durationMs: number; tokens: unknown; cost: number | 'not measured' }

/** C5: totals per runner and per model; unmeasured tokens/cost stay `not measured`, never partial. */
function totalsBy(stages: readonly TelemetryRecord[], key: string): Record<string, Totals> {
  const groups = new Map<string, TelemetryRecord[]>()
  for (const stage of stages) {
    const name = String(stage[key] ?? 'not measured')
    groups.set(name, [...(groups.get(name) ?? []), stage])
  }
  return Object.fromEntries(
    [...groups].map(([name, group]) => {
      const costs = group.map(stage => stage['cost'])
      return [
        name,
        {
          stages: group.length,
          durationMs: group.reduce((total, stage) => total + Number(stage['durationMs'] ?? 0), 0),
          tokens: cardTokens(group),
          cost: costs.every(c => typeof c === 'number')
            ? (costs as number[]).reduce((total, c) => total + c, 0)
            : 'not measured',
        },
      ]
    }),
  )
}

/** The card's numbers come from observed stage records; missing usage stays missing. */
export function cardTelemetryRecord(input: CardTelemetryInput): TelemetryRecord {
  const stages = normalizedStages(input.stages)
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
    retries: retryCount(stages),
    findingsByRound: input.findingsByRound ?? {},
    repairs: input.repairs ?? 0,
    tokens: cardTokens(stages),
    stageRecords: stages.map(stage => ({
      step: stage['step'],
      phase: stage['phase'] ?? null,
      round: stage['round'] ?? null,
      engine: stage['engine'],
      model: stage['model'] ?? 'not measured',
      effort: stage['effort'] ?? 'not measured',
      context: stage['stageContext'] ?? 'not measured',
      durationMs: stage['durationMs'],
      tokens: stage['tokens'],
      cost: stage['cost'] ?? 'not measured',
      outcome: stage['outcome'] ?? stage['outcomeClass'],
      cause: stage['cause'] ?? null,
    })),
    byRunner: totalsBy(stages, 'engine'),
    byModel: totalsBy(stages, 'model'),
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
  let names: string[] = []
  try {
    names = readdirSync(runDir)
      .filter(name => name.endsWith('.json'))
      .sort()
  } catch {
    // best effort: absent or unreadable run directory
  }
  for (const name of names) {
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
  return readRecords(root).filter(
    record => record.kind === 'stage' && record['run'] === run && record['card'] === card,
  )
}

/** Every stage-level record (v1 `stage`, v2 `end`) of the card across ALL its runs — what the card aggregates. */
export function readCardStages(root: string, card: string): TelemetryRecord[] {
  return readRecords(root).filter(
    record => (record.kind === 'stage' || record.kind === 'end') && record['card'] === card,
  )
}

function readRecords(root: string): TelemetryRecord[] {
  const path = telemetryFile(root)
  if (!existsSync(path)) return []
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .flatMap(line => parseTelemetryLine(line) ?? [])
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
  /** Whether the handoff advanced, known only after the next resolve. */
  readonly advanced?: boolean
  readonly observation: EngineObservation
}

function stageOutcomeClass(input: StageTelemetryInput): string {
  if (input.finalStatus === 'rejected') return 'rejected'
  if (input.finalStatus === 'refused') return 'refused'
  if (input.finalStatus === 'parked') return 'parked'
  return input.processOutcome === 'success' &&
    input.advanced !== false &&
    !input.finalStatus?.startsWith('failed')
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
  const path = telemetryFile(root)
  try {
    if (existsSync(path)) {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (parseTelemetryLine(line)?.id === record.id) return
      }
    }
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify(record)}\n`)
  } catch {
    // Telemetry is best effort; a local file error cannot fail delivery.
  }
}
