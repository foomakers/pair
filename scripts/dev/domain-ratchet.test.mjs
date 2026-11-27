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

function fixture(
  t,
  {
    model = debt,
    rules = {
      [optional]: ['WriteOptions.progressReporter'],
      [explicit]: ['WriteOptions.progressReporter'],
    },
    files = {},
  } = {},
) {
  const cwd = mkdtempSync(join(tmpdir(), 'pair-ratchet-test-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  function write(path, source) {
    const file = join(cwd, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, typeof source === 'string' ? source : JSON.stringify(source))
  }
  const git = (...args) => execFileSync('git', args, { cwd })
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Fixture')
  git('config', 'user.email', 'fixture@example.test')
  git('config', 'commit.gpgsign', 'false')
  write(legacy, model)
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
  write(baseline, { [legacy]: rules })
  for (const [file, source] of Object.entries(files)) write(file, source)
  git('add', '.')
  git('commit', '-qm', 'Freeze legacy model')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  const check = () => {
    const output = spawnSync(process.execPath, [runner], { cwd, encoding: 'utf8' })
    assert.ifError(output.error)
    assert.equal(output.signal, null)
    return { status: output.status, out: (output.stdout + output.stderr).trim() }
  }
  return { write, git, check }
}

test('#750 AC-6 preserves findings through line movement, a rename and R11 path reuse', t => {
  const { check, git, write } = fixture(t)
  const moved = `${pkg}/src/http/download-state.ts`
  const initialBase = git('rev-parse', 'HEAD').toString().trim()
  const accepted = { status: 0, out: 'Domain baseline passed on 1 files (2 recorded findings).' }
  assert.deepEqual(check(), accepted)
  write(legacy, `// Moved down one line.\n${debt}`)
  assert.deepEqual(check(), accepted)
  git('switch', '-qc', 'rename')
  git('add', legacy)
  git('mv', legacy, moved)
  assert.deepEqual(check(), accepted)

  // R8: the snapshot still names the original file after the rename lands on main.
  git('commit', '-qm', 'Rename legacy model')
  git('switch', '-q', 'main')
  git('merge', '--no-ff', '-q', 'rename')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  assert.deepEqual(check(), accepted)

  git('switch', '-qc', 'reuse')
  write(legacy, 'export const replacement = true\n')
  git('add', legacy)
  git('commit', '-qm', 'Reuse the former path for a clean module')
  assert.deepEqual(check(), accepted)
  git('switch', '-q', 'main')
  git('merge', '--no-ff', '-q', 'reuse')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  assert.deepEqual(check(), accepted)

  git('update-ref', 'refs/remotes/origin/main', initialBase)
  assert.deepEqual(check(), accepted)

  write(moved, debt.replace('  progressReporter', '  extra?: string\n  progressReporter'))
  assert.deepEqual(check(), {
    status: 1,
    out: `${moved}:2:3: ${optional}: Make WriteOptions.extra required on the appropriate tagged variant.`,
  })
})

test('#750 AC-6 preserves a verified rename when a differently renamed base is merged', t => {
  const { check, git } = fixture(t)
  git('switch', '-qc', 'branch-rename')
  git('mv', legacy, `${pkg}/src/http/branch-state.ts`)
  git('commit', '-qm', 'Rename the model on the branch')
  git('switch', '-q', 'main')
  git('mv', legacy, `${pkg}/src/http/main-state.ts`)
  git('commit', '-qm', 'Rename the model on main')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  git('switch', '-q', 'branch-rename')
  git('merge', '-q', '-s', 'ours', 'main', '-m', 'Keep the branch model path')

  assert.deepEqual(check(), {
    status: 0,
    out: 'Domain baseline passed on 1 files (2 recorded findings).',
  })
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

for (const [description, model] of [
  [
    'union variant',
    `export type WriteOptions =
  | { tag: 'file'; progress?: string }
  | { tag: 'stream'; progress: string }
`,
  ],
  [
    'nested property',
    `export interface WriteOptions {
  file: { progress?: string }
  stream: { progress: string }
}
`,
  ],
]) {
  test(`#750 R4 refuses debt moved to a different ${description}`, t => {
    const { check, write } = fixture(t, { model, rules: { [optional]: ['WriteOptions.progress'] } })
    const [header, file, stream, ...rest] = model.split('\n')
    write(legacy, [header, stream, file, ...rest].join('\n'))
    assert.equal(check().status, 0)

    write(
      legacy,
      [
        header,
        file.replace('progress?', 'progress'),
        stream.replace('progress:', 'progress?:'),
        ...rest,
      ].join('\n'),
    )
    const moved = check()
    assert.equal(moved.status, 1, moved.out)
    assert.match(moved.out, /:3:\d+: pair-domain\/no-optional-domain-properties:/)
    assert.match(moved.out, /retire fixed domain baseline entry: .* WriteOptions\.progress/)
  })
}

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

test('#750 R5 requires retirement when a tracked frozen directive is removed', t => {
  const file = `${pkg}/src/http/retryable-download.ts`
  const directive = '// @ts-' + 'expect-error: legacy assignment'
  const record = `${file}:1:${directive}`
  const clean = 'export const amount: number = 1\n'
  const { check, write } = fixture(t, {
    files: {
      [file]: `${directive}\nexport const amount: number = 'legacy'\n`,
      [suppressions]: [record],
    },
  })
  assert.equal(check().status, 0)

  write(file, clean)
  assert.deepEqual(check(), {
    status: 1,
    out: `retire removed legacy suppression: ${record}`,
  })

  write(suppressions, [])
  assert.equal(check().status, 0)
})
