#!/usr/bin/env node
// Runs shell commands concurrently, waits for all, exits non-zero if any failed.
import { spawn } from 'node:child_process'

const codes = await Promise.all(
  process.argv.slice(2).map(
    cmd => new Promise(done => spawn(cmd, { shell: true, stdio: 'inherit' }).on('close', c => done(c ?? 1))),
  ),
)
process.exit(codes.some(c => c !== 0) ? 1 : 0)
