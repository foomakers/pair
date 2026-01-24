import {
  copyDirHelper,
  copyFileHelper,
  detectLinkStyle,
  detectSourceType,
  SourceType,
} from '@pair/content-ops'
import { isAbsolute, dirname } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import { LogEntry, createLogger } from '../logger'

export { createLogger, type LogEntry }

export type CommandOptions = {
  datasetRoot?: string
  customConfigPath?: string
  baseTarget?: string
  useDefaults?: boolean
  minLogLevel?: LogEntry['level'] | string
}

interface ValidationCommandOptions {
  source?: string
  offline?: boolean
}

/**
 * Validate command options for consistency
 */
export function validateCommandOptions(_command: string, options: ValidationCommandOptions): void {
  const { source, offline } = options

  // Validate source not empty
  if (source !== undefined && source === '') {
    throw new Error('Source path/URL cannot be empty')
  }

  // Validate offline mode requirements
  if (offline) {
    if (!source) {
      throw new Error('Offline mode requires explicit --source with local path')
    }
    const sourceType = detectSourceType(source)
    if (sourceType === SourceType.REMOTE_URL) {
      throw new Error('Cannot use --offline with remote URL source')
    }
  }
}

export function parseTargetAndSource(args?: string[] | null) {
  if (!Array.isArray(args)) args = []
  const targetIndex = args.indexOf('--target')
  const target = targetIndex >= 0 && args[targetIndex + 1] ? args[targetIndex + 1] : null
  const sourceIndex = args.indexOf('--source')
  const source = sourceIndex >= 0 && args[sourceIndex + 1] ? args[sourceIndex + 1] : null
  return { target, source }
}

/**
 * Parse install/update arguments supporting multiple formats:
 * - No args: use defaults from config
 * - Single arg: base target folder for all registries
 */
export function parseInstallUpdateArgs(args: string[]) {
  if (!args || args.length === 0) {
    return { baseTarget: null, useDefaults: true }
  }

  const baseTarget = args.find(arg => !arg.startsWith('--')) || null
  return { baseTarget, useDefaults: false }
}

export async function ensureDir(fsService: FileSystemService, abs: string) {
  await fsService.mkdir(abs, { recursive: true })
}

export async function doCopyAndUpdateLinks(
  fsService: FileSystemService,
  copyOptions: {
    source: string
    target: string
    datasetRoot: string
    options?: Record<string, unknown>
  },
) {
  const { source, target, datasetRoot } = copyOptions

  const srcPath = isAbsolute(source) ? source : fsService.resolve(datasetRoot, source)
  const tgtPath = isAbsolute(target) ? target : fsService.resolve(datasetRoot, target)

  if (!(await fsService.exists(srcPath))) {
    return {}
  }

  const stat = await fsService.stat(srcPath)
  if (stat.isDirectory()) {
    await copyDirHelper({
      fileService: fsService,
      oldDir: srcPath,
      newDir: tgtPath,
      defaultBehavior: 'overwrite',
      datasetRoot,
    })
  } else {
    await fsService.mkdir(dirname(tgtPath), { recursive: true })
    await copyFileHelper(fsService, srcPath, tgtPath, 'overwrite')
  }

  return {}
}

/**
 * Apply link transformation after install/update
 */
export async function applyLinkTransformation(
  fsService: FileSystemService,
  options: { linkStyle?: 'relative' | 'absolute' | 'auto'; minLogLevel?: string },
  pushLog: (level: LogEntry['level'], message: string) => void,
  mode: 'install' | 'update',
): Promise<void> {
  const linkStyle = options.linkStyle
  if (!linkStyle) return

  pushLog('info', `Applying link transformation: ${linkStyle}`)

  try {
    let style: 'relative' | 'absolute' = 'relative'

    if (linkStyle === 'auto') {
      if (mode === 'update') {
        const kbPath = fsService.resolve('.pair')
        if (await fsService.exists(kbPath)) {
          style = await detectLinkStyle(fsService, kbPath)
          pushLog('info', `Auto-detected link style: ${style}`)
        }
      } else {
        style = 'relative'
      }
    } else {
      style = linkStyle
    }

    const { handleUpdateLinkCommand } = await import('./update-link/handler.js')
    await handleUpdateLinkCommand(
      {
        command: 'update-link',
        absolute: style === 'absolute',
        dryRun: false,
        verbose: options.minLogLevel === 'info' || options.minLogLevel === 'debug',
      },
      fsService,
    )
    pushLog('info', `Link transformation completed: ${style}`)
  } catch (err) {
    pushLog('warn', `Link transformation failed: ${String(err)}`)
  }
}

export { detectLinkStyle } from '@pair/content-ops'

export const calculatePathType = async (fsService: FileSystemService, path: string) => {
  const stat = await fsService.stat(path)
  return stat.isDirectory() ? 'dir' : 'file'
}

export function calculatePaths(
  fsService: FileSystemService,
  datasetRoot: string,
  absTarget: string,
  source?: string,
) {
  const fullSourcePath = fsService.resolve(datasetRoot, source || '.')
  const cwd = fsService.currentWorkingDirectory()

  const fullTargetPath = fsService.resolve(cwd, absTarget)

  const effectiveMonorepoRoot = fsService.currentWorkingDirectory()
  const canUseRelativePaths =
    fullSourcePath.startsWith(effectiveMonorepoRoot) &&
    fullTargetPath.startsWith(effectiveMonorepoRoot)
  const relativeSourcePath = canUseRelativePaths
    ? fullSourcePath.replace(effectiveMonorepoRoot + '/', '')
    : undefined
  const relativeTargetPath = canUseRelativePaths
    ? fullTargetPath.replace(effectiveMonorepoRoot + '/', '')
    : undefined

  return {
    fullSourcePath,
    cwd,
    monorepoRoot: effectiveMonorepoRoot,
    relativeSourcePath,
    fullTargetPath,
    relativeTargetPath,
  }
}
