/**
 * Controls of review finding r0-5 (story #652) — what declaring the kind reference page as a
 * cache input of the @pair/workflows test tasks must leave as it is. See
 * `workflows-test-cache-inputs.test.ts` for the defect and for why turbo's dry run is the
 * authority.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

const ROOT = join(__dirname, '../../../..')
const PACKAGE_DIR = 'packages/workflows'
const PAGE =
  'packages/knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/automation/workflow-kinds.md'
const SCHEMA_PAGE =
  'packages/knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/automation/workflow-schema.md'
const TEST_TASKS = ['@pair/workflows#test', '@pair/workflows#test:coverage']
const GUARD_TASKS = ['@pair/knowledge-hub#test', '@pair/knowledge-hub#test:coverage']

/** The specifier grammar of `packages/workflows/src/boundary.test.ts` — pinned to it by c7. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g

/** The inputs "@pair/knowledge-hub#test" declares at 9fd100bc, as turbo resolves them. */
const GUARD_INPUTS = [
  '$TURBO_DEFAULT$',
  '../../.claude-plugin/marketplace.json',
  '../../.claude/**',
  '../../.github/workflows/**',
  '../../.pair/**',
  '../../apps/pair-cli/config.json',
  '../../apps/website/content/docs/**',
  '../../apps/website/e2e/docs.e2e.test.ts',
  '../../package.json',
  '../../qa/**',
  '../../scripts/**',
  '../../turbo.json',
]

type DryRunTask = {
  taskId: string
  inputs: Record<string, string>
  dependencies: string[]
  resolvedTaskDefinition: { inputs: string[]; outputs: string[] }
}

function dryRunTasks(filter: string): Map<string, DryRunTask> {
  const out = execFileSync(
    join(ROOT, 'node_modules/.bin/turbo'),
    ['run', 'test', 'test:coverage', '--filter', filter, '--dry=json', '--no-daemon'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    },
  )
  const { tasks } = JSON.parse(out) as { tasks: DryRunTask[] }
  return new Map(tasks.map(task => [task.taskId, task]))
}

/** The hash git gives a file's content — what turbo records for an input. */
function blobHash(path: string): string {
  const content = readFileSync(join(ROOT, path))
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')
}

/**
 * What a @pair/workflows test in `dir` (repo-relative) reads outside its package, by any import
 * form the boundary accepts. The boundary lets a test reach out only through an `.md?raw`
 * specifier, relative or not: a relative one is resolved (query stripped), another is reported as
 * written.
 */
function outsideReads(dir: string, source: string): string[] {
  return [...source.matchAll(SPECIFIER)]
    .map(match => match[1] as string)
    .flatMap(specifier => {
      if (!specifier.startsWith('.')) return specifier.endsWith('.md?raw') ? [specifier] : []
      const target = posix.normalize(posix.join(dir, specifier.split('?')[0] as string))
      return target.startsWith(`${PACKAGE_DIR}/`) ? [] : [target]
    })
}

/** Every out-of-package read of the @pair/workflows test sources, as `<test>: <target>`. */
function outsideImports(): string[] {
  const src = join(ROOT, PACKAGE_DIR, 'src')
  const found = new Set<string>()
  for (const file of readdirSync(src, { recursive: true, encoding: 'utf8' })) {
    if (!file.endsWith('.test.ts')) continue
    const dir = posix.join(PACKAGE_DIR, 'src', posix.dirname(file.split('\\').join('/')))
    for (const target of outsideReads(dir, readFileSync(join(src, file), 'utf8')))
      found.add(`${file.split('\\').join('/')}: ${target}`)
  }
  return [...found].sort()
}

