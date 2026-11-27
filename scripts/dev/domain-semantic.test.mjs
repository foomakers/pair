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

test('#750 R15 accepts absent inferred fields and reports authored optional DTO fields', t => {
  const cwd = workspace(t, {
    [pilot]: `import type { classifyFromDto } from './retry.dto.js'
export function classify(ok: boolean, cause: unknown) {
  if (ok) return { tag: 'success' } satisfies { tag: 'success' }
  return { tag: 'failure', cause } satisfies { tag: 'failure'; cause: unknown }
}
export type Retry = ReturnType<typeof classify>
export type Unvalidated = ReturnType<typeof classifyFromDto>
`,
    'src/http/retry.dto.ts': `interface RetryDto { cause?: never }
export function classifyFromDto(ok: boolean, dto: RetryDto) {
  if (ok) return { tag: 'success', ...dto } satisfies { tag: 'success' }
  return { tag: 'failure', cause: 'error' } satisfies { tag: 'failure'; cause: unknown }
}
`,
  })
  assert.deepEqual(findings(lint(cwd)), { status: 1, locations: [[pilot, semantic, 7, 13]] })
})

test('#750 R16 accepts a factory forwarding an inferred retry union', t => {
  const cwd = workspace(t, {
    [pilot]: `function classify(ok: boolean, cause: unknown) {
  if (ok) return { tag: 'success' } satisfies { tag: 'success' }
  return { tag: 'failure', cause } satisfies { tag: 'failure'; cause: unknown }
}
export const createRetry = (ok: boolean, cause: unknown) => classify(ok, cause)
`,
  })
  assert.deepEqual(findings(lint(cwd)), { status: 0, locations: [] })
})

test('#750 R16 reports authored optional DTO fields in a forwarded union', t => {
  const cwd = workspace(t, {
    [pilot]: `import { classify } from './retry.dto.js'
export const createRetry = (ok: boolean) => classify(ok, {})
`,
    'src/http/retry.dto.ts': `interface RetryDto { cause?: never }
export function classify(ok: boolean, dto: RetryDto) {
  if (ok) return { tag: 'success', ...dto } satisfies { tag: 'success' }
  return { tag: 'failure', cause: 'error' } satisfies { tag: 'failure'; cause: unknown }
}
`,
  })
  const result = lint(cwd)
  assert.deepEqual(findings(result), { status: 1, locations: [[pilot, semantic, 2, 45]] })
  assert.match(JSON.parse(result.stdout).diagnostics[0].message, /createRetry\.cause/)
})

for (const { label, value, type, locations } of [
  {
    label: 'reports an imported nullable getter',
    value: 'null',
    type: 'string | null',
    locations: [[pilot, semantic, 3, 7]],
  },
  {
    label: 'accepts an imported required getter',
    value: "'error'",
    type: 'string',
    locations: [],
  },
]) {
  test(`#750 R17 ${label}`, t => {
    const cwd = workspace(t, {
      [pilot]: `import type { Cause } from './inputs.js'
export class Retry {
  get cause(): Cause { return ${value} }
}
`,
      'src/http/inputs.ts': `export type Cause = ${type}\n`,
    })
    const result = lint(cwd)
    assert.deepEqual(findings(result), { status: locations.length, locations })
    if (locations.length)
      assert.match(JSON.parse(result.stdout).diagnostics[0].message, /Retry\.cause/)
  })
}

for (const [type, locations] of [
  ['string | null', [[pilot, semantic, 3, 7]]],
  ['string', []],
]) {
  test(`#750 750-R18 AC-3 checks an interface getter of imported type ${type}`, t => {
    const cwd = workspace(t, {
      [pilot]: model('get cause(): Cause', "import type { Cause } from './inputs.js'\n"),
      'src/http/inputs.ts': `export type Cause = ${type}\n`,
    })
    assert.deepEqual(findings(lint(cwd)), { status: locations.length, locations })
  })
}

