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
  session?: string
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

export function parseTelemetryCommand(
  options: ParseTelemetryOptions = {},
  args: string[] = [],
): TelemetryCommandConfig {
  const mode = args[0]
  if (mode !== 'step' && mode !== 'card')
    throw new Error(`telemetry: expected "step" or "card", got "${mode ?? ''}"`)
  if (!options.card) throw new Error('telemetry: --card is required')
  const need = (flag: string, v: string | undefined) => {
    if (v === undefined) throw new Error(`telemetry ${mode}: --${flag} is required`)
  }
  const [freshIn, cachedIn, out] = (options.tokens ?? '').split(',').map(Number)
  if (options.tokens !== undefined && [freshIn, cachedIn, out].some(n => !Number.isInteger(n)))
    throw new Error(`--tokens: expected <fresh>,<cached>,<out> integers, got "${options.tokens}"`)
  if (mode === 'step') {
    ;(['step', 'engine', 'start', 'end'] as const).forEach(f => need(f, options[f]))
  } else {
    need('outcome', options.outcome)
    need('end', options.end)
  }
  const set = <K extends string>(k: K, v: unknown) => (v === undefined ? {} : { [k]: v })
  return {
    command: 'telemetry',
    mode,
    root: options.root ?? process.cwd(),
    card: options.card,
    ...set('pr', options.pr === undefined ? undefined : Number(options.pr)),
    ...set('step', options.step),
    ...set('phase', options.phase),
    ...set('engine', options.engine),
    ...set('model', options.model),
    ...set('effort', options.effort),
    ...set('start', time('start', options.start)),
    ...set('end', time('end', options.end)),
    ...set(
      'tokens',
      options.tokens === undefined ? undefined : { freshIn, cachedIn, out },
    ),
    ...set('session', options.session),
    ...set('outcome', options.outcome),
  } as TelemetryCommandConfig
}
