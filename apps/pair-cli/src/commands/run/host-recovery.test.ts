import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const kit = pathToFileURL(
  resolve(
    __dirname,
    '../../../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts/host/adapter-kit.mjs',
  ),
).href
const github = pathToFileURL(
  resolve(
    __dirname,
    '../../../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts/host/github.mjs',
  ),
).href
const dirs: string[] = []
function fixture(responses: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'pair-host-recovery-'))
  dirs.push(dir)
  const bin = join(dir, 'host')
  const count = join(dir, 'count')
  writeFileSync(
    bin,
    `#!/usr/bin/env node\nconst fs = require('node:fs'); const n = Number(fs.existsSync(${JSON.stringify(count)}) ? fs.readFileSync(${JSON.stringify(count)}, 'utf8') : 0) + 1; fs.writeFileSync(${JSON.stringify(count)}, String(n)); const responses = ${JSON.stringify(responses)}; const response = responses[Math.min(n - 1, responses.length - 1)]; if (response === 'ok') process.stdout.write('ok'); else { process.stderr.write(response); process.exitCode = 1; }`,
  )
  chmodSync(bin, 0o755)
  return { bin, count }
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('US-601 AC1: host transport recovery', () => {
  it('AC4: a lost create response is confirmed by marker read-back without a second write', async () => {
    const { upsertByMarker } = await import(kit)
    const rows: Array<{ id: number; url: string; body: string }> = []
    let writes = 0
    const result = upsertByMarker({
      marker: '<!-- pair:601 -->',
      body: 'text',
      max: 1000,
      list: () => rows,
      create: (body: string) => {
        writes++
        rows.push({ id: 1, url: 'comment/1', body })
        throw new Error('host-transient: ECONNRESET')
      },
      update: () => {
        throw new Error('unexpected update')
      },
    })
    expect(result).toMatchObject({ action: 'created', id: 1 })
    expect(writes).toBe(1)
  })

  it.each(['absent', 'ambiguous'])(
    'AC4: an uncertain %s marker read-back never replays the write',
    async after => {
      const { upsertByMarker } = await import(kit)
      let writes = 0
      let reads = 0
      expect(() =>
        upsertByMarker({
          marker: '<!-- pair:601 -->',
          body: 'text',
          max: 1000,
          list: () => {
            reads++
            return reads === 1 || after === 'absent'
              ? []
              : [1, 2].map(id => ({ id, url: `comment/${id}`, body: '<!-- pair:601 -->\ntext' }))
          },
          create: () => {
            writes++
            throw new Error('host-transient: ECONNRESET')
          },
          update: () => {
            throw new Error('unexpected update')
          },
        }),
      ).toThrow(/host-transient/)
      expect(writes).toBe(1)
    },
  )

  it('retries a transient read then returns its result', async () => {
    const { runCli } = await import(kit)
    const { bin, count } = fixture(['HTTP 503 Service Unavailable', 'ok'])
    expect(runCli({ bin, args: ['read'], label: 'host', replaySafe: true, sleep: () => {} })).toBe(
      'ok',
    )
    expect(readFileSync(count, 'utf8')).toBe('2')
  })

  it('AC5: reports retry and recovery with operation and attempt, without stderr detail', async () => {
    const { runCli } = await import(kit)
    const { bin } = fixture(['HTTP 503 credential-should-stay-private', 'ok'])
    const lines: string[] = []
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
      lines.push(String(chunk).trim())
      return true
    })
    try {
      expect(
        runCli({ bin, args: ['read'], label: 'host', replaySafe: true, sleep: () => {} }),
      ).toBe('ok')
    } finally {
      write.mockRestore()
    }
    expect(lines).toEqual([
      'HOST-RETRY: operation=host attempt=1 outcome=retry',
      'HOST-RETRY: operation=host attempt=2 outcome=recovered',
    ])
  })

  it('does not replay a permanent failure', async () => {
    const { runCli } = await import(kit)
    const { bin, count } = fixture(['HTTP 403 Forbidden'])
    expect(() =>
      runCli({ bin, args: ['read'], label: 'host', replaySafe: true, sleep: () => {} }),
    ).toThrow(/403/)
    expect(readFileSync(count, 'utf8')).toBe('1')
  })

  it('stops after four transient attempts and reports exhaustion', async () => {
    const { runCli } = await import(kit)
    const { bin, count } = fixture(['HTTP 429 rate limit'])
    expect(() =>
      runCli({ bin, args: ['read'], label: 'host', replaySafe: true, sleep: () => {} }),
    ).toThrow(/transient.*4 attempts/i)
    expect(readFileSync(count, 'utf8')).toBe('4')
  })

  it('AC5: exhausted diagnostics name the cause without host stderr contents', async () => {
    const { runCli } = await import(kit)
    const { bin } = fixture(['HTTP 503 credential-should-stay-private Retry-After: 31'])
    let error: unknown
    try {
      runCli({ bin, args: ['read'], label: 'host', replaySafe: true })
    } catch (caught) {
      error = caught
    }
    expect(String(error)).toMatch(/host-transient.*HTTP 503/)
    expect(String(error)).not.toContain('credential-should-stay-private')
  })

  it('AC1: honors Retry-After within the deadline', async () => {
    const { runCli } = await import(kit)
    const { bin, count } = fixture(['HTTP 429 Retry-After: 2', 'ok'])
    let elapsed = 0
    const delays: number[] = []
    expect(
      runCli({
        bin,
        args: ['read'],
        label: 'host',
        replaySafe: true,
        now: () => elapsed,
        sleep: (delay: number) => {
          delays.push(delay)
          elapsed += delay
        },
      }),
    ).toBe('ok')
    expect(delays).toEqual([2000])
    expect(readFileSync(count, 'utf8')).toBe('2')
  })

  it('AC1: refuses a Retry-After beyond the total deadline', async () => {
    const { runCli } = await import(kit)
    const { bin, count } = fixture(['HTTP 429 Retry-After: 31', 'ok'])
    expect(() =>
      runCli({ bin, args: ['read'], label: 'host', replaySafe: true, now: () => 0 }),
    ).toThrow(/host-transient.*1 attempts/)
    expect(readFileSync(count, 'utf8')).toBe('1')
  })

  it('AC1: stops when backoff no longer fits the remaining budget', async () => {
    const { runCli } = await import(kit)
    const { bin, count } = fixture(['HTTP 503', 'ok'])
    let calls = 0
    expect(() =>
      runCli({
        bin,
        args: ['read'],
        label: 'host',
        replaySafe: true,
        now: () => (calls++ < 2 ? 0 : 29_500),
        sleep: () => {
          throw new Error('backoff must not start')
        },
      }),
    ).toThrow(/host-transient.*1 attempts/)
    expect(readFileSync(count, 'utf8')).toBe('1')
  })

  it('AC1: a delayed wake past the deadline does not start another host call', async () => {
    const { runCli } = await import(kit)
    const { bin, count } = fixture(['HTTP 503', 'ok'])
    let elapsed = 0
    expect(() =>
      runCli({
        bin,
        args: ['read'],
        replaySafe: true,
        now: () => elapsed,
        sleep: () => {
          elapsed = 30_001
        },
      }),
    ).toThrow(/host-transient.*1 attempts/)
    expect(readFileSync(count, 'utf8')).toBe('1')
  })

  it('never replays a write with an uncertain response', async () => {
    const { runCli } = await import(kit)
    const { bin, count } = fixture(['ECONNRESET', 'ok'])
    expect(() => runCli({ bin, args: ['write'], label: 'host', sleep: () => {} })).toThrow(
      /ECONNRESET/,
    )
    expect(readFileSync(count, 'utf8')).toBe('1')
  })

  it('AC4: a timed-out write is bounded and never replayed', async () => {
    const { runCli } = await import(kit)
    const dir = mkdtempSync(join(tmpdir(), 'pair-host-write-timeout-'))
    dirs.push(dir)
    const bin = join(dir, 'host')
    writeFileSync(
      bin,
      `#!/usr/bin/env node
const wait = new Int32Array(new SharedArrayBuffer(4))
Atomics.wait(wait, 0, 0, 100)
process.stdout.write('ok')
`,
    )
    chmodSync(bin, 0o755)
    let reads = 0
    expect(() =>
      runCli({ bin, args: ['write'], label: 'host', now: () => (reads++ === 0 ? 0 : 29_999) }),
    ).toThrow(/host-transient.*1 attempts/)
  })

  it('retries the GitHub adapter card read through its real transport', async () => {
    const adapter = (await import(github)).default.instantiate({
      ghBin: fixture(['HTTP 503', 'ok']).bin,
    })
    expect(adapter.readCard('601', { repo: 'foomakers/pair' })).toEqual({ body: 'ok' })
  })

  it('AC1: repo discovery exhaustion stays transient instead of becoming missing configuration', async () => {
    const adapter = (await import(github)).default.instantiate({
      ghBin: fixture(['HTTP 503 Retry-After: 31']).bin,
    })
    expect(() => adapter.findCards({ search: '601' })).toThrow(/host-transient/)
  })

  it.each(['MERGED', 'OPEN', 'MOVED'])(
    'AC4: uncertain merge response reconciles a %s read-back without replay',
    async state => {
      const dir = mkdtempSync(join(tmpdir(), 'pair-merge-recovery-'))
      dirs.push(dir)
      const bin = join(dir, 'gh')
      const log = join(dir, 'calls')
      const head = 'a'.repeat(40)
      writeFileSync(
        bin,
        `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(log)}, args.slice(0, 2).join(' ') + '\\n')
if (args[0] === 'pr' && args[1] === 'merge') { process.stderr.write('ECONNRESET'); process.exit(1) }
if (args[0] === 'pr' && args[1] === 'view') { process.stdout.write(JSON.stringify({ state: ${JSON.stringify(state === 'MOVED' ? 'MERGED' : state)}, headRefOid: ${JSON.stringify(state === 'MOVED' ? 'b'.repeat(40) : head)} })); process.exit(0) }
process.exit(2)
`,
      )
      chmodSync(bin, 0o755)
      const adapter = (await import(github)).default.instantiate({ ghBin: bin })
      if (state === 'MERGED')
        expect(adapter.merge({ pr: 7, repo: 'foomakers/pair', headSha: head })).toMatchObject({
          merged: true,
        })
      else
        expect(() => adapter.merge({ pr: 7, repo: 'foomakers/pair', headSha: head })).toThrow(
          /host-transient/,
        )
      expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual(['pr merge', 'pr view'])
    },
  )

  it('AC1: a permission GET retries and exhaustion never becomes no permission', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pair-permission-recovery-'))
    dirs.push(dir)
    const bin = join(dir, 'gh')
    const count = join(dir, 'count')
    writeFileSync(
      bin,
      `#!/usr/bin/env node
const fs = require('node:fs')
const n = Number(fs.existsSync(${JSON.stringify(count)}) ? fs.readFileSync(${JSON.stringify(count)}, 'utf8') : 0) + 1
fs.writeFileSync(${JSON.stringify(count)}, String(n))
if (n < 2) { process.stderr.write('HTTP 503'); process.exit(1) }
process.stdout.write(JSON.stringify({ permission: 'write' }))
`,
    )
    chmodSync(bin, 0o755)
    const adapter = (await import(github)).default.instantiate({ ghBin: bin })
    expect(adapter.readPermission({ repo: 'foomakers/pair', user: 'rucka' })).toBe('write')
    expect(readFileSync(count, 'utf8')).toBe('2')
    writeFileSync(count, '0')
    writeFileSync(
      bin,
      `#!/usr/bin/env node
const fs = require('node:fs')
const n = Number(fs.readFileSync(${JSON.stringify(count)}, 'utf8')) + 1
fs.writeFileSync(${JSON.stringify(count)}, String(n))
process.stderr.write('HTTP 503 Retry-After: 31')
process.exit(1)
`,
    )
    expect(() => adapter.readPermission({ repo: 'foomakers/pair', user: 'rucka' })).toThrow(
      /host-transient.*1 attempts/,
    )
    expect(readFileSync(count, 'utf8')).toBe('1')
  })

  it('AC1: repo lookup exhaustion does not classify a card link as foreign', async () => {
    const adapter = (await import(github)).default.instantiate({
      ghBin: fixture(['HTTP 503 Retry-After: 31']).bin,
    })
    expect(() => adapter.parseCardRef('https://github.com/foomakers/pair/issues/601')).toThrow(
      /host-transient/,
    )
  })
})

