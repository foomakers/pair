import { execFile } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const exec = promisify(execFile)
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
// #601 r0-1 / AC1: real CLI entrypoints, fake host only.
type CliRead = 'card' | 'pr-labels' | 'decisions'
function cliFixture(diagnostic: string, outcome: string, operation: CliRead) {
  const root = mkdtempSync(join(tmpdir(), 'pair-host-wording-'))
  const adoption = join(root, '.pair/adoption/tech')
  mkdirSync(adoption, { recursive: true })
  writeFileSync(
    join(adoption, 'way-of-working.md'),
    'GitHub Projects\n\n## Assignment\n\n- `default-assignee`: `rucka`\n',
  )
  const dir = join(root, '.pair/working/runs/probe/601')
  mkdirSync(dir, { recursive: true })
  const bin = join(root, 'gh')
  const count = join(root, 'count')
  writeFileSync(count, '0')
  const error =
    outcome === 'permanent'
      ? 'HTTP 403 Forbidden'
      : `${diagnostic} Retry-After: ${outcome === 'recovered' ? 0 : 31}`
  const payloads = {
    card: { title: 'fixture', body: 'fixture body', labels: [{ name: 'risk:red' }], state: 'OPEN' },
    'pr-labels': [{ name: 'risk:red' }],
    decisions: [],
  }
  writeFileSync(
    bin,
    `#!${process.execPath}
const fs = require('node:fs')
const a = process.argv.slice(2)
if (a[0] === 'repo' && a[1] === 'view') { process.stdout.write('fixture/repo'); process.exit(0) }
if (a[0] === 'pr' && a[1] === 'view') { process.stdout.write('{"number":682}'); process.exit(0) }
if (!['issue', 'api'].includes(a[0])) process.exit(90)
const n = Number(fs.readFileSync(${JSON.stringify(count)}, 'utf8')) + 1
fs.writeFileSync(${JSON.stringify(count)}, String(n))
if (${JSON.stringify(outcome)} !== 'recovered' || n === 1) {
  process.stderr.write(${JSON.stringify(error)}); process.exit(1)
}
process.stdout.write(${JSON.stringify(JSON.stringify(payloads[operation]))})
`,
  )
  chmodSync(bin, 0o755)
  return { root, dir, bin, count }
}
async function runReadCli(
  scripts: string,
  operation: CliRead,
  diagnostic: string,
  outcome: string,
) {
  const f = cliFixture(diagnostic, outcome, operation)
  const script = resolve(__dirname, '../../../../..', scripts, 'cycle-state.mjs')
  const args = operation === 'pr-labels' ? ['--ref', '682'] : ['--story', '601']
  try {
    const result = await exec(process.execPath, [script, operation, ...args, '--dir', f.dir], {
      cwd: f.root,
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, PATH: `${f.root}:/usr/bin:/bin`, PAIR_GH_BIN: f.bin },
    })
      .then(value => ({ ...value, status: 0 }))
      .catch((error: unknown) => {
        const failure = error as { stdout: string; stderr: string; code: number; killed: boolean }
        expect(failure.killed).not.toBe(true)
        expect(typeof failure.code).toBe('number')
        return { stdout: failure.stdout, stderr: failure.stderr, status: failure.code }
      })
    return {
      result,
      body: JSON.parse(result.stdout),
      attempts: Number(readFileSync(f.count, 'utf8')),
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true })
  }
}
const cliRows = transportCopies.flatMap(copy =>
  diagnostics.flatMap(diagnostic =>
    (['card', 'pr-labels', 'decisions'] as const).flatMap(operation =>
      ['recovered', 'exhausted'].map(outcome => ({ ...copy, ...diagnostic, operation, outcome })),
    ),
  ),
)
function expectRecoveredRead(operation: CliRead, body: unknown) {
  const expected = {
    card: { body: 'fixture body', labels: ['risk:red'] },
    'pr-labels': { labels: ['risk:red'] },
    decisions: { recorded: [], revoked: [], errors: [] },
  }
  expect(body).toMatchObject(expected[operation])
}
it.concurrent.each(cliRows)('r0-1 CLI $name $diagnostic $operation $outcome', async row => {
  const { result, body, attempts } = await runReadCli(
    row.scripts,
    row.operation,
    row.text,
    row.outcome,
  )
  if (row.outcome === 'recovered') {
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('outcome=retry')
    expect(result.stderr).toContain('outcome=recovered')
    expectRecoveredRead(row.operation, body)
    expect(attempts).toBe(2)
  } else {
    expect(JSON.stringify(body)).toContain('host-transient:')
    expect(attempts).toBe(1)
  }
})
it.concurrent.each(
  transportCopies.flatMap(copy =>
    (['card', 'pr-labels', 'decisions'] as const).map(operation => ({ ...copy, operation })),
  ),
)('r0-1 CLI $name permanent $operation', async row => {
  const { body, attempts } = await runReadCli(row.scripts, row.operation, '', 'permanent')
  expect(JSON.stringify(body)).toContain('403')
  expect(JSON.stringify(body)).not.toContain('host-transient:')
  expect(attempts).toBe(row.operation === 'card' ? 2 : 1)
})
