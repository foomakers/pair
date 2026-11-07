import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const result = spawnSync(
  process.execPath,
  [resolve(import.meta.dirname, 'packaged-control-state-615.mjs'), '--precedence'],
  {
    encoding: 'utf8',
    timeout: 120_000,
  },
)
if (result.error) throw result.error
if (
  result.status === 0 &&
  result.stdout.includes('installed resolver precedes present reachable bundled fallback')
) {
  console.log('pass: installed resolver precedes present reachable bundled fallback')
} else {
  process.stderr.write(result.stderr || result.stdout)
  process.exitCode = result.status ?? 1
}