// #601 r0-1 / AC1, AC4: each distributed transport and its CLI consumers own the same grammar.
const workflowStages = [
  'cycle',
  'red-spec',
  'red-verify',
  'implement-phase',
  'green-fix',
  'review-phase',
]
const transportCopies = workflowStages.flatMap(stage => [
  {
    name: `dataset-${stage}`,
    scripts: `packages/knowledge-hub/dataset/.skills/workflow/${stage}/scripts`,
  },
  { name: `installed-${stage}`, scripts: `.claude/skills/pair-workflow-${stage}/scripts` },
])
const diagnostics = [
  { diagnostic: 'reset', text: 'read: connection reset by peer' },
  { diagnostic: 'io-timeout', text: 'dial tcp 127.0.0.1:443: i/o timeout' },
]
const transportRows = transportCopies.flatMap(copy =>
  diagnostics.flatMap(diagnostic =>
    ['recover', 'exhaust', 'deadline', 'write'].map(scenario => ({
      ...copy,
      ...diagnostic,
      scenario,
    })),
  ),
)

it.each(transportRows)('r0-1 transport $name $diagnostic $scenario', async row => {
  const module = pathToFileURL(
    resolve(__dirname, '../../../../..', row.scripts, 'host/adapter-kit.mjs'),
  ).href
  const { runCli } = await import(module)
  const text = row.text + (row.scenario === 'deadline' ? ' Retry-After: 31' : '')
  const { bin, count } = fixture(row.scenario === 'recover' ? [text, 'ok'] : [text])
  const delays: number[] = []
  let elapsed = 0
  const invoke = () =>
    runCli({
      bin,
      args: ['read'],
      label: 'host',
      replaySafe: row.scenario !== 'write',
      now: () => elapsed,
      sleep: (delay: number) => {
        delays.push(delay)
        elapsed += delay
      },
    })
  if (row.scenario === 'recover') expect(invoke()).toBe('ok')
  else expect(invoke).toThrow(expect.objectContaining({ kind: 'transient-exhausted' }))
  const attempts = { recover: '2', exhaust: '4', deadline: '1', write: '1' }
  expect(readFileSync(count, 'utf8')).toBe(attempts[row.scenario as keyof typeof attempts])
  const expectedDelays = { recover: [1000], exhaust: [1000, 2000, 4000], deadline: [], write: [] }
  expect(delays).toEqual(expectedDelays[row.scenario as keyof typeof expectedDelays])
})

