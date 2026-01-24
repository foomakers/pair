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

  try {
    await bootstrapEnvironment({
      fsService,
      httpClient,
      version: pkg.version,
      url: options.url,
      kb: options.kb,
    })
  } catch (err) {
    console.error(
      chalk.red(`Environment setup failed: ${err instanceof Error ? err.message : String(err)}`),
    )
    process.exitCode = 1
    process.exit(1)
  }
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
