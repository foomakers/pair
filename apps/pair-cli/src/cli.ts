#!/usr/bin/env node
import { Command } from 'commander'
import { readFileSync } from 'fs'
import { join, isAbsolute, resolve } from 'path'
import chalk from 'chalk'

import { updateCommand } from './commands/update'
import { installCommand } from './commands/install'
import { parseInstallUpdateArgs } from './commands/command-utils'
import { fileSystemService, FileSystemService, Behavior, setLogLevel } from '@pair/content-ops'
import {
  validateConfig,
  getKnowledgeHubDatasetPath,
  loadConfigWithOverrides,
  isInRelease,
} from './config-utils'
import { LogLevel } from '@pair/content-ops'

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))

const program = new Command()

program.name(chalk.blue(pkg.name)).description(pkg.description).version(pkg.version)

const MIN_LOG_LEVEL: LogLevel = 'INFO'
setLogLevel(MIN_LOG_LEVEL)

// Diagnostic logging: enable by setting PAIR_DIAG=1 in the environment. This
// prints key runtime values so we can reproduce CI vs local differences when
// resolving the knowledge-hub dataset.
const diagEnv = process.env['PAIR_DIAG']
const DIAG = diagEnv === '1' || diagEnv === 'true'
if (DIAG) {
  try {
    console.error(`[diag] __dirname=${__dirname}`)
    console.error(`[diag] process.cwd=${process.cwd()}`)
    console.error(`[diag] argv=${process.argv.join(' ')}`)
    console.error(`[diag] isInRelease(__dirname)=${isInRelease(__dirname)}`)
    try {
      const resolved = getKnowledgeHubDatasetPath(fileSystemService, __dirname)
      console.error(`[diag] getKnowledgeHubDatasetPath resolved to: ${resolved}`)
    } catch (err) {
      console.error(`[diag] getKnowledgeHubDatasetPath threw: ${String(err)}`)
      if (err && (err as Error).stack) console.error((err as Error).stack)
    }
  } catch (err) {
    // Avoid crashing diagnostics
    console.error('[diag] failed to emit diagnostics', String(err))
  }
}

function checkKnowledgeHubDatasetAccessible(fsService: FileSystemService): void {
  const datasetPath = getKnowledgeHubDatasetPath()
  try {
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
    console.error(
      chalk.red(
        `[startup] failed to resolve knowledge-hub dataset. Expected folder is ${datasetPath}. Error is: ${err}`,
      ),
    )
    process.exitCode = 1
    process.exit(1)
  }
}

checkKnowledgeHubDatasetAccessible(fileSystemService)

interface AssetRegistryConfig {
  source?: string
  behavior: Behavior
  include?: string[]
  target_path: string
  description: string
}

interface CommandOptions {
  config?: string
  listTargets?: boolean
  // Optional positional target forwarded from commander action
  positionalTarget?: unknown
}

program
  .command('install')
  .description('Install documentation and assets')
  .argument('[target]', 'Target folder (omit to use defaults from config)')
  .option('-c, --config <file>', 'Path to config file (if provided, uses this config)')
  .option('--list-targets', 'List available target folders and their descriptions')
  .action((targetArg: unknown, cmdOptions: unknown) => {
    return handleInstallCommand(targetArg, cmdOptions).then(() => undefined)
  })

function buildInstallOptions(
  rawArgs: string[],
  cmdOptions: unknown,
): {
  argsToPass: string[]
  opts: Record<string, unknown>
} {
  const first = rawArgs[0]
  const argsToPass = first && !first.startsWith('--') ? ['--target', first] : rawArgs

  const { baseTarget, useDefaults } = parseInstallUpdateArgs(argsToPass)

  // Resolve relative baseTarget against the current working directory
  let resolvedBaseTarget = baseTarget
  if (baseTarget && !isAbsolute(baseTarget)) {
    resolvedBaseTarget = resolve(process.cwd(), baseTarget)
  }

  const parsedRec = getParsedOpts(cmdOptions)

  const opts: Record<string, unknown> = {
    useDefaults,
  }
  if (parsedRec && parsedRec['config'])
    (opts as Record<string, unknown>)['customConfigPath'] = parsedRec['config']
  if (resolvedBaseTarget) (opts as Record<string, unknown>)['baseTarget'] = resolvedBaseTarget
  ;(opts as Record<string, unknown>)['minLogLevel'] = MIN_LOG_LEVEL

  return { argsToPass, opts }
}