// #601 AC1/AC4, repair r1-g1: preserve the complete diagnostic grammar.
const errnoDiagnostics = [
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
]
const existingDiagnostics = [
  ...errnoDiagnostics,
  ...['HTTP', 'status', 'error'].flatMap(prefix =>
    ['429', '500', '503', '599'].map(code => `${prefix} ${code}`),
  ),
  'rate limit',
  'time out',
  'timed out',
  'temporary failure in name resolution',
  'HTTP429',
  'status500',
  'error599',
  'HTTP\t503',
  'status\n429',
  'error  503',
].flatMap(text => [...new Set([text, text.toLowerCase(), text.toUpperCase()])])

// Stub only the subprocess boundary; run each real exported runCli classifier/retry loop.
const rejectedResponse = (stderr: string) => ({ stderr, status: 1, stdout: '' })
const successResponse = (stderr = '') => ({ stderr, status: 0, stdout: '  result\n' })
async function diagnosticRun(
  scripts: string,
  responses: ReturnType<typeof rejectedResponse>[],
  replaySafe: boolean,
) {
  const { runCli } = await import(
    pathToFileURL(resolve(__dirname, '../../../../..', scripts, 'host/adapter-kit.mjs')).href
  )
  let attempts = 0
  const spawn = vi.spyOn(childProcess, 'spawnSync').mockImplementation(() => {
    const response = responses[Math.min(attempts++, responses.length - 1)]!
    return {
      pid: 1,
      output: [null, response.stdout, response.stderr],
      stdout: response.stdout,
      stderr: response.stderr,
      status: response.status,
      signal: null,
    } as ReturnType<typeof childProcess.spawnSync>
  })
  syncBuiltinESMExports()
  const delays: number[] = []
  let elapsed = 0
  const events: string[] = []
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
    events.push(String(chunk))
    return true
  })
  let value: string | undefined
  let error: unknown
  try {
    value = runCli({
      bin: 'fixture-host',
      args: ['operation'],
      operation: 'fixture',
      replaySafe,
      now: () => elapsed,
      sleep: (delay: number) => {
        delays.push(delay)
        elapsed += delay
      },
    })
  } catch (caught) {
    error = caught
  } finally {
    stderr.mockRestore()
    spawn.mockRestore()
    syncBuiltinESMExports()
  }
  return { value, error, attempts, delays, events }
}
const event = (attempt: number, outcome: string) =>
  `HOST-RETRY: operation=fixture attempt=${attempt} outcome=${outcome}\n`

