import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const packageRoot = resolve(__dirname, '../..')
const model = 'src/http/retry.domain.ts'
const adapter = 'src/http/retryable-download.ts'
const fixture = 'src/http/retry-compile-control.ts'

type Location = [file: string, code: string, line: number, column: number]

function compile(workspace: string) {
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/typescript/bin/tsc',
      '--project',
      'tsconfig.json',
      '--noEmit',
      '--pretty',
      'false',
    ],
    { cwd: workspace, encoding: 'utf8' },
  )
  if (result.error) throw result.error
  const output = result.stdout + result.stderr
  const locations = Array.from(
    output.matchAll(/^(.+)\((\d+),(\d+)\): error (TS\d+):/gm),
    ([, file, line, column, code]): Location => [
      file ?? '',
      code ?? '',
      Number(line),
      Number(column),
    ],
  )
  const errors = Array.from(output.matchAll(/\berror TS\d+:/g)).length
  return { status: result.status, output, locations, errors }
}

function inProject(check: (workspace: string) => void, source?: string) {
  const workspace = mkdtempSync(join(tmpdir(), 'pair-retry-types-'))
  try {
    cpSync(join(packageRoot, 'src'), join(workspace, 'src'), {
      recursive: true,
      filter: path => !path.endsWith('.test.ts'),
    })
    cpSync(join(packageRoot, 'tsconfig.json'), join(workspace, 'tsconfig.json'))
    symlinkSync(join(packageRoot, 'node_modules'), join(workspace, 'node_modules'), 'dir')
    if (source !== undefined) writeFileSync(join(workspace, fixture), source)
    check(workspace)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}

// #750 AC-1/2/4. Compile each control through the inherited content-ops project.
describe('retry domain compiler contract', () => {
  it('inherits the three strict settings', () => {
    const config = ts.getParsedCommandLineOfConfigFile(
      join(packageRoot, 'tsconfig.json'),
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: diagnostic => {
          throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
        },
      },
    )
    expect(config?.errors).toEqual([])
    expect(config?.options).toMatchObject({
      strictNullChecks: true,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
    })
  })

  it('compiles the private success model', () => {
    inProject(workspace => {
      const { status, output } = compile(workspace)
      expect({ status, output }).toEqual({ status: 0, output: '' })
    }, `import type { RetryOutcome } from './retry.domain'\nexport const success: RetryOutcome = { tag: 'success' }\n`)
  })

  it('compiles an exhaustive consumer, normalized ingress and the bidirectional Promise API', () => {
    inProject(
      workspace => {
        const { status, output } = compile(workspace)
        expect({ status, output }).toEqual({ status: 0, output: '' })
      },
      `import { classifyRejection, type RetryOutcome, type RetryPolicy } from './retry.domain'
import { downloadFile, type DownloadOptions } from './download-manager'
import { downloadWithRetry, type RetryOptions } from './retryable-download'

type Expected = (url: string, destination: string, options: DownloadOptions, policy?: RetryOptions) => Promise<void>
type Failure = Extract<RetryOutcome, { tag: 'transient' | 'permanent' }>
export const actualAsExpected: Expected = downloadWithRetry
export function expectedAsActual(expected: Expected): typeof downloadWithRetry { return expected }

export function normalize(raw: RetryOptions, rejection: unknown): [RetryPolicy, Failure] {
  return [{
    maxRetries: raw.maxRetries ?? 3,
    delays: raw.delays ?? [1000, 2000, 4000],
    download: raw.downloadFn ?? downloadFile,
  }, classifyRejection(rejection)]
}

export function opaqueCause(tag: Failure['tag'], cause: unknown): Failure {
  return { tag, cause }
}

export function consume(outcome: RetryOutcome): unknown {
  switch (outcome.tag) {
    case 'success': return 'done'
    case 'transient': return outcome.cause
    case 'permanent': return outcome.cause
    default: {
      const exhaustive: never = outcome
      return exhaustive
    }
  }
}
`,
    )
  })

  const negatives = [
    {
      name: 'a fresh success with failure data',
      source: `import type { RetryOutcome } from './retry.domain'\nexport const impossible: RetryOutcome = { tag: 'success', cause: new Error('failure') }\n`,
      code: 'TS2353',
      column: 59,
    },
    {
      name: 'an unchecked delay index',
      source: `import type { RetryPolicy } from './retry.domain'\nexport const readDelay = (policy: RetryPolicy) => policy.delays[0].toFixed()\n`,
      code: 'TS2532',
      column: 51,
    },
    {
      name: 'raw retry options used as normalized policy',
      source: `import type { RetryPolicy } from './retry.domain'\nimport type { RetryOptions } from './retryable-download'\nexport const normalize = (raw: RetryOptions): RetryPolicy => raw\n`,
      code: 'TS2741',
      line: 3,
      column: 62,
    },
    {
      name: 'an unclassified rejection used as a domain outcome',
      source: `import type { RetryOutcome } from './retry.domain'\nexport const classify = (raw: unknown): RetryOutcome => raw\n`,
      code: 'TS2322',
      column: 57,
    },
  ]

  it.each(negatives)('rejects $name', ({ source, code, line = 2, column }) => {
    inProject(workspace => {
      const result = compile(workspace)
      expect(result.status, result.output).toBe(2)
      expect(result.errors, result.output).toBe(1)
      expect(result.locations, result.output).toEqual([[fixture, code, line, column]])
    }, source)
  })

  it('rejects a newly added tag at each live never dispatch', () => {
    inProject(workspace => {
      const path = join(workspace, model)
      const original = readFileSync(path, 'utf8')
      const file = ts.createSourceFile(path, original, ts.ScriptTarget.Latest, true)
      const outcome = file.statements.find(
        node => ts.isTypeAliasDeclaration(node) && node.name.text === 'RetryOutcome',
      )
      if (!outcome || !ts.isTypeAliasDeclaration(outcome)) {
        throw new Error('The private RetryOutcome type alias is missing')
      }
      const end = outcome.type.getEnd()
      writeFileSync(
        path,
        `${original.slice(0, end)} | { tag: 'test-only-added-variant' }${original.slice(end)}`,
      )

      const expected: Location[] = []
      for (const relative of [model, adapter]) {
        const source = ts.createSourceFile(
          relative,
          readFileSync(join(workspace, relative), 'utf8'),
          ts.ScriptTarget.Latest,
          true,
        )
        function visit(node: ts.Node) {
          if (ts.isVariableDeclaration(node) && node.type?.kind === ts.SyntaxKind.NeverKeyword) {
            const { line, character } = source.getLineAndCharacterOfPosition(
              node.name.getStart(source),
            )
            expected.push([relative, 'TS2322', line + 1, character + 1])
          }
          ts.forEachChild(node, visit)
        }
        visit(source)
      }
      expect(expected.length).toBeGreaterThan(0)
      const result = compile(workspace)
      expect(result.status, result.output).toBe(2)
      expect(result.errors, result.output).toBe(expected.length)
      expect(result.locations, result.output).toEqual(expected)
      expect(result.output).toContain('test-only-added-variant')
    })
  })
})
