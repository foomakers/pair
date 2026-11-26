import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const packagePath = 'packages/content-ops'
const pilot = 'src/http/retry.domain.ts'
const semantic = 'pair-domain/nullable-domain-property'

function workspace(t, sources) {
  const dir = mkdtempSync(join(tmpdir(), 'pair-domain-semantic-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const cwd = join(dir, packagePath)
  mkdirSync(cwd, { recursive: true })
  symlinkSync(join(root, 'tools'), join(dir, 'tools'), 'dir')
  symlinkSync(join(root, packagePath, 'node_modules'), join(cwd, 'node_modules'), 'dir')
  for (const name of ['package.json', 'tsconfig.json', '.oxlintrc.json']) {
    copyFileSync(join(root, packagePath, name), join(cwd, name))
  }
  for (const [path, source] of Object.entries(sources)) {
    const file = join(cwd, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, source)
  }
  return cwd
}

function lint(cwd, ...operands) {
  const result = spawnSync('pnpm', ['--silent', 'run', 'lint', ...operands], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PAIR_LINT_REPORT: 'json' },
  })
  assert.ifError(result.error)
  assert.equal(result.signal, null)
  return result
}

function findings({ status, stdout, stderr }) {
  assert.equal(stderr, '')
  const { diagnostics } = JSON.parse(stdout)
  return {
    status,
    locations: diagnostics.map(({ filename, code, labels }) => {
      const { line, column } = labels[0].span
      return [filename, code, line, column]
    }),
  }
}

function model(property, before = '') {
  return `${before}export interface Retry {\n  ${property}\n}\n`
}

const rejected = [
  {
    label: 'a local nullable alias',
    source: model('cause: Cause', 'type Cause = string | null\n'),
    location: [pilot, semantic, 3, 3],
  },
  {
    label: 'an imported undefined alias',
    source: model('cause: Cause', "import type { Cause } from './inputs.js'\n"),
    imports: { 'src/http/inputs.ts': 'export type Cause = string | undefined\n' },
    location: [pilot, semantic, 3, 3],
  },
  {
    label: 'a transitive nullable import once with duplicate file operands',
    source: model('cause: Cause', "import type { Cause } from './inputs.js'\n"),
    imports: {
      'src/http/inputs.ts':
        "import type { TransportCause } from '../types/cause.js'\nexport type Cause = TransportCause\n",
      'src/types/cause.ts': 'export type TransportCause = string | null\n',
    },
    operands: [pilot, `./${pilot}`],
    location: [pilot, semantic, 3, 3],
  },
  {
    label: 'an inferred nullable factory result',
    source: [
      'function readCause(available: boolean) {',
      "  return available ? 'cause' : null",
      '}',
      'export function createRetry(available: boolean) {',
      '  return { cause: readCause(available) }',
      '}',
    ].join('\n'),
    location: [pilot, semantic, 5, 12],
  },
  {
    label: 'a directly nullable property only through syntax lint',
    source: model('cause: string | null'),
    location: [pilot, 'pair-domain(no-explicit-nullish-domain-types)', 2, 3],
  },
  {
    label: 'an optional property only through syntax lint',
    source: model('cause?: Cause', 'type Cause = string | undefined\n'),
    location: [pilot, 'pair-domain(no-optional-domain-properties)', 3, 3],
  },
]

for (const { label, source, imports, operands = [], location } of rejected) {
  test(`#750 AC-3/4 package lint reports ${label}`, t => {
    const cwd = workspace(t, { [pilot]: source, ...imports })
    assert.deepEqual(findings(lint(cwd, ...operands)), { status: 1, locations: [location] })
  })
}

test('#750 AC-3/4 package lint accepts non-null, opaque and nested types and excludes the DTO', t => {
  const cwd = workspace(t, {
    [pilot]: model(
      'label: Label\n  cause: unknown\n  values: Array<string | null>',
      "import type { Label } from './inputs.js'\n",
    ),
    'src/http/inputs.ts': 'export type Label = string\n',
    'src/http/retryable-download.ts': model('label: Label', 'type Label = string | null\n'),
  })
  assert.deepEqual(findings(lint(cwd)), { status: 0, locations: [] })
})

test('#750 R2 checks an imported DTO field at the pilot construction', t => {
  const dto = 'src/http/retry.dto.ts'
  const cwd = workspace(t, {
    [pilot]: `import type { RetryDto } from './retry.dto.js'
export function createRetry(dto: RetryDto) {
  return { ...dto }
}
`,
    [dto]: 'export interface RetryDto { cause: string }\n',
  })
  assert.deepEqual(findings(lint(cwd)), { status: 0, locations: [] })

  writeFileSync(join(cwd, dto), 'export interface RetryDto { cause: string | null }\n')
  const result = lint(cwd)
  assert.deepEqual(findings(result), { status: 1, locations: [[pilot, semantic, 3, 10]] })
  assert.match(JSON.parse(result.stdout).diagnostics[0].message, /createRetry\.cause/)
})