it.each(
  transportCopies.flatMap(copy =>
    existingDiagnostics.flatMap(diagnostic =>
      ['recover', 'exhaust', 'write'].map(scenario => ({ ...copy, diagnostic, scenario })),
    ),
  ),
)('r0-1 existing diagnostic $name $diagnostic $scenario', async row => {
  const responses = [rejectedResponse(row.diagnostic)]
  if (row.scenario === 'recover') responses.push(successResponse())
  const result = await diagnosticRun(row.scripts, responses, row.scenario !== 'write')
  const expectations = {
    recover: { attempts: 2, delays: [1000], events: [event(1, 'retry'), event(2, 'recovered')] },
    exhaust: {
      attempts: 4,
      delays: [1000, 2000, 4000],
      events: [event(1, 'retry'), event(2, 'retry'), event(3, 'retry'), event(4, 'exhausted')],
    },
    write: { attempts: 1, delays: [], events: [event(1, 'exhausted')] },
  }
  expect(result).toMatchObject(expectations[row.scenario as keyof typeof expectations])
  if (row.scenario === 'recover') {
    expect(result.error).toBeUndefined()
    expect(result.value).toBe('  result\n')
  } else {
    expect(result.value).toBeUndefined()
    expect(result.error).toMatchObject({ kind: 'transient-exhausted' })
  }
})

