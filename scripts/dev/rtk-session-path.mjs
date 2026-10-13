#!/usr/bin/env node
// SessionStart hook: when .tools/bin/rtk exists, prepend .tools/bin to PATH for the session's Bash
// commands via $CLAUDE_ENV_FILE (created if missing, existing content kept). Otherwise a silent no-op.
import { appendFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const bin = join(root, '.tools/bin')
const file = process.env.CLAUDE_ENV_FILE
try {
  if (file && existsSync(join(bin, 'rtk')))
    appendFileSync(file, `export PATH='${bin.replaceAll("'", "'\\''")}':"$PATH"\n`)
} catch {
  process.exit(0)
}
