#!/usr/bin/env node
import { Command } from 'commander'
import { readFileSync } from 'fs'
import { join } from 'path'
import chalk from 'chalk'

import { commandRegistry } from './commands'
import { dispatchCommand } from './commands/dispatcher'
import {
  fileSystemService,
  FileSystemService,
  setLogLevel,
  validateUrl,
  detectSourceType,
  SourceType,
  HttpClientService,
  NodeHttpClientService,
} from '@pair/content-ops'
import { getKnowledgeHubDatasetPath, getKnowledgeHubDatasetPathWithFallback } from './config'
import { validateCliOptions } from './kb-manager/cli-options'
import { isDiagEnabled, runDiagnostics, MIN_LOG_LEVEL } from './diagnostics'

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))

setLogLevel(MIN_LOG_LEVEL)

/**
 * Dependencies that can be injected for testing
 */
export interface CliDependencies {
  fs: FileSystemService
  httpClient: HttpClientService
}

interface CommandDeps {
  fsService: FileSystemService
  httpClient: HttpClientService
  version: string
}

function hasLocalDataset(fsService: FileSystemService): boolean {
  try {
    const datasetPath = getKnowledgeHubDatasetPath(fsService)
    return fsService.existsSync(datasetPath)
  } catch {
    return false
  }
}

function validateAndLogCustomUrl(customUrl: string): void {
  try {
    validateUrl(customUrl)
    if (isDiagEnabled()) console.error(`[diag] Using custom URL: ${customUrl}`)
  } catch (err) {
    console.error(chalk.red(`Invalid --url parameter: ${err}`))
    process.exitCode = 1
    process.exit(1)
  }
}

function shouldSkipKBDownload(
  skipKB?: boolean,
  fsService?: FileSystemService,
  customUrl?: string,
): boolean {
  if (skipKB) {
    if (isDiagEnabled()) console.error('[diag] Skipping KB download (--no-kb flag set)')
    return true
  }

  if (fsService && hasLocalDataset(fsService)) {
    if (isDiagEnabled()) console.error('[diag] Using local dataset')
    return true
  }

  // If customUrl is a local path, skip KB download - ensureKBAvailable will handle it
  if (customUrl && detectSourceType(customUrl) !== SourceType.REMOTE_URL) {
    if (isDiagEnabled()) console.error(`[diag] Using local path: ${customUrl}`)
    return true
  }

  return false
}

async function ensureKBAvailableOnStartup(options: {
  fsService: FileSystemService
  version: string
  customUrl?: string
  skipKB?: boolean
  httpClient?: HttpClientService
}): Promise<void> {
  const { fsService, version, customUrl, skipKB, httpClient } = options
  if (shouldSkipKBDownload(skipKB, fsService, customUrl)) {
    return
  }

  if (isDiagEnabled()) console.error('[diag] Local dataset not available, using KB manager')

  if (customUrl) {
    validateAndLogCustomUrl(customUrl)
  }

  try {
    const datasetPath = await getKnowledgeHubDatasetPathWithFallback({
      fsService,
      version,
      ...(httpClient && { httpClient }),
      ...(customUrl !== undefined && { customUrl }),
    })
    if (isDiagEnabled()) console.error(`[diag] KB dataset available at: ${datasetPath}`)
  } catch (err) {
    console.error(chalk.red(`[startup] Failed to ensure KB available: ${err}`))
    process.exitCode = 1
    process.exit(1)
  }
}

export function checkKnowledgeHubDatasetAccessible(
  fsService: FileSystemService,
  customUrl?: string,
): void {
  if (customUrl && detectSourceType(customUrl) !== SourceType.REMOTE_URL) {
    return
  }

  try {
    const datasetPath = getKnowledgeHubDatasetPath(fsService)
    if (!fsService.existsSync(datasetPath)) {
      console.error(chalk.red(`[startup] dataset folder not found at: ${datasetPath}`))
      process.exitCode = 1
      process.exit(1)
    }

    try {
      fsService.accessSync(datasetPath)
    } catch {
      console.error(chalk.red(`[startup] dataset folder is not readable: ${datasetPath}`))
      process.exitCode = 1
      process.exit(1)
    }
  } catch (err) {
    console.error(chalk.red(`[startup] failed to resolve knowledge-hub dataset. Error is: ${err}`))
    process.exitCode = 1
    process.exit(1)
  }
}

