#!/usr/bin/env node
import { Command } from 'commander'
import { readFileSync } from 'fs'
import { join } from 'path'
import chalk from 'chalk'

import { commandRegistry } from './commands'
import { dispatchCommand } from './commands/dispatcher'
import { requiresKbBootstrap } from './commands/bootstrap-policy'
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

const PAIR_BLUE = '#0062FF'
const PAIR_TEAL = '#00D1FF'

function pairLogo(): string {
  const blue = chalk.hex(PAIR_BLUE)('██')
  const teal = chalk.hex(PAIR_TEAL)('██')
  const name = chalk.bold.white('pair')
  return `${blue} ${teal}  ${name}`
}

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
    .option(
      '--url <url|path>',
      'KB source used when a command names no --source (overrides default GitHub release)',
    )
    .option('-l, --log-level <level>', 'Set minimum log level (debug|info|warn|error)')
    .option('-v, --verbose', 'Enable verbose logging (deprecated; use --log-level debug)')
    // Currently a no-op: `kb === false` is read only behind the KB pre-flight, which never
    // runs (see `runKbPreflight`). Kept registered so scripts passing it don't break, and
    // said out loud here so `--help` doesn't promise a skip the CLI doesn't perform.
    .option('--no-kb', 'Currently a no-op (was: skip knowledge base download)')
    // Prevent Commander from calling process.exit() automatically
    .exitOverride()
    .configureHelp({ sortSubcommands: true })

  program.addHelpText(
    'beforeAll',
    `\n  ${pairLogo()} ${chalk.dim(`v${pkg.version}`)}\n  ${chalk.hex(PAIR_BLUE)('Code is the easy part.')}\n`,
  )
  program.addHelpText(
    'afterAll',
    `\n  Run ${chalk.dim('pair <command> --help')} for detailed usage of a specific command.\n`,
  )

  runDiagnostics(fsService)
  setupCommands(program, { fsService, httpClient, version: pkg.version })

  // Attach preAction hook
  attachPreActionHook(program, { fsService, httpClient, version: pkg.version })

  await program.parseAsync(argv)
}

export async function main() {
  try {
    await runCli(process.argv)
    // exitOverride() prevents Commander from calling process.exit() automatically.
    // Force exit so open handles (e.g. HTTP sockets from KB download) don't hang.
    process.exit(0)
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

    process.exit(1)
  }
}

function addCommandOptions(
  cmd: Command,
  options: readonly { flags: string; description: string; defaultValue?: unknown }[],
): void {
  for (const opt of options) {
    if (opt.flags.startsWith('[') || opt.flags.startsWith('<')) {
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
  const exLines = examples.map((ex: string) => `  ${chalk.dim('$')} ${ex}`).join('\n')
  const noteLines = notes.map((note: string) => `  ${chalk.dim('•')} ${note}`).join('\n')
  return `
${chalk.bold('Examples:')}
${exLines}

${chalk.bold('Usage Notes:')}
${noteLines}
`
}

function registerCommandFromMetadata(
  prog: Command,
  commandName: keyof typeof commandRegistry,
  deps: CommandDeps,
): void {
  const { fsService, httpClient, version } = deps
  const cmdConfig = commandRegistry[commandName]
  const cmd = prog
    .command(cmdConfig.metadata.name)
    .description(cmdConfig.metadata.description)
    // CLI-WIDE RULE (deliberate, every command): Commander tolerates extra positionals
    // by default, which silently swallows an unquoted option value (`--name Acme KB` →
    // name "Acme") and hides each parser's positional-arity validation. Rejecting them
    // is a behavior change for any command that used to ignore a stray argument, so it
    // is documented once as a cross-command rule in reference/cli/commands.mdx
    // ("Rules that apply to every command") and reference/specs/cli-contracts.mdx
    // ("CLI-Wide Rules") — not as a scaffold-kb detail. Pinned by cli.test.ts
    // ("CLI-wide rule: excess positional arguments are rejected").
    .allowExcessArguments(false)

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
    const configPath = normalizedOptions['config'] as string | undefined
    await dispatchCommand(config, fsService, {
      httpClient,
      cliVersion: version,
      ...(initCwd && { baseTarget: initCwd }),
      ...(configPath && { config: configPath }),
    })
  })
}

