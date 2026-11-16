import { readFileSync } from 'fs'
import { join } from 'path'

/** An absent adoption setting leaves local telemetry off. A run flag takes precedence. */
export function telemetryEnabled(root: string, flag?: boolean): boolean {
  if (flag !== undefined) return flag
  let text: string
  try {
    text = readFileSync(join(root, '.pair/adoption/tech/automation.md'), 'utf8')
  } catch {
    return false
  }
  const section = /^## Telemetry\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(text)?.[1]
  return /^\s*-?\s*enabled:\s*true\s*$/m.test(section ?? '')
}

/** USD per million tokens, per model (`## Telemetry` fenced JSON `{"prices": {"<model>": {"fresh", "cached", "out"}}}`). */
export interface Price {
  readonly fresh: number
  readonly cached: number
  readonly out: number
}
export type Prices = Readonly<Record<string, Price>>

const price = (value: unknown): Price | undefined => {
  const p = value as Record<string, unknown> | null
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0
  return p !== null && typeof p === 'object' && ok(p['fresh']) && ok(p['cached']) && ok(p['out'])
    ? { fresh: p['fresh'], cached: p['cached'], out: p['out'] }
    : undefined
}

/** Malformed or absent table ⇒ no prices, so every cost reads `not measured` (never estimated). */
export function telemetryPrices(root: string): Prices {
  try {
    const text = readFileSync(join(root, '.pair/adoption/tech/automation.md'), 'utf8')
    const section = /^## Telemetry\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(text)?.[1] ?? ''
    const json = /```json\s*\n([\s\S]*?)```/.exec(section)?.[1]
    const table = (JSON.parse(json ?? '{}') as { prices?: Record<string, unknown> }).prices ?? {}
    return Object.fromEntries(
      Object.entries(table).flatMap(([model, p]) => (price(p) ? [[model, price(p)!]] : [])),
    )
  } catch {
    return {}
  }
}

/** tokens × price per Mtok; unpriced model or unmeasured tokens ⇒ `not measured`. */
export function costOf(tokens: unknown, price: Price | undefined): number | 'not measured' {
  const t = tokens as { freshIn?: unknown; cachedIn?: unknown; out?: unknown } | null
  if (price === undefined || t === null || typeof t !== 'object') return 'not measured'
  const { freshIn, cachedIn, out } = t
  if (typeof freshIn !== 'number' || typeof cachedIn !== 'number' || typeof out !== 'number')
    return 'not measured'
  return (freshIn * price.fresh + cachedIn * price.cached + out * price.out) / 1_000_000
}
