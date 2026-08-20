/**
 * Outcome model and summary composition for install/update runs.
 *
 * A registry the source does not ship is **not** a failure: it is nothing to install.
 * Keeping the three outcomes apart here — and deriving BOTH the printed summary and the
 * process exit code from the same tally — is what stops the text and the status code
 * from disagreeing (US-396, AC5: today the summary says "finished with errors" while
 * the command exits 0).
 */

export type RegistryStatus = 'ok' | 'skipped' | 'failed'

export interface RegistryResult {
  name: string
  target: string
  status: RegistryStatus
  /** Why the registry was skipped — always set on a `skipped` result. */
  reason?: string | undefined
  /** How the registry failed — set on a `failed` result. */
  error?: string | undefined
}

/** The source simply does not contain this registry. Legitimate for any external KB. */
export const SKIP_NOT_SHIPPED = 'not shipped by this source'

/** The source's own config declares a registry this CLI has no definition for. */
export const SKIP_UNKNOWN_REGISTRY = 'declared by source, unknown to this CLI'

export interface RegistryTally {
  ok: number
  skipped: number
  failed: number
  total: number
}

export type SummaryTone = 'success' | 'noop' | 'error'

export interface OperationSummary {
  tone: SummaryTone
  /** Single-line verdict, without the ✓/! marker (the presenter owns the colour). */
  headline: string
  /** One line per distinct skip reason, naming the registries it covers. */
  details: string[]
  /** Diagnostics line — the same tally as the headline, never a different one. */
  log: string
  exitCode: number
}

export function tallyRegistries(results: RegistryResult[]): RegistryTally {
  const count = (status: RegistryStatus) => results.filter(r => r.status === status).length
  return {
    ok: count('ok'),
    skipped: count('skipped'),
    failed: count('failed'),
    total: results.length,
  }
}

/**
 * The exit code follows the failures only — plus the one case a green summary would lie
 * about: a run where nothing at all was installed.
 */
export function exitCodeFor(tally: RegistryTally): number {
  if (tally.failed > 0) return 1
  if (tally.total > 0 && tally.ok === 0) return 1
  return 0
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function plural(count: number): string {
  return count === 1 ? 'registry' : 'registries'
}

function summaryLabel(operation: 'install' | 'update'): string {
  return operation === 'install' ? 'Installation' : 'Update'
}

function noopLabel(operation: 'install' | 'update'): string {
  return operation === 'install' ? 'Nothing to install' : 'Nothing to update'
}

/** Skip reasons, in first-seen order, each with the registries it covers. */
function groupSkipReasons(results: RegistryResult[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>()
  for (const result of results) {
    if (result.status !== 'skipped') continue
    const reason = result.reason ?? 'no reason given'
    const names = grouped.get(reason) ?? []
    names.push(result.name)
    grouped.set(reason, names)
  }
  return grouped
}

function toneFor(tally: RegistryTally): SummaryTone {
  if (tally.failed > 0) return 'error'
  if (tally.total > 0 && tally.ok === 0) return 'noop'
  return 'success'
}

/**
 * The reason rides on the headline only when it is unambiguous: one distinct reason, and
 * no failure competing for the reader's attention (the detail lines carry it either way).
 */
function skippedFragment(tally: RegistryTally, reasons: Map<string, string[]>): string {
  const only = reasons.size === 1 && tally.failed === 0 ? [...reasons.keys()][0] : undefined
  return only ? `${tally.skipped} skipped — ${only}` : `${tally.skipped} skipped`
}

function headlineFor(ctx: {
  tally: RegistryTally
  tone: SummaryTone
  reasons: Map<string, string[]>
  operation: 'install' | 'update'
  elapsed: string
}): string {
  const { tally, tone, reasons, operation, elapsed } = ctx
  // Nothing was skipped and nothing failed: the counts add no information, so the
  // long-standing wording stands.
  if (tone === 'success' && tally.skipped === 0) {
    return `${summaryLabel(operation)} complete (${tally.total} ${plural(tally.total)}, ${elapsed})`
  }

  const parts = [`${tally.ok} ok`]
  if (tally.skipped > 0) parts.push(skippedFragment(tally, reasons))
  if (tally.failed > 0) parts.push(`${tally.failed} failed`)
  const counts = `(${parts.join(', ')}, ${elapsed})`

  if (tone === 'error') return `${summaryLabel(operation)} finished with errors ${counts}`
  if (tone === 'noop') return `${noopLabel(operation)} ${counts}`
  return `${summaryLabel(operation)} complete ${counts}`
}

export function buildOperationSummary(
  results: RegistryResult[],
  operation: 'install' | 'update',
  elapsedMs: number,
): OperationSummary {
  const tally = tallyRegistries(results)
  const reasons = groupSkipReasons(results)
  const tone = toneFor(tally)
  const elapsed = formatElapsed(elapsedMs)

  return {
    tone,
    headline: headlineFor({ tally, tone, reasons, operation, elapsed }),
    details: [...reasons].map(
      ([reason, names]) => `${names.length} skipped — ${reason}: ${names.join(', ')}`,
    ),
    log: `${summaryLabel(operation)} complete: ${tally.ok} ok, ${tally.skipped} skipped, ${tally.failed} failed (${elapsed})`,
    exitCode: exitCodeFor(tally),
  }
}
