import { join, resolve } from 'path'
import { fileSystemService } from '@pair/content-ops'
import { movePathOps, copyPathOps } from '@pair/content-ops'
import { stripAllMarkers, applyTransformCommands, validateMarkers } from '@pair/content-ops'
import type { SyncOptions, SkillNameMap, CopyPathOpsResult } from '@pair/content-ops'

const DATASET = join(__dirname, '..', 'dataset')

export function parseJson(arg: string): Record<string, unknown> {
  // try parse as JSON string first
  try {
    return JSON.parse(arg)
  } catch {
    void 0
  }
  // else treat as path to JSON file
  const content = fileSystemService.readFileSync(arg)
  return JSON.parse(content)
}

export function parseOptions(arg?: string): SyncOptions | undefined {
  if (!arg) return undefined
  try {
    const { prefix, flatten, targets, ...rest } = parseJson(arg)
    return {
      ...rest,
      flatten: typeof flatten === 'boolean' ? flatten : false,
      ...(typeof prefix === 'string' && { prefix }),
      targets: Array.isArray(targets) ? targets : [],
    } as SyncOptions
  } catch (err) {
    throw new Error(`Failed to parse options from arg: ${String(err)}`)
  }
}

export type TransferDatasetConfig = {
  source: string
  target: string
  mode?: 'copy' | 'move'
  options?: SyncOptions
  skillNameMap?: SkillNameMap
  /** Content transform: applies @{prefix}-skip removal then strips all markers. */
  transform?: { prefix: string }
  /** Strip all marker comments from the copied file. Default: false. */
  stripMarkers?: boolean
}

export async function runTransferDataset(
  config: TransferDatasetConfig,
  datasetRoot: string = DATASET,
): Promise<CopyPathOpsResult> {
  const { source, target, mode = 'move', options, skillNameMap } = config

  let result: CopyPathOpsResult
  if (mode === 'copy') {
    result = await copyPathOps({
      fileService: fileSystemService,
      source,
      target,
      datasetRoot,
      ...(options && { options }),
      ...(skillNameMap && { skillNameMap }),
    })
  } else {
    await movePathOps({
      fileService: fileSystemService,
      source,
      target,
      datasetRoot,
      ...(options && { options }),
    })
    result = {}
  }

  await applyContentTransform(config, datasetRoot)
  return result
}

/**
 * Applies content transform (marker processing) to the target file after copy.
 * - transform.prefix: removes @{prefix}-skip blocks, then strips all markers
 * - stripMarkers: strips all markers without prefix-specific removal
 */
async function applyContentTransform(
  config: TransferDatasetConfig,
  datasetRoot: string,
): Promise<void> {
  if (!config.transform && !config.stripMarkers) return

  const targetPath = join(datasetRoot, config.target)
  if (!targetPath.endsWith('.md')) return

  let content = await fileSystemService.readFile(targetPath)

  const errors = validateMarkers(content)
  if (errors.length > 0) {
    const details = errors.map(e => `  line ${String(e.line)}: ${e.message}`).join('\n')
    throw new Error(`Marker validation failed in ${config.target}:\n${details}`)
  }

  if (config.transform) {
    content = applyTransformCommands(content, config.transform.prefix)
  }
  content = stripAllMarkers(content)

  await fileSystemService.writeFile(targetPath, content)
}

/**
 * Runs multiple transfer steps sequentially, forwarding the skillNameMap
 * from any step that produces one to all subsequent steps.
 */
export async function runTransferPipeline(
  steps: TransferDatasetConfig[],
  datasetRoot: string = DATASET,
): Promise<CopyPathOpsResult> {
  let accumulatedMap: SkillNameMap | undefined

  for (const step of steps) {
    const config = accumulatedMap ? { ...step, skillNameMap: accumulatedMap } : step
    const result = await runTransferDataset(config, datasetRoot)
    if (result.skillNameMap && result.skillNameMap.size > 0) {
      accumulatedMap = result.skillNameMap
    }
  }

  return accumulatedMap ? { skillNameMap: accumulatedMap } : {}
}

// CLI execution logic
if (require.main === module) {
  const args = process.argv.slice(2)

  // Detect --root flag
  const rootIdx = args.indexOf('--root')
  let root = DATASET
  if (rootIdx !== -1) {
    const rootArg = args[rootIdx + 1]
    if (!rootArg) {
      console.error('--root requires a path argument')
      process.exit(1)
    }
    root = resolve(rootArg)
    args.splice(rootIdx, 2)
  }

  // Detect --pipeline flag
  const pipelineIdx = args.indexOf('--pipeline')
  if (pipelineIdx !== -1) {
    const pipelineArg = args[pipelineIdx + 1]
    if (!pipelineArg) {
      console.error('--pipeline requires a JSON array argument')
      process.exit(1)
    }
    const steps = JSON.parse(pipelineArg) as Array<{
      source: string
      target: string
      mode?: 'copy' | 'move'
      options?: Record<string, unknown>
      transform?: { prefix: string }
      stripMarkers?: boolean
    }>
    const configs: TransferDatasetConfig[] = steps.map(s => {
      const config: TransferDatasetConfig = { source: s.source, target: s.target }
      if (s.mode) config.mode = s.mode
      const opts = s.options ? parseOptions(JSON.stringify(s.options)) : undefined
      if (opts) config.options = opts
      if (s.transform) config.transform = s.transform
      if (s.stripMarkers) config.stripMarkers = s.stripMarkers
      return config
    })
    runTransferPipeline(configs, root)
      .then(() => console.log('Pipeline completed successfully'))
      .catch(err => {
        console.error('Unhandled error:', err)
        process.exit(1)
      })
  } else {
    // Single transfer mode (backward compatible)
    const [source, target, mode, optionsArg] = args
    if (!source || !target) {
      console.error(
        'Usage: ts-node src/transfer-dataset.ts [--root <path>] <source> <target> [mode] [optionsJsonOrFile]\n' +
          '       ts-node src/transfer-dataset.ts [--root <path>] --pipeline <json-array>',
      )
      process.exit(1)
    }

    const options = parseOptions(optionsArg)

    runTransferDataset(
      { source, target, mode: mode as 'copy' | 'move', ...(options && { options }) },
      root,
    )
      .then(() => console.log('Operation completed successfully'))
      .catch(err => {
        console.error('Unhandled error:', err)
        process.exit(1)
      })
  }
}