const permanentDiagnostics = [
  'HTTP 403 Forbidden',
  'unknown stderr',
  '',
  ...errnoDiagnostics.flatMap(text => [`X${text}`, `${text}X`]),
  'XHTTP 503',
  'HTTP 503X',
  'status 4290',
  'error 5000',
  'HTTP 428',
  'HTTP 430',
  'HTTP 499',
  'HTTP 600',
  'HTTP 50',
  'status 403',
  'error 600',
  'HTTP:503',
  'prerate limit',
  'rate limiting',
  'xtime out',
  'timed outside',
  'xtemporary failure in name resolution',
  'temporary failure in name resolutions',
]
it.each(
  transportCopies.flatMap(copy =>
    permanentDiagnostics.flatMap(diagnostic =>
      [true, false].map(replaySafe => ({ ...copy, diagnostic, replaySafe })),
    ),
  ),
)('r0-1 transport $name permanent $diagnostic replaySafe=$replaySafe', async row => {
  const result = await diagnosticRun(
    row.scripts,
    [rejectedResponse(row.diagnostic), successResponse()],
    row.replaySafe,
  )
  expect(result).toMatchObject({ value: undefined, attempts: 1, delays: [], events: [] })
  expect(result.error).toMatchObject({ kind: 'failed', detail: row.diagnostic })
})

it.each(
  transportCopies.flatMap(copy =>
    ['', 'ECONNRESET', ...diagnostics.map(row => row.text)].flatMap(diagnostic =>
      [true, false].map(replaySafe => ({ ...copy, diagnostic, replaySafe })),
    ),
  ),
)('r0-1 immediate success $name $diagnostic replaySafe=$replaySafe', async row => {
  const result = await diagnosticRun(row.scripts, [successResponse(row.diagnostic)], row.replaySafe)
  expect(result).toEqual({
    value: '  result\n',
    error: undefined,
    attempts: 1,
    delays: [],
    events: [],
  })
})

it.each(
  transportCopies.flatMap(copy => diagnostics.map(diagnostic => ({ ...copy, ...diagnostic }))),
)('r0-1 transient then permanent $name $diagnostic', async row => {
  const result = await diagnosticRun(
    row.scripts,
    [rejectedResponse(row.text), rejectedResponse('HTTP 403 Forbidden'), successResponse()],
    true,
  )
  expect(result).toMatchObject({
    value: undefined,
    attempts: 2,
    delays: [1000],
    events: [event(1, 'retry'), event(2, 'permanent')],
  })
  expect(result.error).toMatchObject({ kind: 'failed', detail: 'HTTP 403 Forbidden' })
})
