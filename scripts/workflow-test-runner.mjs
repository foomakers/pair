import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isNodeTestCandidate, planWorkflowTests, shardArguments } from './workflow-shards.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../.claude/workflows')
const board = 'pair-contracts/board-sync.test.mjs'
const knownHash = 'd944992f63e07ca0eb0f557a5470d88a06d49e52fb9412009e4b9cd5bfb758f3'

function candidates(dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return candidates(path)
    const name = relative(root, path).replaceAll('\\', '/')
    return isNodeTestCandidate(name) ? [name] : []
  })
}

function run(args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['--test', ...args], { cwd: root, stdio: 'inherit' })
    child.once('error', () => resolve(1))
    child.once('close', code => resolve(code ?? 1))
  })
}

let hash
try {
  hash = createHash('sha256')
    .update(readFileSync(join(root, board)))
    .digest('hex')
} catch {
  hash = undefined
}
const knownSuite =
  hash === knownHash && process.allowedNodeEnvironmentFlags.has('--test-skip-pattern')
const rest = planWorkflowTests(candidates(), knownSuite)
if (rest === null) {
  process.exitCode = await run([])
} else {
  const results = await Promise.all([
    run(rest),
    ...shardArguments.map(args => run([...args, board])),
  ])
  process.exitCode = results.every(code => code === 0) ? 0 : 1
}
