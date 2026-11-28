import { spawnSync } from 'node:child_process'

const TIMEOUT = 3_000
const MAX_OUTPUT = 2 * 1024 * 1024

// The probes are synchronous, but the engines must receive a request while stdin is still open.
const exchange = String.raw`
  const { spawn } = require('node:child_process')
  const [bin, args, messages, timeout, maxOutput] = JSON.parse(process.argv[1])
  const grouped = process.platform !== 'win32'
  const child = spawn(bin, args, { detached: grouped, stdio: ['pipe', 'pipe', 'ignore'] })
  const timer = setTimeout(() => finish(), timeout)
  let finished = false
  function finish(response) {
    if (finished) return
    finished = true
    clearTimeout(timer)
    try { process.kill(grouped ? -child.pid : child.pid, 'SIGKILL') } catch {}
    if (response) process.stdout.write(JSON.stringify(response))
  }
  process.once('SIGTERM', () => finish())
  process.once('SIGINT', () => finish())
  child.once('error', () => finish())
  child.once('close', () => finish())
  child.stdin.on('error', () => finish())
  const send = () => child.stdin.write(JSON.stringify(messages.shift()) + '\n')
  let expected = messages[0].id
  let total = 0
  let pending = ''
  child.stdout.setEncoding('utf8').on('data', chunk => {
    if (finished) return
    total += Buffer.byteLength(chunk)
    if (total > maxOutput) return finish()
    const lines = (pending + chunk).split('\n')
    pending = lines.pop()
    for (const line of lines) {
      let reply
      try { reply = JSON.parse(line) } catch { continue }
      if (reply?.id !== expected) continue
      if (messages.length === 0) return finish(reply)
      if (!reply.result) return finish()
      expected = messages[messages.length - 1].id
      while (messages.length) send()
    }
  })
  send()
`

/** Query a local engine over stdio with bounded startup and output. */
export function inventoryRequest(
  cwd: string,
  bin: string,
  args: readonly string[],
  messages: readonly object[],
): unknown {
  const input = JSON.stringify([bin, args, messages, TIMEOUT, MAX_OUTPUT])
  const result = spawnSync(process.execPath, ['--eval', exchange, input], {
    cwd,
    encoding: 'utf8',
    timeout: TIMEOUT + 1_000,
    maxBuffer: MAX_OUTPUT,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.status !== 0 || !result.stdout) return undefined
  try {
    return JSON.parse(result.stdout) as unknown
  } catch {
    return undefined
  }
}
