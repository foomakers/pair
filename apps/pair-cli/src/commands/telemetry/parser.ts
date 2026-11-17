export interface TelemetryCommandConfig {
  command: 'telemetry'
  mode: 'step' | 'card'
  root: string
  card: string
  pr?: number
  step?: string
  phase?: string
  engine?: string
  model?: string
  effort?: string
  start?: number
  end?: number
  tokens?: { freshIn: number; cachedIn: number; out: number }
  sessionId?: string
  outcome?: string
}

export interface ParseTelemetryOptions {
  root?: string
  card?: string
  pr?: string
  step?: string
  phase?: string
  engine?: string
  model?: string
  effort?: string
  start?: string
  end?: string
  tokens?: string
  session?: string
  outcome?: string
}

/** ISO instant or epoch ms. */
const time = (flag: string, raw: string | undefined): number | undefined => {
  if (raw === undefined) return undefined
  const ms = /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw)
  if (Number.isNaN(ms)) throw new Error(`--${flag}: expected ISO time or epoch ms, got "${raw}"`)
  return ms
}

const REQUIRED = {
  step: ['card', 'step', 'engine', 'start', 'end'],
  card: ['card', 'outcome', 'end'],
} as const

function tokensOf(raw: string | undefined): TelemetryCommandConfig['tokens'] {
  if (raw === undefined) return undefined
  const [freshIn, cachedIn, out] = raw.split(',').map(Number)
  if ([freshIn, cachedIn, out].some(n => !Number.isInteger(n)))
    throw new Error(`--tokens: expected <fresh>,<cached>,<out> integers, got "${raw}"`)
  return { freshIn: freshIn!, cachedIn: cachedIn!, out: out! }
}

export function parseTelemetryCommand(
  options: ParseTelemetryOptions = {},
  args: string[] = [],
): TelemetryCommandConfig {
  const mode = args[0]
  if (mode !== 'step' && mode !== 'card')
    throw new Error(`telemetry: expected "step" or "card", got "${mode ?? ''}"`)
  for (const flag of REQUIRED[mode])
    if (options[flag] === undefined) throw new Error(`telemetry ${mode}: --${flag} is required`)
  const { pr, start, end, tokens, session, ...rest } = options
  const config = {
    ...rest,
    command: 'telemetry',
    mode,
    root: options.root ?? process.cwd(),
    pr: pr === undefined ? undefined : Number(pr),
    start: time('start', start),
    end: time('end', end),
    tokens: tokensOf(tokens),
    sessionId: session,
  }
  return Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== undefined),
  ) as unknown as TelemetryCommandConfig
}
