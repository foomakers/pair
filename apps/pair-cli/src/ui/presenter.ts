import chalk from 'chalk'
import type { LogEntry } from '#diagnostics'

export interface RegistryResult {
  name: string
  target: string
  ok: boolean
  error?: string | undefined
}

type PushLog = (level: LogEntry['level'], message: string) => void

export interface RegistryProgress {
  name: string
  index: number
  total: number
  source: string
  target: string
}

export interface CliPresenter {
  startOperation(operation: 'install' | 'update', registryCount: number): void
  registryStart(reg: RegistryProgress): void
  registryDone(name: string): void
  registryError(name: string, error: string): void
  phase(message: string): void
  summary(results: RegistryResult[], operation: 'install' | 'update', elapsedMs: number): void
}

const SEPARATOR = '──────────────────────────────────────'

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function opLabel(operation: 'install' | 'update'): string {
  return operation === 'install' ? 'Installing' : 'Updating'
}

function summaryLabel(operation: 'install' | 'update'): string {
  return operation === 'install' ? 'Installation' : 'Update'
}

function plural(count: number): string {
  return count === 1 ? 'registry' : 'registries'
}

function printSummaryBlock(
  results: RegistryResult[],
  operation: 'install' | 'update',
  elapsedMs: number,
): string {
  const ok = results.filter(r => r.ok).length
  const failed = results.length - ok
  const elapsed = formatElapsed(elapsedMs)
  const label = summaryLabel(operation)

  console.log(`\n  ${chalk.dim(SEPARATOR)}`)
  if (failed === 0) {
    console.log(
      `  ${chalk.green('✓')} ${label} complete (${results.length} ${plural(results.length)}, ${elapsed})`,
    )
  } else {
    console.log(
      `  ${chalk.yellow('!')} ${label} finished with errors (${ok} ok, ${failed} failed, ${elapsed})`,
    )
  }
  console.log()
  return `${label} complete: ${ok} ok, ${failed} failed (${elapsed})`
}

export function createCliPresenter(pushLog: PushLog): CliPresenter {
  return {
    startOperation(operation, registryCount) {
      const msg = `${opLabel(operation)} ${registryCount} ${plural(registryCount)}`
      console.log(`\n  ${chalk.bold(msg)}`)
      console.log(`  ${chalk.dim(SEPARATOR)}\n`)
      pushLog('info', msg)
    },

    registryStart({ name, index, total, source, target }) {
      const counter = chalk.dim(`[${index + 1}/${total}]`)
      console.log(
        `  ${counter} ${chalk.bold(name)}  ${chalk.dim(source)} ${chalk.dim('→')} ${chalk.dim(target)}`,
      )
      pushLog('info', `[${index + 1}/${total}] ${name}: ${source} → ${target}`)
    },

    registryDone(name) {
      console.log(`        ${chalk.green('✓')} done`)
      pushLog('info', `Successfully processed registry '${name}'`)
    },

    registryError(name, error) {
      console.log(`        ${chalk.red('✗')} ${error}`)
      pushLog('error', `Failed to process registry '${name}': ${error}`)
    },

    phase(message) {
      console.log(`  ${chalk.dim('›')} ${message}`)
      pushLog('info', message)
    },

    summary(results, operation, elapsedMs) {
      pushLog('info', printSummaryBlock(results, operation, elapsedMs))
    },
  }
}

export function createSilentPresenter(pushLog: PushLog): CliPresenter {
  return {
    startOperation(operation, registryCount) {
      const label = operation === 'install' ? 'Installing' : 'Updating'
      pushLog('info', `${label} ${registryCount} registries`)
    },
    registryStart({ name, index, total, source, target }) {
      pushLog('info', `[${index + 1}/${total}] ${name}: ${source} → ${target}`)
    },
    registryDone(name) {
      pushLog('info', `Successfully processed registry '${name}'`)
    },
    registryError(name, error) {
      pushLog('error', `Failed to process registry '${name}': ${error}`)
    },
    phase(message) {
      pushLog('info', message)
    },
    summary(results, operation, elapsedMs) {
      const ok = results.filter(r => r.ok).length
      const failed = results.length - ok
      const label = operation === 'install' ? 'Installation' : 'Update'
      pushLog('info', `${label} complete: ${ok} ok, ${failed} failed (${formatElapsed(elapsedMs)})`)
    },
  }
}
