#!/usr/bin/env node
import { Command } from 'commander'
import { readFileSync } from 'fs'
import { join, isAbsolute } from 'path'
import chalk from 'chalk'

import { updateCommand } from './commands/update'
import { installCommand } from './commands/install'
import { updateLinkCommand } from './commands/update-link'
import { packageCommand } from './commands/package'
import { parseInstallUpdateArgs } from './commands/command-utils'
import { fileSystemService, FileSystemService, Behavior, setLogLevel } from '@pair/content-ops'
import {
  validateConfig,
  getKnowledgeHubDatasetPath,
  getKnowledgeHubDatasetPathWithFallback,
  loadConfigWithOverrides,
  isInRelease,
} from './config-utils'
import { LogLevel } from '@pair/content-ops'
import { validateKBUrl } from './kb-manager/url-validator'
import { validateCliOptions } from './kb-manager/cli-options'

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))

const program = new Command()

program
  .name(chalk.blue(pkg.name))
  .description(pkg.description)
  .version(pkg.version)
  .option('--url <url>', 'Custom URL for KB download (overrides default GitHub release)')
  .option('--no-kb', 'Skip knowledge base download')

const MIN_LOG_LEVEL: LogLevel = 'INFO'
setLogLevel(MIN_LOG_LEVEL)