function getParsedOpts(cmdOptions: unknown): Record<string, unknown> {
  let parsed: unknown = cmdOptions
  if (cmdOptions && typeof (cmdOptions as { opts?: unknown }).opts === 'function') {
    const optsFn = (cmdOptions as { opts: () => Record<string, unknown> }).opts
    if (typeof optsFn === 'function') parsed = optsFn()
  }
  const parsedRec = parsed as Record<string, unknown>
  return { ...(parsedRec || {}) }
}

type CmdResult = { success?: boolean; message?: string; target?: string }

export async function handleInstallCommand(
  targetArg: unknown,
  cmdOptions: unknown,
  fsService: FileSystemService = fileSystemService,
): Promise<CmdResult | void> {
  const arr = Array.isArray(targetArg) ? targetArg : targetArg ? [String(targetArg)] : []
  try {
    const { argsToPass, opts } = buildInstallOptions(arr, cmdOptions)
    const res = (await installCommand(fsService, argsToPass, opts)) as CmdResult

    if (res && res.success) {
      console.log(chalk.green(`[install] success - target ${res.target || ''}`))
    } else {
      console.error(
        chalk.red(`[install] failed: ${res && res.message ? res.message : 'Unknown error'}`),
      )
      process.exitCode = 1
    }

    return res
  } catch (err) {
    console.error(chalk.red(String(err)))
    process.exitCode = 1
    return { success: false, message: String(err) }
  }
}
function buildUpdateArgs(cmdOptions: CommandOptions): { args: string[]; useDefaults: boolean } {
  const args: string[] = []
  let useDefaults = true
  if (cmdOptions.positionalTarget) {
    let targetStr = String(cmdOptions.positionalTarget)
    try {
      const isAbsolutePath = isAbsolute(targetStr)
      if (!isAbsolutePath) {
        targetStr = resolve(process.cwd(), targetStr)
      }
    } catch {
      // ignore resolution errors and fall back to provided string
    }
    args.push('--target', targetStr)
    useDefaults = false
  }
  return { args, useDefaults }
}

/**
 * Handle the update command action
 */
export async function handleUpdateCommand(
  cmdOptions: CommandOptions,
  fsService: FileSystemService = fileSystemService,
): Promise<{ success?: boolean; message?: string } | void> {
  if (cmdOptions.listTargets) {
    handleUpdateListTargets(cmdOptions)
    return
  }

  try {
    const datasetRoot = validateUpdateConfigAndGetRoot(fsService, cmdOptions)

    const { args, useDefaults } = buildUpdateArgs(cmdOptions)

    // Execute update command
    const opts: Record<string, unknown> = { datasetRoot, useDefaults }
    if (cmdOptions.config) opts['customConfigPath'] = cmdOptions.config
    opts['minLogLevel'] = MIN_LOG_LEVEL

    const res = await updateCommand(fsService, args, opts)
    if (!res) {
      console.error(chalk.red('[update] failed: Command returned undefined'))
      return
    }

    if (res.success) {
      if (useDefaults) {
        console.log(chalk.green(`[update] success - used default targets from config`))
      } else {
        console.log(chalk.green(`[update] success - updated specified registries`))
      }
    } else {
      console.error(
        chalk.red(`[update] failed: ${'message' in res ? res.message : 'Unknown error'}`),
      )
      process.exitCode = 1
    }
  } catch (err) {
    console.error(chalk.red(String(err)))
    process.exitCode = 1
  }
}
/**
 * Handle the --list-targets flag for update command
 */
