export const TOKEN_AREAS = [
  'templates',
  'adoption',
  'adr',
  'decision-log',
  'skills',
  'guidelines',
  'agent-context',
] as const

export type TokenArea = (typeof TOKEN_AREAS)[number]

export interface TokensCommandConfig {
  command: 'tokens'
  root: string
  area?: TokenArea
  json: boolean
  baseline?: string
}

export interface ParseTokensOptions {
  root?: string
  area?: string
  json?: boolean
  baseline?: string
}

export function parseTokensCommand(options: ParseTokensOptions = {}): TokensCommandConfig {
  const { area } = options
  if (area !== undefined && !(TOKEN_AREAS as readonly string[]).includes(area)) {
    throw new Error(`Unknown area "${area}". Valid areas: ${TOKEN_AREAS.join(', ')}.`)
  }
  return {
    command: 'tokens',
    root: options.root ?? process.cwd(),
    ...(area !== undefined && { area: area as TokenArea }),
    json: options.json === true,
    ...(options.baseline !== undefined && { baseline: options.baseline }),
  }
}