describe('the @pair/workflows test tasks keep what they had (r0-5 controls)', () => {
  let tasks: Map<string, DryRunTask>

  beforeAll(() => {
    tasks = dryRunTasks('@pair/workflows')
  }, 120_000)

  it.each(TEST_TASKS)('r0-5-c1: %s still hashes the files of its own package', taskId => {
    expect(Object.keys(tasks.get(taskId)?.inputs ?? {})).toEqual(
      expect.arrayContaining([
        'package.json',
        'vitest.config.ts',
        'src/kinds/reference.ts',
        'src/kinds/reference.test.ts',
      ]),
    )
  })

  it.each(TEST_TASKS)('r0-5-c2: %s still runs after the build of its package', taskId => {
    expect(tasks.get(taskId)?.dependencies).toContain('@pair/workflows#build')
  })

  it('r0-5-c3: the outputs of both tasks are unchanged', () => {
    expect(TEST_TASKS.map(taskId => tasks.get(taskId)?.resolvedTaskDefinition.outputs)).toEqual([
      [],
      ['coverage/**'],
    ])
  })

  it('r0-5-c4: the page is the only file outside the package a @pair/workflows test reads', () => {
    expect(outsideImports()).toEqual([
      // Rows of the table boundary.test.ts feeds its own predicate: strings, never imported.
      'boundary.test.ts: apps/pair-cli/src/commands/run/engines',
      'boundary.test.ts: knowledge-hub/dataset/x.md',
      `describe/reference.test.ts: ${SCHEMA_PAGE}`,
      `kinds/reference.test.ts: ${PAGE}`,
    ])
  })
})

describe('the file dimension is enumerated with the boundary grammar (r0-5 controls)', () => {
  const RAW = '../../../knowledge-hub/dataset/x.md?raw'
  const TARGET = 'packages/knowledge-hub/dataset/x.md'

  it.each([
    ['from, a static import', `import page from '${RAW}'`, TARGET],
    ['from, indented', `  import page from '${RAW}'`, TARGET],
    ['from, a re-export', `export { default } from '${RAW}'`, TARGET],
    ['import(', `const page = await import('${RAW}')`, TARGET],
    ['require(', `const page = require('${RAW}')`, TARGET],
    ['import, for its side effect', `import "${RAW}"`, TARGET],
    [
      'a specifier that is not relative',
      "import page from '@pair/knowledge-hub/x.md?raw'",
      '@pair/knowledge-hub/x.md?raw',
    ],
  ])('r0-5-c6: %s', (_form, source, target) => {
    expect(outsideReads('packages/workflows/src/kinds', source)).toEqual([target])
  })

  it('r0-5-c6: what the boundary keeps inside the package is not a read outside it', () => {
    const source = "import { it } from 'vitest'\nimport { kindByName } from '../kinds'"
    expect(outsideReads('packages/workflows/src/kinds', source)).toEqual([])
  })

  it('r0-5-c7: the grammar is the one boundary.test.ts declares', () => {
    expect(readFileSync(join(ROOT, PACKAGE_DIR, 'src/boundary.test.ts'), 'utf8')).toContain(
      `const SPECIFIER = ${String(SPECIFIER)}\n`,
    )
  })
})

describe('the tasks that run these guards keep what they had (r0-5 controls)', () => {
  let tasks: Map<string, DryRunTask>

  beforeAll(() => {
    tasks = dryRunTasks('@pair/knowledge-hub')
  }, 120_000)

  it.each(GUARD_TASKS)(
    'r0-5-c5: %s already hashes what the guards read outside @pair/workflows',
    taskId => {
      expect(tasks.get(taskId)?.inputs).toMatchObject({
        '../../turbo.json': blobHash('turbo.json'),
        '../../package.json': blobHash('package.json'),
        [posix.relative('packages/knowledge-hub', PAGE)]: blobHash(PAGE),
      })
    },
  )

  it.each(GUARD_TASKS)('r0-5-c8: %s keeps every input it declares today', taskId => {
    expect(tasks.get(taskId)?.resolvedTaskDefinition.inputs).toEqual(
      expect.arrayContaining(GUARD_INPUTS),
    )
    expect(tasks.get(taskId)?.dependencies).toContain('@pair/knowledge-hub#build')
  })

  it('r0-5-c8: the outputs of both tasks are unchanged', () => {
    expect(GUARD_TASKS.map(taskId => tasks.get(taskId)?.resolvedTaskDefinition.outputs)).toEqual([
      [],
      ['coverage/**'],
    ])
  })

  it('r0-5-i3: the two tasks declare the same inputs', () => {
    const [test, coverage] = GUARD_TASKS.map(
      taskId => tasks.get(taskId)?.resolvedTaskDefinition.inputs,
    )
    expect(test).toBeDefined()
    expect(coverage).toEqual(test)
  })
})
