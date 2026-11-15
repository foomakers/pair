// #645 r0-2: real accounting and Pi JSON producer; stub host, no engine/network.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const { extractUsage } = await import(
  pathToFileURL(resolve('.claude/skills/pair-workflow-review-phase/scripts/cycle-runtime.mjs'))
)
const root = mkdtempSync(join(tmpdir(), 'usage-authority-'))
try {
  writeFileSync(
    join(root, 'agent-probe.jsonl'),
    JSON.stringify({
      type: 'assistant',
      requestId: 'request',
      message: {
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 5,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 20,
          output_tokens: 3,
        },
      },
    }),
  )
  const result = extractUsage({ transcriptsDir: root, runId: 'fixture', storyId: '645' })
  process.stdout.write(JSON.stringify({ type: 'authority', usage: result.records[0].usage }) + '\n')
} finally {
  rmSync(root, { recursive: true, force: true })
}
const installed = resolve('node_modules/@earendil-works/pi-coding-agent/dist')
const { SessionManager } = await import(pathToFileURL(join(installed, 'core/session-manager.js')))
const { runPrintMode } = await import(pathToFileURL(join(installed, 'modes/print-mode.js')))
let subscriber
process.exitCode = await runPrintMode(
  {
    session: {
      sessionManager: SessionManager.inMemory('/fixture'),
      bindExtensions: async () => {},
      subscribe: listener => {
        subscriber = listener
        return () => {}
      },
      agent: { subscribe: () => () => {} },
      prompt: async () => {
        subscriber({
          type: 'message_end',
          message: {
            role: 'assistant',
            content: [],
            usage: {
              input: 5,
              cacheWrite: 100,
              cacheRead: 20,
              output: 7,
              reasoning: 4,
              totalTokens: 132,
            },
          },
        })
      },
    },
    setRebindSession: () => {},
    dispose: async () => {},
  },
  { mode: 'json', messages: ['stubbed usage host'] },
)
