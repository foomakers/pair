import chalk from 'chalk'
import type { KbHost, KbIdentity } from './identity'
import type { ApplyResult, FileAction, FileOutcome } from './apply-plan'
import { RELEASE_SCRIPT_PATH } from './scaffold-plan'

const ACTION_LABELS: Record<FileAction, string> = {
  created: 'created',
  overwritten: 'updated',
  unchanged: 'unchanged',
  skipped: 'skipped',
}

function countsLine(outcomes: FileOutcome[]): string {
  const order: FileAction[] = ['created', 'overwritten', 'unchanged', 'skipped']
  const parts = order
    .map(action => ({ action, count: outcomes.filter(o => o.action === action).length }))
    .filter(({ count }) => count > 0)
    .map(({ action, count }) => `${count} ${ACTION_LABELS[action]}`)

  return parts.join(', ')
}

function skippedLines(outcomes: FileOutcome[]): string[] {
  return outcomes
    .filter(o => o.action === 'skipped')
    .map(o => `  ${chalk.yellow('!')} kept ${o.path} ${chalk.dim(`(${o.reason ?? 'skipped'})`)}`)
}

/**
 * Scaffold-owned paths the chosen `--host` does not manage: named, never deleted.
 * Silent when there are none, so the normal report keeps its two lines.
 *
 * The list is matched by existence, so the file is NOT necessarily a leftover of an earlier
 * scaffold — on a first run it can be the maintainer's own hand-written release workflow. The
 * hint is therefore conditional on that provenance instead of advising deletion outright.
 */
function unmanagedLines(unmanaged: string[], host: KbHost): string[] {
  const otherHost: KbHost = host === 'github' ? 'generic' : 'github'
  const hint = chalk.dim(
    `(if an earlier --host ${otherHost} scaffold generated it, delete it to stop CI runs on v* tags)`,
  )

  return unmanaged.map(
    relativePath =>
      `  ${chalk.yellow('!')} ${relativePath} exists but is not managed by --host ${host} ${hint}`,
  )
}

function nextSteps(identity: KbIdentity, host: KbHost): string[] {
  const publish =
    host === 'github'
      ? `  3. Release it: ${chalk.bold(`bash ${RELEASE_SCRIPT_PATH} 1.0.0`)} (packages, tags, publishes)`
      : `  3. Release it: ${chalk.bold(`bash ${RELEASE_SCRIPT_PATH} 1.0.0`)} (packages the ZIP to publish)`

  return [
    '',
    chalk.bold('  Next steps'),
    '  1. Add knowledge under .pair/knowledge/ and skills under .skills/',
    '  2. git init && git commit (the scaffold ships a .gitignore)',
    publish,
    `  4. Consume it: ${chalk.bold(`pair-cli install --source <git-url-or-path-of-${identity.slug}>`)}`,
    '',
  ]
}

/** Format the scaffold outcome: what changed, what was kept, and what to do next. */
export function formatScaffoldReport(
  result: ApplyResult,
  options: { identity: KbIdentity; host: KbHost },
): string {
  const { identity, host } = options

  return [
    '',
    `  ${chalk.green('✓')} KB scaffold ready — ${chalk.bold(identity.name)} at ${result.root}`,
    `  ${chalk.dim(countsLine(result.outcomes))}`,
    ...skippedLines(result.outcomes),
    ...unmanagedLines(result.unmanaged, host),
    ...nextSteps(identity, host),
  ].join('\n')
}