for (const [shape, declaration, line, column] of [
  [
    'class expression',
    `export const Retry = class {
  get cause(): Cause { return readCause() }
}`,
    4,
    7,
  ],
  [
    'tagged union member',
    `export type Retry =
  | { tag: 'success' }
  | { tag: 'failure'; get cause(): Cause }`,
    5,
    27,
  ],
  [
    'nested tagged payload',
    `export type Retry =
  | { tag: 'success' }
  | { tag: 'failure'; failure: { get cause(): Cause } }`,
    5,
    38,
  ],
  [
    'exported object literal',
    `export const retry = {
  get cause(): Cause { return readCause() },
}`,
    4,
    7,
  ],
  [
    'factory object literal',
    `export function createRetry() {
  return { get 'cause'() { return readCause() } }
}`,
    4,
    16,
  ],
]) {
  test(`#750 750-R19 AC-3/4 checks the getter name exactly once (${shape})`, t => {
    const input = 'src/http/inputs.ts'
    const cwd = workspace(t, {
      [pilot]: `import type { Cause } from './inputs.js'
export declare function readCause(): Cause
${declaration}
`,
      [input]: 'export type Cause = string\n',
    })
    assert.deepEqual(findings(lint(cwd)), { status: 0, locations: [] })

    writeFileSync(join(cwd, input), 'export type Cause = string | null\n')
    assert.deepEqual(findings(lint(cwd)), { status: 1, locations: [[pilot, semantic, line, column]] })
  })
}

function constructorModel(parameters, before = '', subclass = false) {
  const declaration = subclass
    ? 'class Base {}\nexport class Retry extends Base'
    : 'export class Retry'
  const body = subclass ? '\n    super()\n  ' : ''
  return `${before}${declaration} {\n  constructor(${parameters}) {${body}}\n}\n`
}

for (const [property, alias, rule, line, subclass] of [
  ['message?: string', '', 'pair-domain(no-optional-domain-properties)', 2],
  ['message: string | null', '', 'pair-domain(no-explicit-nullish-domain-types)', 2],
  ["message: string | null = ''", '', 'pair-domain(no-explicit-nullish-domain-types)', 3, true],
  ['message: Cause', 'type Cause = string | null\n', semantic, 3],
]) {
  test(`#750 R14 rejects the constructor parameter property ${property}`, t => {
    const cwd = workspace(t, { [pilot]: constructorModel(`readonly ${property}`, alias, subclass) })
    const result = lint(cwd)
    assert.deepEqual(findings(result), { status: 1, locations: [[pilot, rule, line, 24]] })
    assert.match(JSON.parse(result.stdout).diagnostics[0].message, /Retry\.message[. ]/)
  })
}

test('#750 R14 accepts a required field and an ordinary nullable constructor parameter', t => {
  const cwd = workspace(t, {
    [pilot]: constructorModel("readonly message: string = '', _input?: string | null"),
  })
  assert.deepEqual(findings(lint(cwd)), { status: 0, locations: [] })
})

const explicitNullish = 'pair-domain(no-explicit-nullish-domain-types)'
for (const [invalid, valid, rule, column] of [
  [
    'abstract label?: string',
    'abstract label: string',
    'pair-domain(no-optional-domain-properties)',
    12,
  ],
  ['abstract label: string | null', 'abstract label: string', explicitNullish, 12],
  ['accessor label: string | null = null', 'accessor label: string = ""', explicitNullish, 12],
  ['abstract accessor label: string | null', 'abstract accessor label: string', explicitNullish, 21],
]) {
  test(`#750 750-R23 AC-2/3 reports ${invalid} once`, t => {
    const source = field => `export abstract class Retry {\n  ${field}\n}\n`
    const cwd = workspace(t, { [pilot]: source(valid) })
    assert.deepEqual(findings(lint(cwd)), { status: 0, locations: [] })

    writeFileSync(join(cwd, pilot), source(invalid))
    const result = lint(cwd)
    assert.deepEqual(findings(result), { status: 1, locations: [[pilot, rule, 2, column]] })
    assert.match(JSON.parse(result.stdout).diagnostics[0].message, /Retry\.label[. ]/)
  })
}

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

