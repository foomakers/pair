import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildEngineArgs,
  spawnIteration,
  resolveIdleTimeout,
  DEFAULT_IDLE_TIMEOUT_SECONDS,
} from './spawn'
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

describe('spawnIteration — a stalled stage is named as one (US-506 T-8, AC12)', () => {
  it('an iteration stopped by its time bound reports `stalled`, distinguishable from a stream that simply ended without a terminal event', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pair-run-'))
    const hang = join(dir, 'engine.js')
    writeFileSync(hang, `setTimeout(() => {}, 60000)`)
    const stalled = await spawnIteration({
      engine: { ...ENGINES.claude, command: process.execPath, headlessArgs: [hang] },
      promptText: 'go',
      cwd: dir,
      autonomyArgs: [],
      timeoutSeconds: 1,
    })
    expect(stalled).toMatchObject({ outcome: 'failed', stalled: true })
    expect(stalled.detail).toMatch(/^stalled: no terminal event within 1s/)

    const ended = join(dir, 'ended.js')
    writeFileSync(ended, `process.stdout.write('{"type":"system"}\\n'); process.exit(0)`)
    const noEvent = await spawnIteration({
      engine: { ...ENGINES.claude, command: process.execPath, headlessArgs: [ended] },
      promptText: 'go',
      cwd: dir,
      autonomyArgs: [],
      timeoutSeconds: 30,
    })
    expect(noEvent.stalled).toBeUndefined()
  }, 20000)
})

describe('spawnIteration — the stall is classified the same on every CI platform (US-506 T-8)', () => {
  it.each([{ platform: 'darwin' }, { platform: 'linux' }] as const)(
    'with process.platform injected as $platform, a time-bound stop is `stalled`',
    async ({ platform }) => {
      const original = Object.getOwnPropertyDescriptor(process, 'platform')!
      Object.defineProperty(process, 'platform', { ...original, value: platform })
      try {
        const dir = mkdtempSync(join(tmpdir(), 'pair-run-'))
        const hang = join(dir, 'engine.js')
        writeFileSync(hang, `setTimeout(() => {}, 60000)`)
        const result = await spawnIteration({
          engine: { ...ENGINES.claude, command: process.execPath, headlessArgs: [hang] },
          promptText: 'go',
          cwd: dir,
          autonomyArgs: [],
          timeoutSeconds: 1,
        })
        expect(result).toMatchObject({ outcome: 'failed', stalled: true })
      } finally {
        Object.defineProperty(process, 'platform', original)
      }
    },
    20000,
  )
})

describe('spawnIteration — idle timeout, not a wall-clock kill (US-573 AC5)', () => {
  const stub = (script: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'pair-run-'))
    const file = join(dir, 'engine.js')
    writeFileSync(file, script)
    return {
      engine: { ...ENGINES.claude, command: process.execPath, headlessArgs: [file] },
      cwd: dir,
    }
  }

  it('an engine that keeps emitting events outlives the idle bound: every event resets the timer', async () => {
    const { engine, cwd } = stub(
      `let n=0;const t=setInterval(()=>{process.stdout.write(JSON.stringify({type:'system',n:n++})+'\\n');if(n===8){clearInterval(t);process.stdout.write(JSON.stringify({type:'result',subtype:'success'})+'\\n')}},300)`,
    )
    const result = await spawnIteration({
      engine,
      cwd,
      promptText: 'go',
      autonomyArgs: [],
      idleTimeoutSeconds: 1,
    })
    expect(result.outcome).toBe('success')
  }, 20000)

  it('silence past the idle bound stops the engine and names the last card/stage', async () => {
    const line = JSON.stringify({
      type: 'system',
      text: 'PAIR_EVENT {"event":"stage","card":"ENG-7","stage":"implement"}',
    })
    const { engine, cwd } = stub(
      `process.stdout.write(${JSON.stringify(line)}+'\\n');setTimeout(()=>{},60000)`,
    )
    const result = await spawnIteration({
      engine,
      cwd,
      promptText: 'go',
      autonomyArgs: [],
      idleTimeoutSeconds: 1,
    })
    expect(result).toMatchObject({ outcome: 'failed', cause: 'timed-out', stalled: true })
    expect(result.detail).toBe('timed out (idle) at ENG-7/implement — no engine event for 1s')
  }, 20000)

  it('the total cap applies only when given, and is reported as a timeout too', async () => {
    const { engine, cwd } = stub(
      `setInterval(()=>process.stdout.write('{"type":"system"}\\n'),200)`,
    )
    const result = await spawnIteration({
      engine,
      cwd,
      promptText: 'go',
      autonomyArgs: [],
      idleTimeoutSeconds: 5,
      timeoutSeconds: 1,
    })
    expect(result).toMatchObject({ outcome: 'failed', cause: 'timed-out', stalled: true })
  }, 20000)
})

describe('spawnIteration — engine env (US-573 AC7)', () => {
  const envProbe = (engine: typeof ENGINES.claude, script: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'pair-run-'))
    const file = join(dir, 'engine.js')
    writeFileSync(file, script)
    return spawnIteration({
      engine: { ...engine, command: process.execPath, headlessArgs: [file] },
      cwd: dir,
      promptText: 'go',
      autonomyArgs: [],
    })
  }

  it('claude runs with CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0', async () => {
    expect(ENGINES.claude.env).toEqual({ CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0' })
    const result = await envProbe(
      ENGINES.claude,
      `process.stdout.write(JSON.stringify({type:'result',subtype:process.env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS==='0'?'success':'missing'})+'\\n')`,
    )
    expect(result.outcome).toBe('success')
  })

  it.each(['pi', 'opencode', 'codex'] as const)('%s gets no engine env of its own', id => {
    expect(ENGINES[id].env).toBeUndefined()
  })
})

describe('resolveIdleTimeout — precedence flag > ## Stop Predicate > pair.config.json > default (US-573 AC5)', () => {
  it.each([
    [
      { flag: 60, policy: 120, declared: 240 },
      { seconds: 60, source: '--idle-timeout' },
    ],
    [
      { policy: 120, declared: 240 },
      { seconds: 120, source: '## Stop Predicate idle-timeout' },
    ],
    [{ declared: 240 }, { seconds: 240, source: 'pair.config.json engine.idleTimeout' }],
    [{}, { seconds: DEFAULT_IDLE_TIMEOUT_SECONDS, source: 'default' }],
  ])('%o', (input, expected) => {
    expect(resolveIdleTimeout(input)).toEqual(expected)
  })

  it('the default is 30 minutes', () => {
    expect(DEFAULT_IDLE_TIMEOUT_SECONDS).toBe(1800)
  })
})