// Diagnostic logging: enable by setting PAIR_DIAG=1 in the environment. This
// prints key runtime values so we can reproduce CI vs local differences when
// resolving the knowledge-hub dataset.
const diagEnv = process.env['PAIR_DIAG']
const fsService = fileSystemService
const DIAG = diagEnv === '1' || diagEnv === 'true'
if (DIAG) {
  try {
    console.error(`[diag] __dirname=${fsService.rootModuleDirectory()}`)
    console.error(`[diag] process cwd=${fsService.currentWorkingDirectory()}`)
    console.error(`[diag] argv=${process.argv.join(' ')}`)
    console.error(
      `[diag] isInRelease(__dirname)=${isInRelease(fsService, fsService.rootModuleDirectory())}`,
    )
    try {
      const resolved = getKnowledgeHubDatasetPath(fsService)
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

async function ensureKBAvailableOnStartup(
  fsService: FileSystemService,
  version: string,
  customUrl?: string,
  skipKB?: boolean,
): Promise<void> {
  // Skip KB download if --no-kb flag is set
  if (skipKB) {
    if (DIAG) console.error('[diag] Skipping KB download (--no-kb flag set)')
    return
  }

  try {
    // Try to get local dataset first
    const datasetPath = getKnowledgeHubDatasetPath(fsService)
    if (fsService.existsSync(datasetPath)) {
      if (DIAG) console.error('[diag] Using local dataset')
      return
    }
  } catch {
    // Local dataset not available, will fallback to KB manager
    if (DIAG) console.error('[diag] Local dataset not available, using KB manager')
  }

  // Validate custom URL if provided
  if (customUrl) {
    try {
      validateKBUrl(customUrl)
      if (DIAG) console.error(`[diag] Using custom URL: ${customUrl}`)
    } catch (err) {
      console.error(chalk.red(`Invalid --url parameter: ${err}`))
      process.exitCode = 1
      process.exit(1)
    }
  }

  // Fallback to KB manager
  try {
    const datasetPath = await getKnowledgeHubDatasetPathWithFallback(
      fsService,
      version,
      undefined,
      undefined,
      customUrl,
    )
    if (DIAG) console.error(`[diag] KB dataset available at: ${datasetPath}`)
  } catch (err) {
    console.error(chalk.red(`[startup] Failed to ensure KB available: ${err}`))
    process.exitCode = 1
    process.exit(1)
  }
}

export function checkKnowledgeHubDatasetAccessible(fsService: FileSystemService): void {
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

async function main() {
  // Parse global options
  program.parse(process.argv)
  const options = program.opts<{ url?: string; kb: boolean }>()

  // Validate option combinations
  try {
    validateCliOptions({ ...(options.url && { url: options.url }), kb: options.kb })
  } catch (err) {
    console.error(chalk.red(`Invalid options: ${err}`))
    process.exitCode = 1
    process.exit(1)
  }

  // Ensure KB is available before running commands
  await ensureKBAvailableOnStartup(fileSystemService, pkg.version, options.url, !options.kb)

  // Skip dataset check if --no-kb is set
  if (options.kb !== false) {
    checkKnowledgeHubDatasetAccessible(fileSystemService)
  }

  // Register package command
  packageCommand(program)

  program.parse(process.argv)
}

main().catch(err => {
  console.error(chalk.red(`Fatal error: ${err}`))
  process.exit(1)
})

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
  .option(
    '--link-style <style>',
    'Link style: relative, absolute, or auto (default: relative for install)',
  )
  .action((targetArg: unknown, cmdOptions: unknown) => {
    return handleInstallCommand(targetArg, cmdOptions, fsService).then(() => undefined)
  })

function buildInstallOptions(
  fsService: FileSystemService,
  rawArgs: string[],
  cmdOptions: unknown,
): {
  argsToPass: string[]
  opts: Record<string, unknown>
} {
  const first = rawArgs[0]
  const argsToPass = first && !first.startsWith('--') ? ['--target', first] : rawArgs

  const { baseTarget, useDefaults } = parseInstallUpdateArgs(argsToPass)
  const resolvedBaseTarget = resolveBaseTarget(fsService, baseTarget)
  const parsedRec = getParsedOpts(cmdOptions)

  const opts: Record<string, unknown> = { useDefaults }
  if (parsedRec?.['config']) opts['customConfigPath'] = parsedRec['config']
  if (resolvedBaseTarget) opts['baseTarget'] = resolvedBaseTarget
  if (parsedRec) addLinkStyleToOpts(opts, parsedRec)
  opts['minLogLevel'] = MIN_LOG_LEVEL

  return { argsToPass, opts }
}

function resolveBaseTarget(fsService: FileSystemService, baseTarget: string | null): string | null {
  if (!baseTarget || isAbsolute(baseTarget)) return baseTarget
  return fsService.resolve(fsService.currentWorkingDirectory(), baseTarget)
}

function addLinkStyleToOpts(opts: Record<string, unknown>, parsedRec: Record<string, unknown>) {
  if (!parsedRec['linkStyle']) return
  const style = String(parsedRec['linkStyle'])
  if (style === 'relative' || style === 'absolute' || style === 'auto') {
    opts['linkStyle'] = style
  }
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
  fsService: FileSystemService,
): Promise<CmdResult | void> {
  const arr = Array.isArray(targetArg) ? targetArg : targetArg ? [String(targetArg)] : []
  try {
    const { argsToPass, opts } = buildInstallOptions(fsService, arr, cmdOptions)
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
function buildUpdateArgs(
  fsService: FileSystemService,
  cmdOptions: CommandOptions,
): { args: string[]; useDefaults: boolean } {
  const args: string[] = []
  let useDefaults = true
  if (cmdOptions.positionalTarget) {
    let targetStr = String(cmdOptions.positionalTarget)
    try {
      const isAbsolutePath = isAbsolute(targetStr)
      if (!isAbsolutePath) {
        targetStr = fsService.resolve(fsService.currentWorkingDirectory(), targetStr)
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
  fsService: FileSystemService,
): Promise<{ success?: boolean; message?: string } | void> {
  if (cmdOptions.listTargets) {
    handleUpdateListTargets(fsService, cmdOptions)
    return
  }

  try {
    const datasetRoot = validateUpdateConfigAndGetRoot(fsService, cmdOptions)
    const { args, useDefaults } = buildUpdateArgs(fsService, cmdOptions)
    const opts = buildUpdateCommandOpts(cmdOptions, datasetRoot, useDefaults)
    const res = await updateCommand(fsService, args, opts)

    handleUpdateResult(res, useDefaults)
  } catch (err) {
    console.error(chalk.red(String(err)))
    process.exitCode = 1
  }
}

function buildUpdateCommandOpts(
  cmdOptions: CommandOptions,
  datasetRoot: string,
  useDefaults: boolean,
): Record<string, unknown> {
  const opts: Record<string, unknown> = { datasetRoot, useDefaults }
  if (cmdOptions.config) opts['customConfigPath'] = cmdOptions.config
  if ('linkStyle' in cmdOptions && cmdOptions.linkStyle) {
    const style = String(cmdOptions.linkStyle)
    if (style === 'relative' || style === 'absolute' || style === 'auto') {
      opts['linkStyle'] = style
    }
  }
  opts['minLogLevel'] = MIN_LOG_LEVEL
  return opts
}

function handleUpdateResult(
  res: { success?: boolean; message?: string } | undefined,
  useDefaults: boolean,
): void {
  if (!res) {
    console.error(chalk.red('[update] failed: Command returned undefined'))
    return
  }

  if (res.success) {
    const msg = useDefaults
      ? '[update] success - used default targets from config'
      : '[update] success - updated specified registries'
    console.log(chalk.green(msg))
  } else {
    console.error(chalk.red(`[update] failed: ${'message' in res ? res.message : 'Unknown error'}`))
    process.exitCode = 1
  }
}
/**
 * Handle the --list-targets flag for update command
 */
function handleUpdateListTargets(fsService: FileSystemService, cmdOptions: CommandOptions): void {
  const { config } = cmdOptions.config
    ? loadConfigWithOverrides(fsService, {
        customConfigPath: cmdOptions.config,
        projectRoot: fsService.currentWorkingDirectory(),
      })
    : loadConfigWithOverrides(fsService, {
        projectRoot: fsService.currentWorkingDirectory(),
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
    return cmdOptions.config
      ? join(fsService.currentWorkingDirectory(), 'dataset')
      : getKnowledgeHubDatasetPath(fsService)
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
  .option(
    '--link-style <style>',
    'Link style: relative, absolute, or auto (default: auto-detect for update)',
  )
  .option('--persist-backup', 'Keep backup files after successful update')
  .option('--auto-rollback', 'Automatically restore from backup on error (default: true)', true)
  .action(async (targetArg, cmdOptions) => {
    // Preserve backward compatibility for tests that call handleUpdateCommand({}, fs)
    const merged = { ...(cmdOptions as Record<string, unknown>), positionalTarget: targetArg }
    await handleUpdateCommand(merged, fsService)
  })

/**
 * Display update-link command results
 */
function displayUpdateLinkResults(result: Awaited<ReturnType<typeof updateLinkCommand>>): void {
  if (result.success) {
    console.log(chalk.green(`✅ ${result.message}`))
    if (result.stats) {
      console.log(chalk.blue('\n📊 Summary:'))
      console.log(chalk.gray(`  • Path mode: ${result.pathMode || 'relative'}`))
      if (result.dryRun) {
        console.log(chalk.yellow(`  • Mode: DRY RUN (no files modified)`))
      }
      console.log(chalk.gray(`  • Total links processed: ${result.stats.totalLinks}`))
      console.log(chalk.gray(`  • Files modified: ${result.stats.filesModified}`))

      if (result.stats.linksByCategory && Object.keys(result.stats.linksByCategory).length > 0) {
        console.log(chalk.blue('\n🔗 Links by transformation:'))
        for (const [category, count] of Object.entries(result.stats.linksByCategory)) {
          console.log(chalk.gray(`  • ${category}: ${count}`))
        }
      }
    }
  } else {
    console.error(chalk.red(`❌ ${result.message}`))
    process.exitCode = 1
  }
}

program
  .command('update-link')
  .description('Validate and update links in installed Knowledge Base content')
  .option('--relative', 'Convert all links to relative paths (default)')
  .option('--absolute', 'Convert all links to absolute paths')
  .option('--dry-run', 'Show what would be changed without modifying files')
  .option('--verbose', 'Show detailed processing information')
  .addHelpText(
    'after',
    `
Examples:
  $ pair update-link                      Validate and convert links to relative paths
  $ pair update-link --dry-run            Preview changes without modifying files
  $ pair update-link --absolute           Convert all links to absolute paths
  $ pair update-link --verbose            Show detailed processing logs

Usage Notes:
  • Default behavior converts all links to relative paths
  • Creates automatic backup before modifications
  • Skips external URLs and mailto links
  • Processes all markdown files in .pair/ directory

See also: docs/getting-started/05-cli-update-link.md
`,
  )
  .action(async cmdOptions => {
    try {
      const args: string[] = []
      const opts = cmdOptions as Record<string, unknown>

      if (opts['relative']) args.push('--relative')
      if (opts['absolute']) args.push('--absolute')
      if (opts['dryRun']) args.push('--dry-run')
      if (opts['verbose']) args.push('--verbose')

      const result = await updateLinkCommand(fsService, args, { minLogLevel: MIN_LOG_LEVEL })
      displayUpdateLinkResults(result)
    } catch (err) {
      console.error(chalk.red(`Failed to update links: ${String(err)}`))
      process.exitCode = 1
    }
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