for (const { route, source, imports, causeType, location, importer } of [
  {
    route: 'direct',
    source: model('cause: Cause', "import './causes.js'\n"),
    causeType: 'string | null',
    location: [pilot, semantic, 3, 3],
    importer: pilot,
  },
  {
    route: 'transitive with an independent domain finding',
    source: model(
      'cause: Cause\n  detail: Detail',
      "import './inputs.js'\ntype Detail = string | null\n",
    ),
    imports: { 'src/http/inputs.ts': "import './causes.js'\n" },
    causeType: 'string',
    location: [pilot, semantic, 5, 3],
    importer: 'src/http/inputs.ts',
  },
]) {
  test(`#750 750-R20 AC-4 rejects a missing side-effect import (${route})`, t => {
    const causes = 'src/http/causes.ts'
    const cwd = workspace(t, {
      [pilot]: source,
      ...imports,
      [causes]: `export {}\ndeclare global { type Cause = ${causeType} }\n`,
    })
    assert.deepEqual(findings(lint(cwd)), { status: 1, locations: [location] })

    rmSync(join(cwd, causes))
    const { status, stderr, stdout } = lint(cwd)
    const output = stdout + stderr
    assert.equal(status, 2, output)
    assert.ok(stderr.includes(`${importer}: TS2882`), output)
    assert.ok(stderr.includes('./causes.js'), output)
    assert.ok(!output.includes(semantic), output)
  })
}

for (const [code, dependency, source, broken] of [
  ['TS2835', 'src/http/types.mts', "export type { Cause } from './types.mjs'", './types'],
  ['TS2834', 'src/http/types.mts', "export type { Cause } from './types.mjs'", './missing'],
  [
    'TS6053',
    'types/cause.d.ts',
    '/// <reference path="../../types/cause.d.ts" />\nexport type Cause = ReferencedCause',
    '../../types/missing.d.ts',
  ],
]) {
  test(`#750 750-R22 AC-4 rejects an unresolved transitive dependency (${code})`, t => {
    const bridge = 'src/http/bridge.mts'
    const importCause = "import type { Cause } from './bridge.mjs'\n"
    const cwd = workspace(t, {
      [pilot]: model('cause: Cause', importCause),
      [bridge]: source + '\n',
      [dependency]: dependency.endsWith('.mts')
        ? 'export type Cause = string\n'
        : 'type ReferencedCause = string\n',
    })
    assert.deepEqual(findings(lint(cwd)), { status: 0, locations: [] })

    writeFileSync(
      join(cwd, bridge),
      source.replace(/\.\/types\.mjs|\.\.\/\.\.\/types\/cause\.d\.ts/, broken) + '\n',
    )
    writeFileSync(
      join(cwd, pilot),
      model('cause: Cause\n  detail: Detail', `${importCause}type Detail = string | null\n`),
    )
    const { status, stdout, stderr } = lint(cwd)
    assert.equal(status, 2, stdout + stderr)
    assert.ok(stderr.includes(`${bridge}: ${code}`), stderr)
    assert.equal(stdout, '')
  })
}

for (const [bridge, code, broken, dependencies] of [
  [
    'types/bridge.ts',
    'TS2303',
    "export type { Cause } from './fallback.js'\n",
    { 'types/fallback.ts': "export type { Cause } from './bridge.js'\n" },
  ],
  [
    'types/bridge.ts',
    'TS2308',
    "export type * from './cause.js'\nexport type * from './fallback.js'\n",
    { 'types/fallback.ts': 'export type Cause = number\n' },
  ],
  ['types/bridge.d.ts', 'TS2307', "export type { Cause } from './missing.js'\n", {}],
  ['types/bridge.ts', 'TS2304', 'export type { Inner as Cause }\n', {}],
  ['types/bridge.ts', 'TS2503', 'export type Cause = Registry.Inner\n', {}],
  ['types/bridge.ts', 'TS2456', 'type Inner = Cause\nexport type Cause = Inner\n', {}],
]) {
  for (const detail of [false, true]) {
    const context = detail ? 'with a nullable field' : 'without a nullable field'
    test(`#750 750-R22 AC-4 rejects a broken type re-export (${code}, ${context})`, t => {
      const importCause = "import type { Cause } from '../../types/bridge.js'\n"
      const cwd = workspace(t, {
        [pilot]: detail
          ? model('cause: Cause\n  detail: Detail', `${importCause}type Detail = string | null\n`)
          : model('cause: Cause', importCause),
        [bridge]: "export type { Cause } from './cause.js'\n",
        'types/cause.ts': 'export type Cause = string\n',
        ...dependencies,
      })
      assert.deepEqual(findings(lint(cwd)), {
        status: detail ? 1 : 0,
        locations: detail ? [[pilot, semantic, 5, 3]] : [],
      })

      writeFileSync(join(cwd, bridge), broken)
      const { status, stdout, stderr } = lint(cwd)
      assert.equal(status, 2, stdout + stderr)
      const location = code === 'TS2303' ? 'types/fallback.ts' : bridge
      assert.ok(stderr.includes(`${location}: ${code}`), stderr)
      assert.equal(stdout, '')
    })
  }
}