function addCommandOptions(
  cmd: Command,
  options: readonly { flags: string; description: string; defaultValue?: unknown }[],
): void {
  for (const opt of options) {
    if (opt.flags.startsWith('[')) {
      cmd.argument(opt.flags, opt.description)
    } else {
      if ('defaultValue' in opt) {
        cmd.option(opt.flags, opt.description, opt.defaultValue as string | boolean | string[])
      } else {
        cmd.option(opt.flags, opt.description)
      }
    }
  }
}

function buildCommandHelpText(examples: readonly string[], notes: readonly string[]): string {
  return `
Examples:
${examples.map((ex: string) => `  $ ${ex}`).join('\n')}

Usage Notes:
${notes.map((note: string) => `  • ${note}`).join('\n')}
`
}

function registerCommandFromMetadata(
  prog: Command,
  commandName: keyof typeof commandRegistry,
  deps: CommandDeps,
): void {
  const { fsService, httpClient, version } = deps
  const cmdConfig = commandRegistry[commandName]
  const cmd = prog.command(cmdConfig.metadata.name).description(cmdConfig.metadata.description)

  addCommandOptions(cmd, cmdConfig.metadata.options)
  cmd.addHelpText(
    'after',
    buildCommandHelpText(cmdConfig.metadata.examples, cmdConfig.metadata.notes),
  )

  cmd.action(async (...args: unknown[]) => {
    const cmdInstance = args[args.length - 1] as Command
    const cmdOptions = cmdInstance.opts<Record<string, unknown>>()
    const globalOptions = prog.opts<Record<string, unknown>>()
    const options = { ...globalOptions, ...cmdOptions }
    const config = cmdConfig.parse(options)

    try {
      await dispatchCommand(config, fsService, httpClient, version)
    } catch (err) {
      console.error(
        chalk.red(
          `${cmdConfig.metadata.name} failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      )
      process.exitCode = 1
      process.exit(1)
    }
  })
}

function setupCommands(prog: Command, deps: CommandDeps): void {
  Object.keys(commandRegistry).forEach(name => {
    registerCommandFromMetadata(prog, name as keyof typeof commandRegistry, deps)
  })

  prog.action(() => {
    console.log(chalk.green('Welcome to Pair CLI! Use --help to see available commands.'))
    console.log(
      chalk.gray('💡 Tip: Use "pair install --list-targets" to see available asset registries'),
    )
  })
}

async function setupAndValidateKB(
  fsService: FileSystemService,
  httpClient: HttpClientService,
  options: { url?: string; kb: boolean },
): Promise<void> {
  try {
    validateCliOptions({ ...(options.url && { url: options.url }), kb: options.kb })
  } catch (err) {
    console.error(chalk.red(`Invalid options: ${err}`))
    process.exitCode = 1
    process.exit(1)
  }

  await ensureKBAvailableOnStartup({
    fsService,
    version: pkg.version,
    ...(options.url !== undefined && { customUrl: options.url }),
    skipKB: !options.kb,
    httpClient,
  })

  if (options.kb !== false) {
    checkKnowledgeHubDatasetAccessible(fsService, options.url)
  }
}

export async function runCli(
  argv: string[],
  deps: CliDependencies = { fs: fileSystemService, httpClient: new NodeHttpClientService() },
): Promise<void> {
  const { fs: fsService, httpClient } = deps
  const program = new Command()

  program
    .name(chalk.blue(pkg.name))
    .description(pkg.description)
    .version(pkg.version)
    .option('--url <url>', 'Custom URL for KB download (overrides default GitHub release)')
    .option('--no-kb', 'Skip knowledge base download')

  runDiagnostics(fsService)
  setupCommands(program, { fsService, httpClient, version: pkg.version })

  await program.parseAsync(argv)
  const options = program.opts<{ url?: string; kb: boolean }>()

  await setupAndValidateKB(fsService, httpClient, options)
}

export async function main() {
  await runCli(process.argv)
}

if (require.main === module) {
  main().catch(err => {
    console.error(chalk.red(`Fatal error: ${err}`))
    process.exit(1)
  })
}
