import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { appendTelemetry } from './telemetry'
import { envelope } from './telemetry-trace'

interface HostRetryContext {
  root: string
  card: string
  run: string
  enabled: boolean
}

const contexts = new AsyncLocalStorage<HostRetryContext>()

export function withHostRetryContext<T>(context: HostRetryContext, run: () => T): T {
  return contexts.run(context, run)
}

export function relayHostRetries(stderr: string): void {
  for (const line of stderr.split(/\r?\n/)) {
    const match =
      /^HOST-RETRY: operation=(az|linear-graphql|gh:(?:api|issue|pr|repo|project):(?:read|write)) attempt=(\d+) outcome=(retry|recovered|permanent|exhausted)$/.exec(
        line,
      )
    if (!match) continue
    const [, operation, attempt, outcome] = match
    console.log(`  ${line}`)
    const context = contexts.getStore()
    if (context?.enabled)
      appendTelemetry(
        context.root,
        envelope(
          { id: randomUUID(), kind: 'event', ts: Date.now() },
          { card: context.card, run: context.run, outcome },
          { event: 'host-retry', operation, attempt: Number(attempt) },
        ),
      )
  }
}
