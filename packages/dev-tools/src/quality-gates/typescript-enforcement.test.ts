import { fileSystemService as fs } from '@pair/content-ops'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { expect, it } from 'vitest'

import { checkStylesheets } from './css-guard'

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

const reviewedDeclarations = [
  'apps/website/app/global.d.css.ts',
  'packages/brand/dev/styles.d.css.ts',
]

function withCssFixture(run: (cwd: string) => void) {
  const cwd = fs.mkdtempSync(join(tmpdir(), 'pair-css-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd })
    for (const declaration of reviewedDeclarations) {
      fs.mkdirSync(dirname(join(cwd, declaration)), { recursive: true })
      fs.writeFileSync(join(cwd, declaration), 'export {}\n')
      fs.writeFileSync(join(cwd, declaration.replace(/\.d\.css\.ts$/, '.css')), '')
    }
    run(cwd)
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
}

it('#757 AC-4 R758-01: rejects an unreviewed legacy CSS declaration', () => {
  withCssFixture(cwd => {
    const legacy = 'packages/brand/dev/missing-review.css.d.ts'
    fs.writeFileSync(join(cwd, legacy), 'export {}\n')
    expect(checkStylesheets(cwd)).toEqual([`Unreviewed CSS declaration: ${legacy}`])
  })
})

it('#757 AC-4 R758-03: rejects a wildcard declaration in a new Brand file', () => {
  withCssFixture(cwd => {
    const ambient = 'packages/brand/dev/ambient.d.ts'
    fs.writeFileSync(join(cwd, ambient), "declare module '*.css' {}\n")
    expect(checkStylesheets(cwd)).toEqual([`Ambient CSS declaration: ${ambient}`])
  })
})

it.each([
  "type Style = import('react').CSSProperties\ndeclare module '*.css' {}",
  "module '*.css' {}",
  "declare module '*.css?inline' {}",
])('#757 AC-4 R758-01: rejects the unreviewed declaration %j', declaration => {
  withCssFixture(cwd => {
    const ambient = 'packages/brand/dev/ambient.d.ts'
    fs.writeFileSync(join(cwd, ambient), "declare module '*.svg?inline' {}\n")
    expect(checkStylesheets(cwd)).toEqual([])

    fs.writeFileSync(join(cwd, ambient), declaration)
    expect(checkStylesheets(cwd)).toEqual([`Ambient CSS declaration: ${ambient}`])
  })
})

it.each(['reference', 'compilerOptions.types'])(
  '#757 AC-4 R758-01: rejects CSS declarations enabled by %s',
  channel => {
    withCssFixture(cwd => {
      const brand = join(cwd, 'packages/brand')
      const config = join(brand, 'tsconfig.json')
      const source = join(brand, 'dev/style-fixture.ts')
      fs.symlinkSync(join(root, 'packages/brand/node_modules'), join(brand, 'node_modules'))
      const writeConfig = (types: string[]) =>
        fs.writeFileSync(
          config,
          JSON.stringify({
            extends: join(root, 'packages/brand/tsconfig.json'),
            compilerOptions: { noLib: true, types },
            files: ['dev/style-fixture.ts'],
            include: [],
          }),
        )

      writeConfig([])
      fs.writeFileSync(source, "import './styles.css'\n")
      expect(checkStylesheets(cwd)).toEqual([])

      if (channel === 'reference') {
        fs.writeFileSync(source, '/// <reference types="vite/client" />\nimport \'missing.css\'\n')
      } else {
        writeConfig(['vite/client'])
      }
      expect(checkStylesheets(cwd)).toEqual([
        expect.stringMatching(/^Ambient CSS declaration: .*vite\/client\.d\.ts$/),
      ])
    })
  },
)

it('#757 AC-4 R758-02: rejects a missing CSS module despite Next ambient types', () => {
  withCssFixture(cwd => {
    const importer = 'apps/website/app/style-fixture.ts'
    const stylesheet = join(cwd, 'apps/website/app/fixture.module.css')
    const specifier = './fixture.module.css'
    const website = join(cwd, 'apps/website')
    const config = join(website, 'tsconfig.json')
    fs.symlinkSync(join(root, 'apps/website/node_modules'), join(website, 'node_modules'))
    fs.writeFileSync(join(website, 'next-env.d.ts'), '/// <reference types="next" />\n')
    fs.writeFileSync(join(cwd, importer), `import styles from '${specifier}'\nexport { styles }\n`)
    fs.writeFileSync(
      config,
      JSON.stringify({
        extends: join(root, 'apps/website/tsconfig.json'),
        compilerOptions: { incremental: false },
        files: ['next-env.d.ts', 'app/style-fixture.ts'],
        include: [],
      }),
    )

    fs.writeFileSync(stylesheet, '')
    expect(checkStylesheets(cwd)).toEqual([])
    fs.rmSync(stylesheet)

    const checked = spawnSync(process.execPath, [compiler, '-p', config, '--pretty', 'false'], {
      cwd,
      encoding: 'utf8',
    })
    expect(checked.error).toBeUndefined()
    expect(checked.status, checked.stdout + checked.stderr).toBe(0)
    expect(checkStylesheets(cwd)).toEqual([`Missing stylesheet: ${importer} imports ${specifier}`])
  })
})

it.each(['scss', 'sass'])('#757 AC-4 R758-02: checks local %s modules', extension => {
  withCssFixture(cwd => {
    const importer = 'apps/website/app/style-fixture.ts'
    const specifier = `./fixture.module.${extension}`
    const stylesheet = join(cwd, dirname(importer), specifier)
    fs.writeFileSync(join(cwd, importer), `import styles from '${specifier}'\nexport { styles }\n`)

    fs.writeFileSync(stylesheet, '')
    expect(checkStylesheets(cwd)).toEqual([])

    fs.rmSync(stylesheet)
    expect(checkStylesheets(cwd)).toEqual([`Missing stylesheet: ${importer} imports ${specifier}`])
  })
})

it('#757 AC-4 R758-02: checks workspace stylesheet exports', () => {
  withCssFixture(cwd => {
    const importer = 'apps/website/app/style-fixture.ts'
    const brand = join(cwd, 'packages/brand')
    const scope = join(cwd, 'apps/website/node_modules/@pair')
    fs.mkdirSync(scope, { recursive: true })
    fs.symlinkSync(brand, join(scope, 'brand'))
    fs.writeFileSync(
      join(brand, 'package.json'),
      JSON.stringify({
        name: '@pair/brand',
        exports: { './tokens.css': './dev/styles.css', './missing.module.css': './missing.css' },
      }),
    )
    const writeImport = (specifier: string) =>
      fs.writeFileSync(join(cwd, importer), `import '${specifier}'\n`)

    writeImport('@pair/brand/tokens.css')
    expect(checkStylesheets(cwd)).toEqual([])

    for (const specifier of ['@pair/brand/dev/styles.css', '@pair/brand/missing.module.css']) {
      writeImport(specifier)
      expect(checkStylesheets(cwd)).toEqual([
        `Missing stylesheet: ${importer} imports ${specifier}`,
      ])
    }
  })
})

it.each([
  {
    form: 'static import',
    statement: "import '@pair/styles/theme.css'",
    targets: { import: './theme.css', require: './missing.css' },
    missing: false,
  },
  {
    form: 'dynamic import',
    statement: "void import('@pair/styles/theme.css')",
    targets: { import: './missing.css', require: './theme.css' },
    missing: true,
  },
  {
    form: 'require',
    statement: "require('@pair/styles/theme.css')",
    targets: { import: './missing.css', require: './theme.css' },
    missing: false,
  },
  {
    form: 'Vite browser import',
    statement: "import '@pair/styles/theme.css'",
    targets: { browser: './theme.css', import: './missing.css', require: './missing.css' },
    missing: false,
  },
])('#757 AC-4 R758-02: selects the package export for $form', ({ statement, targets, missing }) => {
  withCssFixture(cwd => {
    const importer = 'packages/brand/dev/style-fixture.ts'
    const scope = join(cwd, 'packages/brand/node_modules/@pair')
    const styles = join(cwd, 'packages/styles')
    fs.mkdirSync(scope, { recursive: true })
    fs.mkdirSync(styles)
    fs.symlinkSync(styles, join(scope, 'styles'))
    fs.writeFileSync(join(styles, 'theme.css'), '')
    fs.writeFileSync(
      join(styles, 'package.json'),
      JSON.stringify({ name: '@pair/styles', exports: { './theme.css': targets } }),
    )
    fs.writeFileSync(join(cwd, importer), statement)
    expect(checkStylesheets(cwd)).toEqual(
      missing ? [`Missing stylesheet: ${importer} imports @pair/styles/theme.css`] : [],
    )
  })
})

it('#757 AC-4 R758-04: distinguishes JSX text from stylesheet imports', () => {
  withCssFixture(cwd => {
    const importer = 'apps/website/app/style-example.tsx'
    const path = join(cwd, importer)
    const example = "export const Example = () => <code>import './example.css'</code>\n"
    fs.writeFileSync(path, example)
    expect(checkStylesheets(cwd)).toEqual([])

    fs.writeFileSync(
      path,
      "import './actual.css'\n" +
        example +
        "export const Button = () => <button onClick={() => void import('./lazy.css')} />\n",
    )
    expect(checkStylesheets(cwd)).toEqual([
      `Missing stylesheet: ${importer} imports ./actual.css`,
      `Missing stylesheet: ${importer} imports ./lazy.css`,
    ])
  })
})