for (const detail of [false, true]) {
  const context = detail ? 'with a nullable field' : 'without a nullable field'
  test(`#750 750-R22 AC-3/4 validates an imported package type (${context})`, t => {
    const dependency = '../../node_modules/retry-cause'
    const bridge = `${dependency}/bridge.d.ts`
    const retry = cause =>
      model(
        detail ? 'cause: Cause\n  detail: Detail' : 'cause: Cause',
        `import type { ${cause} } from 'retry-cause'\n${detail ? 'type Detail = string | null\n' : ''}`,
      )
    const cwd = workspace(t, {
      [pilot]: retry('Cause'),
      [`${dependency}/index.d.ts`]: "export type { Cause, OtherCause } from './bridge.js'\n",
      [bridge]: 'export type Cause = string\nexport type OtherCause = string\n',
    })
    const detailLocations = detail ? [[pilot, semantic, 5, 3]] : []
    const resolved = { status: Number(detail), locations: detailLocations }
    assert.deepEqual(findings(lint(cwd)), resolved)

    writeFileSync(
      join(cwd, bridge),
      'export type Cause = string | null\nexport type OtherCause = string\n',
    )
    assert.deepEqual(findings(lint(cwd)), {
      status: 1,
      locations: [[pilot, semantic, detail ? 4 : 3, 3], ...detailLocations],
    })

    writeFileSync(
      join(cwd, bridge),
      "export type { Cause } from './missing.js'\nexport type OtherCause = string\n",
    )
    const { status, stdout, stderr } = lint(cwd)
    assert.equal(status, 2, stdout + stderr)
    assert.ok(stderr.includes('node_modules/retry-cause/bridge.d.ts: TS2307'), stderr)
    assert.equal(stdout, '')

    writeFileSync(join(cwd, pilot), retry('OtherCause as Cause'))
    assert.deepEqual(findings(lint(cwd)), resolved)
  })
}

for (const [form, declaration, dependency, location] of [
  ['indexed interface', "export interface Retry { cause: RetryDto['cause'] }", 'RetryDto', [2, 26]],
  ['generic alias', 'export type Retry = Wrapper<Cause>', 'Cause', [3, 13]],
  [
    'generic inheritance',
    'export interface Retry extends Wrapper<Cause> { tag: string }',
    'Cause',
    [3, 18],
  ],
  [
    'inferred factory result',
    'export const createRetry = () => ({ cause: readCause() })',
    'readCause',
    [2, 37],
  ],
  ['inferred class field', 'export class Retry { cause = readCause() }', 'readCause', [2, 22]],
]) {
  for (const external of [false, true]) {
    const context = external ? 'package declaration' : 'local source with a nullable field'
    test(`#750 750-R22 AC-3/4 validates a selected ${form} from ${context}`, t => {
      const input = external ? '../../node_modules/retry-cause/index.d.ts' : 'src/http/inputs.ts'
      const specifier = external ? 'retry-cause' : './inputs.js'
      const imports = dependency === 'readCause' ? 'import' : 'import type'
      const wrapper = form.startsWith('generic') ? 'interface Wrapper<T> { cause: T }\n' : ''
      const detail = external
        ? ''
        : '\ntype Detail = string | null\nexport interface Extra { detail: Detail }'
      const source = `${imports} { ${dependency} } from '${specifier}'\n${wrapper}${declaration}${detail}\n`
      const inputSource = type => {
        if (dependency === 'RetryDto') return `export interface RetryDto { cause: ${type} }\n`
        if (dependency === 'Cause') return `export type Cause = ${type}\n`
        return `export declare function readCause(): ${type}\n`
      }
      const cwd = workspace(t, { [pilot]: source, [input]: inputSource('string') })
      const independent = external ? [] : [[pilot, semantic, location[0] + 2, 26]]
      assert.deepEqual(findings(lint(cwd)), { status: Number(!external), locations: independent })

      writeFileSync(join(cwd, input), inputSource('string | null'))
      assert.deepEqual(findings(lint(cwd)), {
        status: 1,
        locations: [[pilot, semantic, ...location], ...independent],
      })

      writeFileSync(join(cwd, input), inputSource('MissingCause'))
      const { status, stdout, stderr } = lint(cwd)
      assert.equal(status, 2, stdout + stderr)
      assert.match(
        stderr,
        /(?:retry-cause\/index\.d\.ts|src\/http\/inputs\.ts): TS2304.*MissingCause/,
      )
      assert.equal(stdout, '')
    })
  }
}

