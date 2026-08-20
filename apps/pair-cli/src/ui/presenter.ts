import chalk from 'chalk'
import type { LogEntry } from '#diagnostics'
import { buildOperationSummary, type OperationSummary, type RegistryResult } from './summary'

export type { RegistryResult, RegistryStatus, RegistryTally, OperationSummary } from './summary'

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
  registrySkipped(name: string, reason: string): void
  registryError(name: string, error: string): void
  /** Something the user must know about that is not tied to one registry. */
  warning(message: string): void
  phase(message: string): void
  summary(results: RegistryResult[], operation: 'install' | 'update', elapsedMs: number): void
}

const SEPARATOR = '──────────────────────────────────────'

function opLabel(operation: 'install' | 'update'): string {
  return operation === 'install' ? 'Installing' : 'Updating'
}

function plural(count: number): string {
  return count === 1 ? 'registry' : 'registries'
}

/** ✓ for a clean run, ! for anything the reader has to act on (failure or no-op). */
function marker(tone: OperationSummary['tone']): string {
  return tone === 'success' ? chalk.green('✓') : chalk.yellow('!')
}

function printSummaryBlock(summary: OperationSummary): void {
  console.log(`\n  ${chalk.dim(SEPARATOR)}`)
  console.log(`  ${marker(summary.tone)} ${summary.headline}`)
  for (const detail of summary.details) {
    console.log(`    ${chalk.dim(detail)}`)
  }
  console.log()
}

/** The per-registry progress lines: one block, so the run-level reporter stays small. */
function registryReporter(
  pushLog: PushLog,
): Pick<CliPresenter, 'registryStart' | 'registryDone' | 'registrySkipped' | 'registryError'> {
  return {
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

    registrySkipped(name, reason) {
      console.log(`        ${chalk.dim(`- skipped — ${reason}`)}`)
      pushLog('info', `Registry '${name}' skipped: ${reason}`)
    },

    registryError(name, error) {
      console.log(`        ${chalk.red('✗')} ${error}`)
      pushLog('error', `Failed to process registry '${name}': ${error}`)
    },
  }
}

export function createCliPresenter(pushLog: PushLog): CliPresenter {
  return {
    ...registryReporter(pushLog),

    startOperation(operation, registryCount) {
      const msg = `${opLabel(operation)} ${registryCount} ${plural(registryCount)}`
      console.log(`\n  ${chalk.bold(msg)}`)
      console.log(`  ${chalk.dim(SEPARATOR)}\n`)
      pushLog('info', msg)
    },

    // A diagnostics-only warning is a warning nobody reads: nothing consumes the log
    // array, so this has to reach the console (US-396).
    warning(message) {
      console.warn(`  ${chalk.yellow('!')} ${message}`)
      pushLog('warn', message)
    },

    phase(message) {
      console.log(`  ${chalk.dim('›')} ${message}`)
      pushLog('info', message)
    },

    summary(results, operation, elapsedMs) {
      const built = buildOperationSummary(results, operation, elapsedMs)
      printSummaryBlock(built)
      pushLog('info', built.log)
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
    registrySkipped(name, reason) {
      pushLog('info', `Registry '${name}' skipped: ${reason}`)
    },
    registryError(name, error) {
      pushLog('error', `Failed to process registry '${name}': ${error}`)
    },
    warning(message) {
      pushLog('warn', message)
    },
    phase(message) {
      pushLog('info', message)
    },
    summary(results, operation, elapsedMs) {
      pushLog('info', buildOperationSummary(results, operation, elapsedMs).log)
    },
  }
}
