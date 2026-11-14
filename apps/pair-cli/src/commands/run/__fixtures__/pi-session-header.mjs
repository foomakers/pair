// #645 r0-8: exercise the installed header producer; no engine or host process.
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const installed = resolve('node_modules/@earendil-works/pi-coding-agent/dist')
const { SessionManager } = await import(
  pathToFileURL(resolve(installed, 'core/session-manager.js'))
)
const { runPrintMode } = await import(pathToFileURL(resolve(installed, 'modes/print-mode.js')))
const sessionManager = SessionManager.inMemory('/fixture', {
  id: '12345678-1234-4234-8234-123456789abc',
})
let subscriber
const exitCode = await runPrintMode(
  {
    session: {
      sessionManager,
      bindExtensions: async () => {},
      subscribe: listener => {
        subscriber = listener
        return () => {}
      },
      agent: { subscribe: () => () => {} },
      prompt: async () => {
        subscriber({
          type: 'message_end',
          message: { role: 'assistant', content: [], usage: { input: 4, cacheRead: 7, output: 2 } },
        })
      },
    },
    setRebindSession: () => {},
    dispose: async () => {},
  },
  { mode: 'json', messages: ['stubbed host: emit measured assistant event'] },
)
process.exitCode = exitCode