for (const [argument, code, lookup] of [
  ['MissingCause', 'TS2304', type => `RetryDto<${type}>['cause']`],
  ['boolean', 'TS2344', type => `(RetryDto<${type}>)['cause']`],
]) {
  test(`#750 750-R22 AC-3/4 rejects an invalid indexed type argument (${code})`, t => {
    const input = '../../node_modules/retry-cause/index.d.ts'
    const retry = type =>
      `import type { RetryDto } from 'retry-cause'\nexport interface Retry { cause: ${lookup(type)} }\n`
    const dto = type =>
      `export type RetryDto<T extends string | number> = {
  cause: [T] extends [string | number | boolean] ? ${type} : number
}\n`
    const cwd = workspace(t, { [pilot]: retry('string'), [input]: dto('string') })
    assert.deepEqual(findings(lint(cwd)), { status: 0, locations: [] })

    writeFileSync(join(cwd, input), dto('string | null'))
    assert.deepEqual(findings(lint(cwd)), { status: 1, locations: [[pilot, semantic, 2, 26]] })

    writeFileSync(join(cwd, pilot), retry(argument))
    const { status, stdout, stderr } = lint(cwd)
    assert.equal(status, 2, stdout + stderr)
    assert.ok(stderr.includes(`${pilot}: ${code}`), stderr)
    assert.ok(stderr.includes(argument), stderr)
    assert.equal(stdout, '')
  })
}

for (const [shape, dto, key = "'cause'", imports = 'RetryDto'] of [
  ['interface', type => `export interface RetryDto { cause: ${type}; other: MissingDetail }\n`],
  ['alias', type => `export type RetryDto = { cause: ${type}; other: MissingDetail }\n`],
  [
    'transitive alias',
    type => `type TransportDto = { cause: ${type}; other: MissingDetail }\nexport type RetryDto = TransportDto\n`,
  ],
  [
    'string index signature',
    type => `export type RetryDto = { [key: string]: ${type}; other: MissingDetail }\n`,
  ],
  [
    'record dictionary intersection',
    type => `export type RetryDto = { other: MissingDetail } & Record<string, ${type}>\n`,
  ],
  [
    'mapped dictionary intersection',
    type => `export type RetryDto = { other: MissingDetail } & { [Key in string]: ${type} }\n`,
  ],
  [
    'dictionary union',
    type =>
      `export type RetryDto = { [key: string]: number; other: MissingDetail } | { [key: string]: ${type}; tag: 'right' }\n`,
  ],
  [
    'number index signature with a numeric string key',
    type => `export type RetryDto = { [key: string]: MissingDetail; [key: number]: ${type} }\n`,
    "'0'",
  ],
  [
    'unique-symbol property',
    type => `export declare const key: unique symbol\nexport type RetryDto = { [key]: ${type}; other: MissingDetail }\n`,
    'typeof key',
    'RetryDto, key',
  ],
]) {
  test(`#750 750-R24 AC-3/4 checks only the selected property of an imported ${shape}`, t => {
    const input = '../../node_modules/retry-cause/index.d.ts'
    const source = `import type { ${imports} } from 'retry-cause'\nexport interface Retry { cause: RetryDto[${key}] }\n`
    const cwd = workspace(t, { [pilot]: source, [input]: dto('string') })
    assert.deepEqual(findings(lint(cwd)), { status: 0, locations: [] })

    writeFileSync(join(cwd, input), dto('string | null'))
    assert.deepEqual(findings(lint(cwd)), { status: 1, locations: [[pilot, semantic, 2, 26]] })

    writeFileSync(join(cwd, input), dto('MissingCause'))
    const { status, stdout, stderr } = lint(cwd)
    assert.equal(status, 2, stdout + stderr)
    assert.match(stderr, /retry-cause\/index\.d\.ts: TS2304.*MissingCause/)
    assert.equal(stdout, '')
  })
}

