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

async function withCssFixture(run: (cwd: string) => Promise<void>) {
  const cwd = fs.mkdtempSync(join(tmpdir(), 'pair-css-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd })
    for (const declaration of reviewedDeclarations) {
      fs.mkdirSync(dirname(join(cwd, declaration)), { recursive: true })
      fs.writeFileSync(join(cwd, declaration), 'export {}\n')
      fs.writeFileSync(join(cwd, declaration.replace(/\.d\.css\.ts$/, '.css')), '')
    }
    await run(cwd)
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
}

it('#757 AC-4 R758-01: rejects an unreviewed legacy CSS declaration', async () => {
  await withCssFixture(async cwd => {
    const legacy = 'packages/brand/dev/missing-review.css.d.ts'
    fs.writeFileSync(join(cwd, legacy), 'export {}\n')
    expect(await checkStylesheets(cwd)).toEqual([`Unreviewed CSS declaration: ${legacy}`])
  })
})

it('#757 AC-4 R758-03: rejects a wildcard declaration in a new Brand file', async () => {
  await withCssFixture(async cwd => {
    const ambient = 'packages/brand/dev/ambient.d.ts'
    fs.writeFileSync(join(cwd, ambient), "declare module '*.css' {}\n")
    expect(await checkStylesheets(cwd)).toEqual([`Ambient CSS declaration: ${ambient}`])
  })
})

it.each([
  "type Style = import('react').CSSProperties\ndeclare module '*.css' {}",
  "module '*.css' {}",
  "declare module '*.css?inline' {}",
])('#757 AC-4 R758-01: rejects the unreviewed declaration %j', async declaration => {
  await withCssFixture(async cwd => {
    const ambient = 'packages/brand/dev/ambient.d.ts'
    fs.writeFileSync(join(cwd, ambient), "declare module '*.svg?inline' {}\n")
    expect(await checkStylesheets(cwd)).toEqual([])

    fs.writeFileSync(join(cwd, ambient), declaration)
    expect(await checkStylesheets(cwd)).toEqual([`Ambient CSS declaration: ${ambient}`])
  })
})

it.each(['reference', 'compilerOptions.types'])(
  '#757 AC-4 R758-01: rejects CSS declarations enabled by %s',
  async channel => {
    await withCssFixture(async cwd => {
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
      expect(await checkStylesheets(cwd)).toEqual([])

      if (channel === 'reference') {
        fs.writeFileSync(source, '/// <reference types="vite/client" />\nimport \'missing.css\'\n')
      } else {
        writeConfig(['vite/client'])
      }
      expect(await checkStylesheets(cwd)).toEqual([
        expect.stringMatching(/^Ambient CSS declaration: .*vite\/client\.d\.ts$/),
      ])
    })
  },
)

it('#757 AC-4 R758-02: rejects a missing CSS module despite Next ambient types', async () => {
  await withCssFixture(async cwd => {
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
    expect(await checkStylesheets(cwd)).toEqual([])
    fs.rmSync(stylesheet)

    const checked = spawnSync(process.execPath, [compiler, '-p', config, '--pretty', 'false'], {
      cwd,
      encoding: 'utf8',
    })
    expect(checked.error).toBeUndefined()
    expect(checked.status, checked.stdout + checked.stderr).toBe(0)
    expect(await checkStylesheets(cwd)).toEqual([
      `Missing stylesheet: ${importer} imports ${specifier}`,
    ])

    // The same Next file is inspected first for the website, then for Brand.
    fs.writeFileSync(stylesheet, '')
    const brand = join(cwd, 'packages/brand')
    fs.writeFileSync(join(brand, 'dev/fixture.module.css'), '')
    fs.writeFileSync(
      join(brand, 'dev/style-fixture.ts'),
      '/// <reference path="../../../apps/website/next-env.d.ts" />\n' +
        "import './fixture.module.css'\n",
    )
    fs.writeFileSync(
      join(brand, 'tsconfig.json'),
      JSON.stringify({
        extends: join(root, 'packages/brand/tsconfig.json'),
        compilerOptions: { noLib: true, types: [] },
        files: ['dev/style-fixture.ts'],
        include: [],
      }),
    )
    expect(await checkStylesheets(cwd)).toEqual([
      expect.stringMatching(/^Ambient CSS declaration: .*next\/types\/global\.d\.ts$/),
    ])
  })
})

it.each(['scss', 'sass'])('#757 AC-4 R758-02: checks local %s modules', async extension => {
  await withCssFixture(async cwd => {
    const importer = 'apps/website/app/style-fixture.ts'
    const specifier = `./fixture.module.${extension}`
    const stylesheet = join(cwd, dirname(importer), specifier)
    fs.writeFileSync(join(cwd, importer), `import styles from '${specifier}'\nexport { styles }\n`)

    fs.writeFileSync(stylesheet, '')
    expect(await checkStylesheets(cwd)).toEqual([])

    fs.rmSync(stylesheet)
    expect(await checkStylesheets(cwd)).toEqual([
      `Missing stylesheet: ${importer} imports ${specifier}`,
    ])
  })
})

it('#757 AC-4 R758-02: checks workspace stylesheet exports', async () => {
  await withCssFixture(async cwd => {
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
    expect(await checkStylesheets(cwd)).toEqual([])

    for (const specifier of ['@pair/brand/dev/styles.css', '@pair/brand/missing.module.css']) {
      writeImport(specifier)
      expect(await checkStylesheets(cwd)).toEqual([
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
])(
  '#757 AC-4 R758-02: selects the package export for $form',
  async ({ statement, targets, missing }) => {
    await withCssFixture(async cwd => {
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
      expect(await checkStylesheets(cwd)).toEqual(
        missing ? [`Missing stylesheet: ${importer} imports @pair/styles/theme.css`] : [],
      )
    })
  },
)

it.each([
  {
    target: 'Next server',
    importer: 'apps/website/app/page.tsx',
    manifest: { exports: { './theme.css': { browser: './browser.css', node: './theme.css' } } },
    alternatives: ['browser.css'],
  },
  {
    target: 'Next React Server Components',
    importer: 'apps/website/app/page.tsx',
    manifest: {
      exports: { './theme.css': { 'react-server': './theme.css', default: './browser.css' } },
    },
    alternatives: ['browser.css'],
  },
  {
    target: 'a Next Server Action imported by a Client Component',
    importer: 'apps/website/app/action.ts',
    beforeImport: "'use server'\n",
    files: {
      'app/page.tsx': "export { default } from './client'\n",
      'app/client.tsx':
        "'use client'\nimport { save } from './action'\nexport default () => <form action={save} />\n",
    },
    afterImport: 'export async function save() {}\n',
    manifest: {
      exports: { './theme.css': { 'react-server': './theme.css', default: './fallback.css' } },
    },
    alternatives: ['fallback.css'],
  },
  {
    target: 'a Next Edge page',
    importer: 'apps/website/app/page.tsx',
    afterImport: "export const runtime = 'edge'\nexport default () => null\n",
    manifest: {
      exports: { './theme.css': { 'edge-light': './theme.css', default: './fallback.css' } },
    },
    alternatives: ['fallback.css'],
  },
  {
    target: 'a Next page inheriting the Edge runtime',
    importer: 'apps/website/app/page.tsx',
    files: {
      'app/layout.tsx':
        "export const runtime = 'edge'\nexport default ({ children }) => <html><body>{children}</body></html>\n",
    },
    afterImport: 'export default () => null\n',
    manifest: {
      exports: { './theme.css': { 'edge-light': './theme.css', default: './fallback.css' } },
    },
    alternatives: ['fallback.css'],
  },
  {
    target: 'the loading component of a Next Edge page',
    importer: 'apps/website/app/edge/loading.jsx',
    files: {
      'app/edge/page.jsx': "export const runtime = 'edge'\nexport default () => null\n",
    },
    afterImport: 'export default () => null\n',
    manifest: {
      exports: { './theme.css': { 'edge-light': './theme.css', default: './fallback.css' } },
    },
    alternatives: ['fallback.css'],
  },
  {
    target: 'a Next loading component shared by Edge and Node routes',
    importer: 'apps/website/app/group/loading.jsx',
    files: {
      'app/group/edge/page.jsx': "export const runtime = 'edge'\nexport default () => null\n",
      'app/group/node/page.jsx': 'export default () => null\n',
    },
    afterImport: 'export default () => null\n',
    manifest: {
      exports: { './theme.css': { 'edge-light': './theme.css', default: './fallback.css' } },
    },
    alternatives: ['fallback.css'],
    needsAlternative: true,
  },
  {
    target: 'a Next root loading component shared by an Edge page and the built-in 404',
    importer: 'apps/website/app/loading.jsx',
    files: {
      'app/edge/page.jsx': "export const runtime = 'edge'\nexport default () => null\n",
    },
    afterImport: 'export default () => null\n',
    manifest: {
      exports: { './theme.css': { 'edge-light': './theme.css', default: './fallback.css' } },
    },
    alternatives: ['fallback.css'],
    needsAlternative: true,
  },
  {
    target: 'Next development server',
    importer: 'apps/website/app/page.tsx',
    manifest: { exports: { './theme.css': { development: './theme.css', default: './prod.css' } } },
    alternatives: ['prod.css'],
    needsAlternative: true,
  },
  {
    target: 'Vite browser file mapping',
    importer: 'packages/brand/dev/demo.ts',
    manifest: { browser: { './theme.css': './mapped.css' } },
    alternatives: ['theme.css'],
    selected: 'mapped.css',
  },
  {
    target: 'Vite development server',
    importer: 'packages/brand/dev/demo.ts',
    manifest: { exports: { './theme.css': { development: './theme.css', default: './prod.css' } } },
    alternatives: ['prod.css'],
    needsAlternative: true,
  },
])(
  '#757 AC-4 R758-02: checks the target selected by $target',
  async ({
    importer,
    manifest,
    alternatives,
    selected = 'theme.css',
    needsAlternative = false,
    beforeImport = '',
    afterImport = '',
    files,
  }) => {
    await withCssFixture(async cwd => {
      const workspace = importer.split('/').slice(0, 2).join('/')
      const scope = join(cwd, workspace, 'node_modules/@pair')
      const styles = join(cwd, 'packages/styles')
      fs.mkdirSync(scope, { recursive: true })
      fs.mkdirSync(styles)
      fs.symlinkSync(styles, join(scope, 'styles'))
      fs.writeFileSync(
        join(styles, 'package.json'),
        JSON.stringify({ name: '@pair/styles', ...manifest }),
      )
      const specifier = '@pair/styles/theme.css'
      for (const [file, source] of Object.entries(files ?? {})) {
        const path = join(cwd, workspace, file)
        fs.mkdirSync(dirname(path), { recursive: true })
        fs.writeFileSync(path, source)
      }
      fs.writeFileSync(join(cwd, importer), `${beforeImport}import '${specifier}'\n${afterImport}`)
      for (const alternative of alternatives) fs.writeFileSync(join(styles, alternative), '')
      fs.writeFileSync(join(styles, selected), '')
      expect(await checkStylesheets(cwd)).toEqual([])

      fs.rmSync(join(styles, selected))
      expect(await checkStylesheets(cwd)).toEqual([
        `Missing stylesheet: ${importer} imports ${specifier}`,
      ])

      fs.writeFileSync(join(styles, selected), '')
      for (const alternative of alternatives) fs.rmSync(join(styles, alternative))
      expect(await checkStylesheets(cwd)).toEqual(
        needsAlternative ? [`Missing stylesheet: ${importer} imports ${specifier}`] : [],
      )
    })
  },
)

it('#757 AC-4 R758-02: checks both Next client layers through imports', async () => {
  await withCssFixture(async cwd => {
    const app = join(cwd, 'apps/website/app')
    fs.writeFileSync(join(app, 'page.tsx'), "export { default } from './client'\n")
    fs.writeFileSync(join(app, 'client.tsx'), "'use client'\nexport { default } from './child'\n")
    const importer = 'apps/website/app/child.tsx'
    const specifier = '@pair/styles/theme.css'
    fs.writeFileSync(join(cwd, importer), `import '${specifier}'\nexport default () => null\n`)
    const styles = join(cwd, 'apps/website/node_modules/@pair/styles')
    fs.mkdirSync(styles, { recursive: true })
    fs.writeFileSync(
      join(styles, 'package.json'),
      JSON.stringify({
        name: '@pair/styles',
        exports: {
          './theme.css': {
            'react-server': './unselected.css',
            browser: './browser.css',
            node: './ssr.css',
          },
        },
      }),
    )
    const missing = [`Missing stylesheet: ${importer} imports ${specifier}`]
    fs.writeFileSync(join(styles, 'browser.css'), '')
    expect(await checkStylesheets(cwd)).toEqual(missing)
    fs.writeFileSync(join(styles, 'ssr.css'), '')
    expect(await checkStylesheets(cwd)).toEqual([])
    fs.rmSync(join(styles, 'browser.css'))
    expect(await checkStylesheets(cwd)).toEqual(missing)
  })
})

it('#757 AC-4 R758-04: distinguishes JSX text from stylesheet imports', async () => {
  await withCssFixture(async cwd => {
    const importer = 'apps/website/app/style-example.tsx'
    const path = join(cwd, importer)
    const example = "export const Example = () => <code>import './example.css'</code>\n"
    fs.writeFileSync(path, example)
    expect(await checkStylesheets(cwd)).toEqual([])

    fs.writeFileSync(
      path,
      "import './actual.css'\n" +
        example +
        "export const Button = () => <button onClick={() => void import('./lazy.css')} />\n",
    )
    expect(await checkStylesheets(cwd)).toEqual([
      `Missing stylesheet: ${importer} imports ./actual.css`,
      `Missing stylesheet: ${importer} imports ./lazy.css`,
    ])
  })
})
