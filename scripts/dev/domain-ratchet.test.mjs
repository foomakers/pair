import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const runner = fileURLToPath(
  new URL('../../tools/oxlint-config/bin/domain-ratchet.mjs', import.meta.url),
)
const baseline = 'tools/oxlint-config/domain-baseline.json'
const suppressions = 'packages/dev-tools/src/quality-gates/legacy-typescript-suppressions.json'
const pkg = 'packages/content-ops'
const legacy = `${pkg}/src/http/download-manager.ts`
const optional = 'pair-domain/no-optional-domain-properties'
const explicit = 'pair-domain/no-explicit-nullish-domain-types'
const nullable = 'pair-domain/nullable-domain-property'
const debt = `export interface WriteOptions {
  progressReporter?: string | undefined
}
export interface DownloadOptions { allowed?: string | null }
`

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'pair-ratchet-test-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  function write(path, source) {
    const file = join(cwd, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, typeof source === 'string' ? source : JSON.stringify(source))
  }
  const git = (...args) => execFileSync('git', args, { cwd })
  git('init', '-q', '-b', 'main')
  write(legacy, debt)
  write(`${pkg}/tsconfig.json`, { compilerOptions: { strict: true }, include: ['src/**/*.ts'] })
  write(`${pkg}/.oxlintrc.json`, {
    overrides: [
      {
        files: ['src/http/retry.domain.ts'],
        rules: { [explicit]: 'error' },
      },
    ],
  })
  write(suppressions, [])
  write(baseline, {
    [legacy]: {
      [optional]: ['WriteOptions.progressReporter'],
      [explicit]: ['WriteOptions.progressReporter'],
    },
  })
  git('add', '.')
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-qm',
    'Freeze legacy model',
  )
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  const check = () => {
    const output = spawnSync(process.execPath, [runner], { cwd, encoding: 'utf8' })
    assert.ifError(output.error)
    assert.equal(output.signal, null)
    return { status: output.status, out: (output.stdout + output.stderr).trim() }
  }
  return { write, git, check }
}

test('#750 AC-6 accepts existing findings through line movement and a verified Git rename', t => {
  const { check, git, write } = fixture(t)
  const accepted = { status: 0, out: 'Domain baseline passed on 1 files (2 recorded findings).' }
  assert.deepEqual(check(), accepted)
  write(legacy, `// Moved down one line.\n${debt}`)
  assert.deepEqual(check(), accepted)
  git('add', legacy)
  git('mv', legacy, `${pkg}/src/http/download-state.ts`)
  assert.deepEqual(check(), accepted)
})

test('#750 AC-6 refuses a replacement finding and an expanded snapshot, then accepts retirement', t => {
  const { check, write } = fixture(t)
  write(legacy, debt.replace('progressReporter?: string | undefined', 'replacement?: string'))
  const replacement = check()
  assert.equal(replacement.status, 1)
  assert.deepEqual(replacement.out.split('\n'), [
    `${legacy}:2:3: ${optional}: Make WriteOptions.replacement required on the appropriate tagged variant.`,
    `retire fixed domain baseline entry: ${legacy} ${optional} WriteOptions.progressReporter`,
    `retire fixed domain baseline entry: ${legacy} ${explicit} WriteOptions.progressReporter`,
  ])
  write(baseline, { [legacy]: { [optional]: ['WriteOptions.replacement'] } })
  assert.deepEqual(check(), {
    status: 1,
    out: `domain baseline cannot grow: ${legacy} ${optional} WriteOptions.replacement`,
  })
  write(legacy, debt.replace('progressReporter?: string | undefined', 'progressReporter: string'))
  write(baseline, {})
  assert.deepEqual(check(), {
    status: 0,
    out: 'Domain baseline passed on 1 files (0 recorded findings).',
  })
})

test('#750 AC-6 finds alias-only violations in new authored files and excludes generated sources and DTOs', t => {
  const { check, write } = fixture(t)
  const source = `type Alias = string | null\nexport interface Fresh { item: Alias }\n`
  write(`${pkg}/src/http/models/inbound.dto.ts`, source)
  write(`${pkg}/src/http/models/derived.generated.ts`, source)
  write(`${pkg}/src/http/models/declared.d.ts`, source)
  write(`${pkg}/src/http/adapters/outside.domain.ts`, source)
  assert.equal(check().status, 0)

  const added = `${pkg}/src/http/models/new.ts`
  write(added, source)
  assert.deepEqual(check(), {
    status: 1,
    out: `${added}:2:26: ${nullable}: Resolved nullish property Fresh.item.`,
  })
})

test('#750 AC-7 freezes the legacy directive snapshot', t => {
  const { check, write } = fixture(t)
  const record = `${pkg}/src/http/retryable-download.ts:1:// @ts-` + 'expect-error: added'
  write(suppressions, [record])
  assert.deepEqual(check(), {
    status: 1,
    out: `legacy suppression baseline cannot grow: ${record}`,
  })
})