for (const { finding, property, declaration, column } of [
  {
    finding: 'R6',
    property: 'message: string | null',
    declaration: "interface Retry extends RetryDto { tag: 'retry' }",
    column: 18,
  },
  {
    finding: 'R9',
    property: 'message?: string',
    declaration: "interface Retry extends RetryDto { tag: 'retry' }",
    column: 18,
  },
  {
    finding: 'R10',
    property: 'message: string | null',
    declaration: "type Retry = { tag: 'retry' } & RetryDto",
    column: 13,
  },
  {
    finding: 'R12',
    property: 'message: string | null',
    declaration: 'type Retry = RetryDto',
    column: 13,
  },
  {
    finding: 'R12',
    property: 'message: string | null',
    declaration: "type Retry = Pick<RetryDto, 'message'>",
    column: 13,
  },
]) {
  test(`#750 ${finding} reports DTO ${property} on the pilot declaration`, t => {
    const dto = 'src/http/retry.dto.ts'
    const cwd = workspace(t, {
      [pilot]: `import type { RetryDto } from './retry.dto.js'
export ${declaration}
`,
      [dto]: 'export interface RetryDto { message: string }\n',
    })
    assert.deepEqual(findings(lint(cwd)), { status: 0, locations: [] })

    writeFileSync(join(cwd, dto), `export interface RetryDto { ${property} }\n`)
    const result = lint(cwd)
    assert.deepEqual(findings(result), { status: 1, locations: [[pilot, semantic, 2, column]] })
    assert.match(JSON.parse(result.stdout).diagnostics[0].message, /Retry\.message/)
  })
}

test('#750 R10 checks the resolved intersection and reports direct syntax once', t => {
  const cwd = workspace(t, {
    [pilot]: `import type { RetryDto } from './retry.dto.js'
export type Narrowed = RetryDto & { message: string }
export type Direct = RetryDto & { message: string | null }
`,
    'src/http/retry.dto.ts': 'export interface RetryDto { message: string | null }\n',
  })
  assert.deepEqual(findings(lint(cwd)), {
    status: 1,
    locations: [[pilot, 'pair-domain(no-explicit-nullish-domain-types)', 3, 35]],
  })
})

test('#750 R7 rejects optional DTO fields copied into a pilot factory result', t => {
  const source = `import type { RetryDto } from './retry.dto.js'
export function createRetry(dto: RetryDto) {
  return { message: dto.message ?? '' }
}
`
  const cwd = workspace(t, {
    [pilot]: source,
    'src/http/retry.dto.ts': 'export interface RetryDto { message?: string }\n',
  })
  assert.deepEqual(findings(lint(cwd)), { status: 0, locations: [] })

  writeFileSync(join(cwd, pilot), source.replace("message: dto.message ?? ''", '...dto'))
  const result = lint(cwd)
  assert.deepEqual(findings(result), { status: 1, locations: [[pilot, semantic, 3, 10]] })
  assert.match(JSON.parse(result.stdout).diagnostics[0].message, /createRetry\.message/)
})

test('#750 R3 fails package lint when an imported type is no longer exported', t => {
  const input = 'src/http/inputs.ts'
  const cwd = workspace(t, {
    [pilot]: model('cause: Cause', "import type { Cause } from './inputs.js'\n"),
    [input]: 'export type Cause = string | null\n',
  })
  assert.deepEqual(findings(lint(cwd)), { status: 1, locations: [[pilot, semantic, 3, 3]] })

  for (const [source, code] of [
    ['export type Unrelated = string\n', 'TS2305'],
    ['type Cause = string | null\nexport {}\n', 'TS2459'],
  ]) {
    writeFileSync(join(cwd, input), source)
    const { status, stdout, stderr } = lint(cwd)
    const output = stdout + stderr
    assert.equal(status, 2, output)
    assert.ok(stderr.includes(code), output)
    assert.ok(!output.includes(semantic), output)
  }
})

test('#750 AC-4 package lint distinguishes project-load errors from findings', t => {
  const cwd = workspace(t, { [pilot]: model('cause: unknown') })
  const project = join(cwd, 'tsconfig.json')
  const config = JSON.parse(readFileSync(project, 'utf8'))
  config.extends = './missing-domain-config.json'
  writeFileSync(project, JSON.stringify(config))

  const { status, stdout, stderr } = lint(cwd)
  const output = stdout + stderr
  assert.equal(status, 2, output)
  assert.match(output, /missing-domain-config\.json/)
  assert.doesNotMatch(output, /pair-domain\/nullable-domain-property/)
})
