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
} from '@pair/content-ops'
import { bootstrapEnvironment } from './config'
import { runDiagnostics, MIN_LOG_LEVEL } from './diagnostics'

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
    // Prevent Commander from calling process.exit() automatically
    .exitOverride()

  runDiagnostics(fsService)
  setupCommands(program, { fsService, httpClient, version: pkg.version })

  // Use preAction hook to ensure environment is READY before command logic runs
  program.hook('preAction', async thisCommand => {
    const options = thisCommand.opts<{ url?: string; kb: boolean }>()
    await bootstrapEnvironment({
      fsService,
      httpClient,
      version: pkg.version,
      url: options.url,
      kb: options.kb,
    })
  })

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

    const message = err instanceof Error ? err.message : String(err)

    // Distinguish between environment errors and command execution errors if possible,
    // but centralize colors and exit logic here.
    console.error(chalk.red(`Error: ${message}`))

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

    await dispatchCommand(config, fsService, httpClient, version)
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

if (require.main === module) {
  main()
}
