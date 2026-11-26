/// <reference types="node" preserve="true" />

import { spawn, type ChildProcess } from 'node:child_process'

export interface HostProcessResult {
  status: number | null
  stdout: string
  stderr: string
  error?: Error
}

function killHostGroup(child: ChildProcess): void {
  if (!child.pid) return
  try {
    process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL')
  } catch {
    /* exited */
  }
}

type ProcessOptions = { timeout?: number; onStdout?: (chunk: string) => void }
export type HostProcess = (
  bin: string,
  args: readonly string[],
  cwd: string,
  options?: ProcessOptions,
) => Promise<HostProcessResult>

type ProcessHooks = {
  track?: (child: ChildProcess) => void
  onStderr?: (stderr: string) => void
}

/** Run a host command without blocking interruption; bound and clean its whole process group. */
export async function runHostProcess(
  bin: string,
  args: readonly string[],
  cwd: string,
  options: ProcessOptions & ProcessHooks = {},
): Promise<HostProcessResult> {
  const { timeout = 30_000, onStdout, track, onStderr } = options
  return await new Promise(resolve => {
    const child = spawn(bin, args, {
      cwd,
      detached: process.platform !== 'win32',
      env: { ...process.env, PAIR_HOST_GROUP_MANAGED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    track?.(child)
    let stdout = ''
    let stderr = ''
    let error: Error | undefined
    child.stdout.setEncoding('utf8').on('data', chunk => {
      stdout += String(chunk)
      onStdout?.(String(chunk))
    })
    child.stderr.setEncoding('utf8').on('data', chunk => {
      stderr += String(chunk)
    })
    const timer =
      timeout > 0
        ? setTimeout(() => {
            error = new Error(`host command timed out after ${String(timeout)}ms`)
            killHostGroup(child)
          }, timeout)
        : undefined
    child.once('error', cause => {
      error = cause
    })
    child.once('exit', () => killHostGroup(child))
    child.once('close', status => {
      clearTimeout(timer)
      onStderr?.(stderr)
      resolve({ status, stdout, stderr, ...(error ? { error } : {}) })
    })
  })
}
