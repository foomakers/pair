import { existsSync } from 'fs'
import { resolve } from 'path'

const dist = resolve(__dirname, '../../dist/cli.js')

/** Compiled CLI when built (~0.1 s start, `turbo test` always builds first); ts-node (~1 s) otherwise. */
export const CLI_ENTRY = existsSync(dist)
  ? [dist]
  : ['-r', 'ts-node/register/transpile-only', 'src/cli.ts']
