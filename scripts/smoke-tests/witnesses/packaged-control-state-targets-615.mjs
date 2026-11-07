import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const result = spawnSync(
  process.execPath,
  [resolve(import.meta.dirname, 'packaged-control-state-615.mjs'), '--targets'],
  {
    encoding: 'utf8',
    timeout: 120_000,
  },
)
if (result.error) throw result.error
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
process.exitCode = result.status ?? 1