function setupCommands(prog: Command, deps: CommandDeps): void {
  Object.keys(commandRegistry).forEach(name => {
    registerCommandFromMetadata(prog, name as keyof typeof commandRegistry, deps)
  })

  prog.action((...actionArgs: unknown[]) => {
    const cmd = actionArgs[actionArgs.length - 1] as Command
    const unknownArgs = cmd.args
    if (unknownArgs.length > 0) {
      throw new Error(
        `Unknown command: ${unknownArgs[0]}\n\n  Run pair --help to see available commands.`,
      )
    }
    console.log(`  ${chalk.dim('Run')} pair --help ${chalk.dim('to see available commands.')}`)
    console.log(
      `  ${chalk.dim('Run')} pair install --list-targets ${chalk.dim('to see asset registries.')}\n`,
    )
  })
}

/**
 * Apply the program-level `--log-level` (or its legacy `--verbose` alias).
 *
 * It runs BEFORE any pre-flight guard, deliberately: it is a program-level flag, so it must
 * take effect for every command — including the KB-producing ones the pre-flight skips, and
 * including every command at all while `runKbPreflight` stays unreachable. It used to live
 * BELOW those guards, so `pair <cmd> --log-level debug` silently did nothing and the only
 * level ever applied was the module-level default (US-395 review round 14). A command-level
 * `--log-level` (`package`, `update-link`) is applied later in that handler and still wins.
 */
function applyGlobalLogLevel(prog: Command): void {
  const globalOptions = prog.opts<{ logLevel?: string; verbose?: boolean }>()
  if (globalOptions.verbose && !globalOptions.logLevel) {
    // map legacy verbose flag to debug level
    globalOptions.logLevel = 'debug'
  }
  if (globalOptions.logLevel) {
    setLogLevel(globalOptions.logLevel)
  }
}

/**
 * ⚠️ THIS FUNCTION NEVER RUNS PAST ITS FIRST LINE — deliberately, not accidentally.
 *
 * Commander invokes a program-level hook as `callback(hookedCommand, actionCommand)`, so
 * `thisCommand` IS `prog` for EVERY subcommand and the first guard always returns. The KB
 * pre-flight (`bootstrapEnvironment`) therefore never runs from the CLI, and with it
 * `validateCliOptions` (so `--no-kb` is inert) and the dataset accessibility probe.
 *
 * Left standing rather than repaired or deleted in US-395: reviving it makes every
 * KB-requiring command resolve — and potentially download — a KB before it runs, on top of
 * install/update's own resolution, i.e. a second fetch of the same source. That is a
 * behaviour change with its own blast radius, decided at the merge gate, not slipped into a
 * fix round. See the ADL
 * `.pair/adoption/decision-log/2026-08-11-kb-cache-slots-keyed-by-source-identity.md`
 * ("The KB pre-flight (`bootstrapEnvironment`) never runs"). A named source reaches the
 * command through the PARSERS (`namedSource` in `config/cli.ts`), not through here.
 */
async function runKbPreflight(args: {
  prog: Command
  thisCommand: Command
  actionCommand: Command
  ctx: { fsService: FileSystemService; httpClient: HttpClientService; version: string }
}): Promise<void> {
  const { prog, thisCommand, actionCommand, ctx } = args

  // Skip bootstrap for root command (no subcommand matched) — always true, see above
  if (thisCommand === prog) return

  // Skip bootstrap for KB-producing commands (package, scaffold-kb) — they don't need a KB
  if (!requiresKbBootstrap(actionCommand.name())) return

  const options = thisCommand.opts<{ url?: string; kb: boolean }>()
  await bootstrapEnvironment({
    fsService: ctx.fsService,
    httpClient: ctx.httpClient,
    version: ctx.version,
    url: options.url,
    kb: options.kb,
  })
}

function attachPreActionHook(
  prog: Command,
  ctx: { fsService: FileSystemService; httpClient: HttpClientService; version: string },
): void {
  prog.hook('preAction', async (thisCommand, actionCommand) => {
    // Suppress banner when --json is active (machine-readable output)
    const subOpts = actionCommand.opts<{ json?: boolean }>()
    if (!subOpts.json) {
      console.log(`\n  ${pairLogo()} ${chalk.dim(`v${ctx.version}`)}`)
      console.log(`  ${chalk.hex(PAIR_BLUE)('Code is the easy part.')}\n`)
    }

    applyGlobalLogLevel(prog)

    await runKbPreflight({ prog, thisCommand, actionCommand, ctx })
  })
}

if (require.main === module) {
  main()
}
