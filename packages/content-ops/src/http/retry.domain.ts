import type { downloadFile, DownloadOptions } from './download-manager'

export type RetryOutcome =
  | { tag: 'success' }
  | { tag: 'transient'; cause: unknown }
  | { tag: 'permanent'; cause: unknown }

export interface RetryPolicy {
  maxRetries: number
  delays: number[]
  download: typeof downloadFile
}

const RETRYABLE_PATTERNS = [
  'econnreset',
  'etimedout',
  'econnrefused',
  'socket hang up',
  'enotfound',
  'epipe',
]

type RetryFailure = Extract<RetryOutcome, { tag: 'transient' | 'permanent' }>

export function classifyRejection(cause: unknown): RetryFailure {
  // Keep the original message operations for arbitrary JavaScript rejections.
  const message = readProperty(cause, 'message') || ''
  const toLowerCase = readProperty(message, 'toLowerCase')
  if (typeof toLowerCase !== 'function') {
    throw new TypeError('(error.message || "").toLowerCase is not a function')
  }
  const lower: unknown = Reflect.apply(toLowerCase, message, [])
  const retryable = RETRYABLE_PATTERNS.some(pattern => {
    const includes = readProperty(lower, 'includes')
    if (typeof includes !== 'function') throw new TypeError('msg.includes is not a function')
    return Boolean(Reflect.apply(includes, lower, [pattern]))
  })
  return { tag: retryable ? 'transient' : 'permanent', cause }
}

function readProperty(value: unknown, key: string): unknown {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${value} (reading '${key}')`)
  }
  return Reflect.get(Object(value), key, value)
}

function shouldRetry(
  outcome: RetryOutcome,
  attempt: number,
  maxRetries: number,
): outcome is Extract<RetryFailure, { tag: 'transient' }> {
  switch (outcome.tag) {
    case 'success':
      return false
    case 'permanent':
      throw outcome.cause
    case 'transient':
      if (attempt >= maxRetries) throw outcome.cause
      return true
    default: {
      const exhaustive: never = outcome
      return exhaustive
    }
  }
}

export async function retryDownload(
  url: string,
  destination: string,
  options: DownloadOptions,
  { maxRetries, delays, download }: RetryPolicy,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    let outcome: RetryOutcome
    try {
      await download(url, destination, options)
      outcome = { tag: 'success' }
    } catch (cause) {
      outcome = classifyRejection(cause)
    }

    if (!shouldRetry(outcome, attempt, maxRetries)) return
    const delay = delays[attempt] ?? delays[delays.length - 1] ?? 4000
    await new Promise(resolve => setTimeout(resolve, delay))
    // Fractional budgets can allow a delay without allowing another attempt.
    if (!(attempt + 1 <= maxRetries)) throw outcome.cause
  }
}
