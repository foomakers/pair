import { join } from 'path'
import { readFileSync } from 'fs'
import { fileSystemService } from '@pair/content-ops'
import { movePathOps, copyPathOps } from '@pair/content-ops'
import { SyncOptions } from '@pair/content-ops'

const DATASET = join(__dirname, '..', 'dataset')

function parseOptions(arg?: string) {
  if (!arg) return undefined
  // try parse as JSON string first
  try {
    return JSON.parse(arg)
  } catch {
    void 0
  }
  // else treat as path to JSON file
  try {
    const content = readFileSync(arg, 'utf-8')
    return JSON.parse(content)
  } catch (err) {
    throw new Error(`Failed to parse options from arg: ${String(err)}`)
  }
}

type TransferDatasetConfig = {
  source: string
  target: string
  mode?: 'copy' | 'move'
  options?: SyncOptions
}

async function runTransferDataset(config: TransferDatasetConfig) {
  const { source, target, mode = 'move', options } = config

  if (mode === 'copy') {
    return copyPathOps({
      fileService: fileSystemService,
      source,
      target,
      datasetRoot: DATASET,
      ...(options && { options }),
    })
  } else {
    return movePathOps({
      fileService: fileSystemService,
      source,
      target,
      datasetRoot: DATASET,
      ...(options && { options }),
    })
  }
}

// CLI execution logic
if (require.main === module) {
  const [source, target, mode, optionsArg] = process.argv.slice(2)
  if (!source || !target) {
    console.error(
      'Usage: ts-node src/transfer-dataset.ts <source> <target> [mode] [optionsJsonOrFile]  (mode defaults to "move")',
    )
    process.exit(1)
  }

  const options = parseOptions(optionsArg)

  runTransferDataset({ source, target, mode: mode as 'copy' | 'move', options })
    .then(() => {
      console.log('Operation completed successfully')
    })
    .catch(err => {
      console.error('Unhandled error:', err)
      process.exit(1)
    })
}
