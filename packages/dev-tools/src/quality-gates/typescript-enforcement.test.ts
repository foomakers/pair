import { fileSystemService as fs } from '@pair/content-ops'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { expect, it } from 'vitest'

const root = resolve(__dirname, '../../../..')
const compiler = join(root, 'packages/dev-tools/node_modules/@typescript/native/bin/tsc')

function trackedPaths(...patterns: string[]) {
  return execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...patterns],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)
    .sort()
}

const generated = `
export declare const generated: {
  name: string | null
  label?: string
  aliases: readonly string[]
}
`
const allowed = `
import { generated } from './generated.js'
import './setup.js'
export const handwrittenNull: string | null = null
export const handwrittenOptional: { label?: string } = {}
export const handwrittenIndex = (list: string[]) => list[0]?.length
export const missingReturn = (flag: boolean) => flag ? 1 : undefined
export function fallthrough(value: number) {
  switch (value) {
    case 0: return 1
    case 1: return value
    default: return 0
  }
}
export const generatedNull: string = generated.name ?? ''
export const generatedOptional: { label?: string } =
  generated.label === undefined ? {} : { label: generated.label }
export const generatedIndex = generated.aliases[0]?.length
`
const violations = [
  "import { generated } from './generated.js'",
  "import './unresolved.css'",
  'export const handwrittenNull: string = null',
  'export const handwrittenOptional: { label?: string } = { label: undefined }',
  'export const handwrittenIndex = (list: string[]) => list[0].length',
  'export function missingReturn(flag: boolean) { if (flag) return 1 }',
  'export function fallthrough(value: number) {',
  '  switch (value) {',
  '    case 0:',
  '      value++',
  '    case 1:',
  '      return value',
  '  }',
  '  return value',
  '}',
  'export const generatedNull: string = generated.name',
  'export const generatedOptional: { label?: string } = { label: generated.label }',
  'export const generatedIndex = generated.aliases[0].length',
]
const expectedDiagnostics = [
  [2, 8, 2882],
  [3, 14, 2322],
  [4, 14, 2375],
  [5, 53, 2532],
  [6, 17, 7030],
  [9, 5, 7029],
  [16, 14, 2322],
  [17, 14, 2375],
  [18, 31, 2532],
]

const configs = trackedPaths(':(glob)apps/*/tsconfig*.json', ':(glob)packages/*/tsconfig*.json')

it.each(configs)('#757 AC-3: %s enforces strictness in handwritten and generated types', config => {
  const cwd = fs.mkdtempSync(join(tmpdir(), 'pair-type-constraints-'))
  try {
    const project = join(root, config)
    fs.symlinkSync(join(dirname(project), 'node_modules'), join(cwd, 'node_modules'))
    fs.writeFileSync(join(cwd, 'generated.d.ts'), generated)
    fs.writeFileSync(join(cwd, 'setup.ts'), 'export {}\n')
    fs.writeFileSync(join(cwd, 'fixture.ts'), allowed)
    fs.writeFileSync(
      join(cwd, 'tsconfig.json'),
      JSON.stringify({
        extends: project,
        compilerOptions: {
          composite: false,
          incremental: false,
          declarationMap: false,
          rootDir: '.',
          noEmit: true,
        },
        include: ['*.ts'],
      }),
    )

    const check = () =>
      spawnSync(process.execPath, [compiler, '--pretty', 'false'], { cwd, encoding: 'utf8' })
    const control = check()
    expect(control.error).toBeUndefined()
    expect(control.status, control.stdout + control.stderr).toBe(0)
    expect(control.stdout + control.stderr).toBe('')

    fs.writeFileSync(join(cwd, 'fixture.ts'), violations.join('\n') + '\n')
    const rejected = check()
    expect(rejected.error).toBeUndefined()
    expect(rejected.status, rejected.stdout + rejected.stderr).toBe(1)
    const output = rejected.stdout + rejected.stderr
    const diagnostics = output
      .trim()
      .split('\n')
      .filter(line => line.includes('error TS'))
    expect(
      diagnostics.map(line => {
        const match = /^fixture\.ts\((\d+),(\d+)\): error TS(\d+):/.exec(line)
        return match?.slice(1).map(Number) ?? line
      }),
      output,
    ).toEqual(expectedDiagnostics)

    fs.writeFileSync(join(cwd, 'fixture.ts'), allowed)
    fs.writeFileSync(join(cwd, 'new-source.ts'), "import './unresolved.css'\n")
    const added = check()
    expect(added.error).toBeUndefined()
    expect(added.status, added.stdout + added.stderr).toBe(1)
    expect((added.stdout + added.stderr).trim()).toMatch(
      /^new-source\.ts\(1,8\): error TS2882:[^\n]+$/,
    )

    const effective = execFileSync(process.execPath, [compiler, '-p', project, '--showConfig'], {
      cwd: root,
      encoding: 'utf8',
    })
    expect(JSON.parse(effective).compilerOptions.noUncheckedSideEffectImports).toBe(true)
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

it('#757 AC-4: accepts only reviewed declarations backed by their CSS files', () => {
  const sources = trackedPaths('apps', 'packages').filter(path => /\.(?:[cm]?ts|tsx)$/.test(path))
  const styles = sources.filter(path => path.endsWith('.d.css.ts'))
  expect(styles).toEqual(['apps/website/app/global.d.css.ts', 'packages/brand/dev/styles.d.css.ts'])
  for (const style of styles) {
    expect(fs.existsSync(join(root, style.replace(/\.d\.css\.ts$/, '.css'))), style).toBe(true)
  }
  const ambient = sources.filter(path =>
    /declare\s+module\s+['"](?:[^'"]*\.css|\*|\*\.\*)['"]/.test(fs.readFileSync(join(root, path))),
  )
  expect(ambient).toEqual([])
})