for (const [argument, code] of [
  ['MissingCause', 'TS2304'],
  ['boolean', 'TS2344'],
]) {
  for (const imported of [false, true]) {
    const input = imported ? 'src/http/inputs.ts' : pilot
    const context = imported ? 'an imported' : 'a local'
    test(`#750 750-R22 AC-3/4 rejects ${code} through ${context} type alias`, t => {
      const retry = "export interface Retry { cause: RetryDto['cause'] }\n"
      const dto = (type, value) =>
        `type Envelope<T extends string> = { cause: [T] extends [string | boolean] ? ${value} : number }\nexport type TransportDto = Envelope<${type}>\nexport type RetryDto = TransportDto\n`
      const source = (type, value) => dto(type, value) + (imported ? '' : retry)
      const imports = imported
        ? { [pilot]: "import type { RetryDto } from './inputs.js'\n" + retry }
        : {}
      const cwd = workspace(t, { ...imports, [input]: source('string', 'string') })
      assert.deepEqual(findings(lint(cwd)), { status: 0, locations: [] })

      writeFileSync(join(cwd, input), source('string', 'string | null'))
      assert.deepEqual(findings(lint(cwd)), {
        status: 1,
        locations: imported
          ? [[pilot, semantic, 2, 26]]
          : [
              [pilot, semantic, 2, 13],
              [pilot, semantic, 3, 13],
              [pilot, semantic, 4, 26],
            ],
      })

      for (const value of ['string', 'string | null']) {
        writeFileSync(join(cwd, input), source(argument, value))
        const { status, stdout, stderr } = lint(cwd)
        assert.equal(status, 2, stdout + stderr)
        assert.ok(stderr.includes(`${input}: ${code}`), stderr)
        assert.ok(stderr.includes(argument), stderr)
        assert.equal(stdout, '')
      }
    })
  }
}

for (const [argument, code] of [
  ['MissingCause', 'TS2304'],
  ['boolean', 'TS2344'],
]) {
  test(`#750 750-R22 AC-3/4 rejects ${code} through interface inheritance`, t => {
    const input = 'src/http/inputs.ts'
    const source =
      "import type { RetryDto } from './inputs.js'\nexport interface Retry { cause: RetryDto['cause'] }\n"
    const dto = (type, value) =>
      `interface Envelope<T extends string> { cause: [T] extends [string | boolean] ? ${value} : number }\nexport interface RetryDto extends Envelope<${type}> { side: string }\n`
    const cwd = workspace(t, { [pilot]: source, [input]: dto('string', 'string') })
    assert.deepEqual(findings(lint(cwd)), { status: 0, locations: [] })

    writeFileSync(join(cwd, input), dto('string', 'string | null'))
    assert.deepEqual(findings(lint(cwd)), { status: 1, locations: [[pilot, semantic, 2, 26]] })

    for (const value of ['string', 'string | null']) {
      writeFileSync(join(cwd, input), dto(argument, value))
      const { status, stdout, stderr } = lint(cwd)
      assert.equal(status, 2, stdout + stderr)
      assert.ok(stderr.includes(`${input}: ${code}`), stderr)
      assert.ok(stderr.includes(argument), stderr)
      assert.equal(stdout, '')
    }
  })
}

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
