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
  HttpClientService,
  NodeHttpClientService,
  logger,
} from '@pair/content-ops'
import { bootstrapEnvironment } from './config'
import { runDiagnostics, MIN_LOG_LEVEL } from './diagnostics'

// Helper type-guard to keep positional args typed as string[]
function onlyStrings(arr: unknown[]): string[] {
  return arr.filter((x): x is string => typeof x === 'string')
}

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))

setLogLevel(MIN_LOG_LEVEL)

export interface CliDependencies {
  fs: FileSystemService
  httpClient: HttpClientService
}

interface CommandDeps {
  fsService: FileSystemService
  httpClient: HttpClientService
  version: string
}

/**
 * Convert kebab-case string to camelCase
 */
function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Normalize option keys from kebab-case to camelCase
 * Commander stores options with dashes (e.g., 'source-dir') but parsers expect camelCase (e.g., 'sourceDir')
 *
 * Special handling for quoted values: if a value contains spaces and was quoted,
 * we need to preserve it as a single value.
 */
function normalizeOptionKeys(options: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(options)) {
    const camelKey = kebabToCamel(key)
    normalized[camelKey] = value
  }
  return normalized
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
    .option('-l, --log-level <level>', 'Set minimum log level (debug|info|warn|error)')
    .option('-v, --verbose', 'Enable verbose logging (deprecated; use --log-level debug)')
    .option('--no-kb', 'Skip knowledge base download')
    // Prevent Commander from calling process.exit() automatically
    .exitOverride()

  runDiagnostics(fsService)
  setupCommands(program, { fsService, httpClient, version: pkg.version })

  // Attach preAction hook
  attachPreActionHook(program, { fsService, httpClient, version: pkg.version })

  await program.parseAsync(argv)
}

export async function main() {
  try {
    await runCli(process.argv)
  } catch (err: unknown) {
    // Handling Commander specific errors (like --help or invalid command)
    // that should not result in a red "failed" message if they are just info requests.
    const commanderErr = err as { code?: string }
    if (
      commanderErr.code === 'commander.helpDisplayed' ||
      commanderErr.code === 'commander.version'
    ) {
      return
    }

    // Handle the case where the "error" is just the version string being output
    // This happens when --version is passed but exitOverride() still throws
    const errMessage = err instanceof Error ? err.message : String(err)
    if (errMessage === pkg.version) {
      return
    }

    // Distinguish between environment errors and command execution errors if possible,
    // but centralize colors and exit logic here.
    logger.error(`Error: ${errMessage}`)

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
    // Commander stores options with dashes in the name (e.g., 'source-dir' instead of 'sourceDir')
    // We need to convert kebab-case keys to camelCase for the parser
    const normalizedOptions = normalizeOptionKeys({ ...globalOptions, ...cmdOptions })
    const positionalArgs = onlyStrings(args.slice(0, -1))
    const config = cmdConfig.parse(normalizedOptions, positionalArgs)

    const initCwd = process.env['INIT_CWD']
    await dispatchCommand(config, fsService, {
      httpClient,
      cliVersion: version,
      ...(initCwd && { baseTarget: initCwd }),
    })
  })
}

function setupCommands(prog: Command, deps: CommandDeps): void {
  Object.keys(commandRegistry).forEach(name => {
    registerCommandFromMetadata(prog, name as keyof typeof commandRegistry, deps)
  })

  prog.action(() => {
    logger.info('Welcome to Pair CLI! Use --help to see available commands.')
    logger.info('💡 Tip: Use "pair install --list-targets" to see available asset registries')
  })
}

function attachPreActionHook(
  prog: Command,
  ctx: { fsService: FileSystemService; httpClient: HttpClientService; version: string },
): void {
  prog.hook('preAction', async thisCommand => {
    // Skip bootstrap for package command - it doesn't need KB
    const cmdName = thisCommand.name()
    if (cmdName === 'package') return

    // Apply global log level or legacy --verbose alias if provided
    const globalOptions = prog.opts<{ logLevel?: string; verbose?: boolean }>()
    if (globalOptions.verbose && !globalOptions.logLevel) {
      // map legacy verbose flag to debug level
      globalOptions.logLevel = 'debug'
    }
    if (globalOptions.logLevel) {
      setLogLevel(globalOptions.logLevel)
    }

    const options = thisCommand.opts<{ url?: string; kb: boolean }>()
    await bootstrapEnvironment({
      fsService: ctx.fsService,
      httpClient: ctx.httpClient,
      version: ctx.version,
      url: options.url,
      kb: options.kb,
    })
  })
}

if (require.main === module) {
  main()
}