function handleUpdateListTargets(cmdOptions: CommandOptions): void {
  const { config } = cmdOptions.config
    ? loadConfigWithOverrides(fileSystemService, {
        customConfigPath: cmdOptions.config,
        projectRoot: process.cwd(),
      })
    : loadConfigWithOverrides(fileSystemService, {
        projectRoot: process.cwd(),
      })
  console.log(chalk.blue('\n📁 Available asset registries:\n'))

  if (config.asset_registries) {
    Object.entries(config.asset_registries).forEach(([key, registry]) => {
      const reg = registry as AssetRegistryConfig
      const behavior = reg.behavior || 'unknown'
      const hasInclude = reg.include && Array.isArray(reg.include) && reg.include.length > 0
      const description = reg.description || `Asset registry: ${key}`

      const behaviorIcons: Record<string, string> = {
        add: '➕',
        mirror: '🔄',
        overwrite: '✏️',
        skip: '⏭️',
      }
      const behaviorIcon = behaviorIcons[behavior] || '❓'
      const selectiveIcon = hasInclude ? '🎯' : ''

      console.log(
        `  ${chalk.green(key.padEnd(10))} ${behaviorIcon}${selectiveIcon} ${chalk.yellow(
          String(reg.target_path).padEnd(15),
        )} ${description}`,
      )
    })
  }

  console.log(chalk.gray('\n💡 Usage examples:'))
  console.log(
    chalk.gray(
      '  pair update                     # Update all registries to their default targets',
    ),
  )
  console.log(
    chalk.gray('  pair update github:.github      # Update only github registry in .github'),
  )
  console.log(
    chalk.gray('  pair update github:.github adoption:.pair  # Update multiple registries'),
  )
  console.log(chalk.gray('  pair update --config ./my-config.json  # Use custom config file\n'))
}

/**
 * Parse registry overrides from command arguments
 */

/**
 * Validate config and determine dataset root for update
 */
function validateUpdateConfigAndGetRoot(
  fsService: FileSystemService,
  cmdOptions: CommandOptions,
): string {
  if (cmdOptions.config) {
    const configPath = cmdOptions.config
    try {
      JSON.parse(fsService.readFileSync(configPath))
      // TODO: validate config structure
    } catch (err) {
      console.error(chalk.red(`Failed to load config file ${configPath}: ${String(err)}`))
      process.exitCode = 1
      throw err
    }
  }

  try {
    return cmdOptions.config ? join(process.cwd(), 'dataset') : getKnowledgeHubDatasetPath()
  } catch {
    console.error(chalk.red('Unable to determine dataset root path'))
    process.exitCode = 1
    throw new Error('Unable to determine dataset root path')
  }
}

/**
 * Execute the update command with provided options
 */
// executeUpdateCommand removed; logic handled inside exported handleUpdateCommand

program
  .command('update')
  .description('Update documentation and assets')
  .argument('[target]', 'Target folder (omit to use defaults from config)')
  .option('-c, --config <file>', 'Path to config file (if provided, uses this config)')
  .option('--list-targets', 'List available target folders and their descriptions')
  .action(async (targetArg, cmdOptions) => {
    // Preserve backward compatibility for tests that call handleUpdateCommand({}, fs)
    const merged = { ...(cmdOptions as Record<string, unknown>), positionalTarget: targetArg }
    await handleUpdateCommand(merged)
  })

program
  .command('validate-config')
  .description('Validate the asset registry configuration')
  .action(async () => {
    try {
      const { config } = loadConfigWithOverrides(fileSystemService)
      const validation = validateConfig(config)

      if (validation.valid) {
        console.log(chalk.green('✅ Configuration is valid!'))
        console.log(
          chalk.gray(`Found ${Object.keys(config.asset_registries || {}).length} asset registries`),
        )
      } else {
        console.log(chalk.red('❌ Configuration has errors:'))
        validation.errors.forEach((error: string) => {
          console.log(chalk.red(`  • ${error}`))
        })
        process.exitCode = 1
      }
    } catch (err) {
      console.error(chalk.red(`Failed to validate config: ${String(err)}`))
      process.exitCode = 1
    }
  })

program.action(() => {
  console.log(chalk.green('Welcome to Pair CLI! Use --help to see available commands.'))
  console.log(
    chalk.gray('💡 Tip: Use "pair install --list-targets" to see available asset registries'),
  )
})

program.parse(process.argv)
