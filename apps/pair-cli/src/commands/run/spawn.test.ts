import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildEngineArgs, spawnIteration } from './spawn'
import { ENGINES } from './engines'

describe('buildEngineArgs', () => {
  it('puts the prompt last, as ONE argv element (never a shell string)', () => {
    const args = buildEngineArgs({
      engine: ENGINES.claude,
      promptText: '/pair-loop --root 212',
      cwd: '/project',
      autonomyArgs: [],
    })

    expect(args).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '/pair-loop --root 212',
    ])
    expect(args.at(-1)).toBe('/pair-loop --root 212')
  })

  it('passes the working directory through the flag the engine map declares', () => {
    expect(
      buildEngineArgs({
        engine: ENGINES.opencode,
        promptText: 'go',
        cwd: '/project',
        autonomyArgs: [],
      }),
    ).toEqual(['run', '--format', 'json', '--dir', '/project', 'go'])
  })

  it('carries the autonomy args when the operator opted in', () => {
    expect(
      buildEngineArgs({
        engine: ENGINES.claude,
        promptText: 'go',
        cwd: '/project',
        autonomyArgs: ['--permission-mode', 'bypassPermissions'],
      }),
    ).toContain('bypassPermissions')
  })

  it('never constructs a merge command, on any engine or posture (AC10)', () => {
    for (const engine of Object.values(ENGINES)) {
      for (const autonomyArgs of [[], ['--auto'], ['--permission-mode', 'bypassPermissions']]) {
        const args = buildEngineArgs({
          engine,
          promptText: '/pair-loop --root 212',
          cwd: '/project',
          autonomyArgs,
        })

        expect(args.join(' ')).not.toMatch(/\bmerge\b/)
      }
    }
  })
})

describe('spawnIteration — a real child process emitting fixture JSONL', () => {
  /** A stub "engine": a node script that prints a recorded stream and exits. */
  function stubEngine(script: string) {
    const dir = mkdtempSync(join(tmpdir(), 'pair-run-'))
    const file = join(dir, 'engine.js')
    writeFileSync(file, script)
    return { dir, file }
  }

  it('reads the outcome from the stream of a fresh process', async () => {
    const { dir, file } = stubEngine(
      `process.stdout.write(JSON.stringify({type:'result',subtype:'success'}) + '\\n')`,
    )

    const result = await spawnIteration({
      engine: { ...ENGINES.claude, command: process.execPath, headlessArgs: [file] },
      promptText: 'go',
      cwd: dir,
      autonomyArgs: [],
      timeoutSeconds: 30,
    })

    expect(result.outcome).toBe('success')
  })

  it('fails an iteration whose process exits 0 with no terminal event (AC7)', async () => {
    const { dir, file } = stubEngine(
      `process.stdout.write('{"type":"system"}\\n'); process.exit(0)`,
    )

    const result = await spawnIteration({
      engine: { ...ENGINES.claude, command: process.execPath, headlessArgs: [file] },
      promptText: 'go',
      cwd: dir,
      autonomyArgs: [],
      timeoutSeconds: 30,
    })

    expect(result.outcome).toBe('failed')
    expect(result.detail).toContain('no terminal event')
  })

  it('does not hang on a process that waits for input — stdin is closed', async () => {
    // Reading stdin gets EOF immediately, so the stub reaches its terminal event.
    const { dir, file } = stubEngine(
      `let data='';process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>{process.stdout.write(JSON.stringify({type:'result',subtype:'success'})+'\\n')});process.stdin.resume()`,
    )

    const result = await spawnIteration({
      engine: { ...ENGINES.claude, command: process.execPath, headlessArgs: [file] },
      promptText: 'go',
      cwd: dir,
      autonomyArgs: [],
      timeoutSeconds: 30,
    })

    expect(result.outcome).toBe('success')
  })

  it('bounds an iteration that hangs, and the bounded iteration fails', async () => {
    const { dir, file } = stubEngine(`setTimeout(() => {}, 60000)`)

    const result = await spawnIteration({
      engine: { ...ENGINES.claude, command: process.execPath, headlessArgs: [file] },
      promptText: 'go',
      cwd: dir,
      autonomyArgs: [],
      timeoutSeconds: 1,
    })

    expect(result.outcome).toBe('failed')
  }, 20000)
})
