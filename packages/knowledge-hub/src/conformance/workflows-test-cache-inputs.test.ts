/**
 * Review finding r0-5 (story #652): the kind-reference staleness test of @pair/workflows
 * (`packages/workflows/src/kinds/reference.test.ts`, AC-8) imports a page that lives OUTSIDE its
 * package. A turbo task hashes only the files turbo lists as its inputs, so a page that is not
 * among them can be edited and the cached PASS is replayed — the local false green `turbo.json`
 * documents and closes for `@pair/knowledge-hub#test`.
 *
 * The authority is turbo itself: `turbo run … --dry=json` prints, per task, the files it hashes.
 * It lives here and not beside the test it protects because @pair/workflows may not import
 * `node:child_process` or `node:fs` (its `boundary.test.ts`), and because this package's test
 * task already declares `$TURBO_ROOT$/turbo.json` as an input.
 *
 * Living here has the same price one package over: these guards and their controls read
 * @pair/workflows — its test sources, and what turbo resolves from its files — from a task of
 * @pair/knowledge-hub, which does not depend on it. So the tasks that RUN the guards must hash
 * those files too, or the guards themselves are replayed from a stale PASS.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

const ROOT = join(__dirname, '../../../..')
const PACKAGE_DIR = 'packages/workflows'
const GUARDS_DIR = 'packages/knowledge-hub'
const PAGE =
  'packages/knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/automation/workflow-kinds.md'

type DryRunTask = { taskId: string; inputs: Record<string, string> }

/** The files turbo hashes for each test task of a package, keyed by repo-relative path. */
function dryRunInputs(filter: string, packageDir: string): Map<string, Record<string, string>> {
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
  return new Map(
    tasks.map(task => [
      task.taskId,
      Object.fromEntries(
        Object.entries(task.inputs).map(([file, hash]) => [
          posix.normalize(posix.join(packageDir, file)),
          hash,
        ]),
      ),
    ]),
  )
}

/** The hash git gives a file's content — what turbo records for an input. */
function blobHash(path: string): string {
  const content = readFileSync(join(ROOT, path))
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')
}

describe('the kind reference page is a cache input of the @pair/workflows test tasks (r0-5)', () => {
  let inputs: Map<string, Record<string, string>>

  beforeAll(() => {
    inputs = dryRunInputs('@pair/workflows', PACKAGE_DIR)
  }, 120_000)

  it('r0-5-w1: @pair/workflows#test hashes the page its staleness test reads', () => {
    expect(Object.keys(inputs.get('@pair/workflows#test') ?? {})).toContain(PAGE)
  })

  it('r0-5-w2: @pair/workflows#test:coverage hashes it too', () => {
    expect(Object.keys(inputs.get('@pair/workflows#test:coverage') ?? {})).toContain(PAGE)
  })

  it.each(['@pair/workflows#test', '@pair/workflows#test:coverage'])(
    'r0-5-i1: %s records the content of the page, so an edit changes the key',
    taskId => {
      expect(inputs.get(taskId)?.[PAGE]).toBe(blobHash(PAGE))
    },
  )
})

describe('the tasks that run these guards hash the @pair/workflows files they read (r0-5)', () => {
  /** What turbo hashes for @pair/workflows#test inside the package: the files the guards observe. */
  let observed: Record<string, string>
  let guards: Map<string, Record<string, string>>

  beforeAll(() => {
    const workflows = dryRunInputs('@pair/workflows', PACKAGE_DIR).get('@pair/workflows#test') ?? {}
    observed = Object.fromEntries(
      Object.entries(workflows).filter(([file]) => file.startsWith(`${PACKAGE_DIR}/`)),
    )
    guards = dryRunInputs('@pair/knowledge-hub', GUARDS_DIR)
  }, 240_000)

  /** The test sources of @pair/workflows — the files row c4 opens to enumerate their imports. */
  function testSources(): Record<string, string> {
    const sources = Object.keys(observed).filter(file => file.endsWith('.test.ts'))
    expect(sources).toContain('packages/workflows/src/kinds/reference.test.ts')
    return Object.fromEntries(sources.map(file => [file, blobHash(file)]))
  }

  /** What a task of the guards records for `files` — only those, so a failure names them. */
  function hashed(taskId: string, files: Record<string, string>): Record<string, string> {
    const inputs = guards.get(taskId) ?? {}
    return Object.fromEntries(
      Object.keys(files).flatMap(file => (file in inputs ? [[file, inputs[file] as string]] : [])),
    )
  }

  it('r0-5-w3: @pair/knowledge-hub#test hashes every @pair/workflows test source', () => {
    const sources = testSources()
    expect(hashed('@pair/knowledge-hub#test', sources)).toEqual(sources)
  })

  it('r0-5-w4: @pair/knowledge-hub#test:coverage hashes them too', () => {
    const sources = testSources()
    expect(hashed('@pair/knowledge-hub#test:coverage', sources)).toEqual(sources)
  })

  it.each(['@pair/knowledge-hub#test', '@pair/knowledge-hub#test:coverage'])(
    'r0-5-i2: %s hashes every file turbo resolves the @pair/workflows test tasks from',
    taskId => {
      expect(Object.keys(observed)).toContain('packages/workflows/package.json')
      expect(hashed(taskId, observed)).toEqual(observed)
    },
  )
})
