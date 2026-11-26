import { fileSystemService as fs } from '@pair/content-ops'
import { create } from 'enhanced-resolve'
import { execFileSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

import { REPO_ROOT } from './repo-root'

const reviewedDeclarations = new Map([
  ['apps/website/app/global.d.css.ts', 'apps/website/app/global.css'],
  ['packages/brand/dev/styles.d.css.ts', 'packages/brand/dev/styles.css'],
])
const nextCssModules = new Set(['*.module.css', '*.module.sass', '*.module.scss'])

type ImportMode = 'import' | 'require'

function resolveWorkspaceStylesheet(
  root: string,
  importer: string,
  stylesheet: string,
  mode: ImportMode,
) {
  // Match the production client conditions for the Vite and Next workspaces.
  let conditions = ['node', 'node-addons']
  if (importer.startsWith('packages/brand/')) {
    conditions = ['module', 'browser', 'production']
  } else if (importer.startsWith('apps/website/')) {
    conditions = ['webpack', 'module', 'browser', 'production']
  }
  const resolveExport = create.sync({ conditionNames: [mode, ...conditions], fullySpecified: true })
  try {
    return resolveExport(join(root, dirname(importer)), stylesheet) || null
  } catch {
    return null
  }
}

function localStylesheet(root: string, importer: string, specifier: string, mode: ImportMode) {
  const stylesheet = specifier.split(/[?#]/, 1)[0]
  if (!stylesheet || !/\.(?:css|sass|scss)$/.test(stylesheet)) return undefined
  if (/^\.\.?\//.test(stylesheet)) return resolve(root, dirname(importer), stylesheet)
  if (importer.startsWith('apps/website/') && stylesheet.startsWith('@/')) {
    return join(root, 'apps/website', stylesheet.slice(2))
  }
  if (importer.startsWith('packages/brand/') && /^\$(?:components|tokens)\//.test(stylesheet)) {
    return join(root, 'packages/brand/src', stylesheet.slice(1))
  }
  if (stylesheet.startsWith('@pair/')) {
    return resolveWorkspaceStylesheet(root, importer, stylesheet, mode)
  }
  return undefined
}

function isFile(path: string) {
  return fs.existsSync(path) && fs.statSync(path).isFile()
}

function declaresStylesheets(name: string) {
  const [pattern = ''] = name.split(/[?#]/, 1)
  const wildcard = pattern.indexOf('*')
  return ['.css', '.sass', '.scss'].some(
    extension =>
      pattern.endsWith(extension) ||
      (wildcard !== -1 && extension.endsWith(pattern.slice(wildcard + 1))),
  )
}

function hasAmbientStylesheets(node: ts.Node, reviewed = false): boolean {
  if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
    const name = node.name.text
    if (declaresStylesheets(name) && !(reviewed && nextCssModules.has(name))) return true
  }
  return (
    ts.forEachChild(node, child => hasAmbientStylesheets(child, reviewed) || undefined) === true
  )
}

function effectiveTypeProblems(root: string, paths: string[], sources: Set<string>) {
  const problems = new Set<string>()
  const inspected = new Set(sources)
  const nextGlobal = join(root, 'apps/website/node_modules/next/types/global.d.ts')
  const reviewedNextGlobal = isFile(nextGlobal) ? fs.realpathSync(nextGlobal) : undefined

  for (const path of paths.filter(path => /\/tsconfig[^/]*\.json$/.test(path))) {
    if (!isFile(join(root, path))) continue
    const config = ts.getParsedCommandLineOfConfigFile(
      join(root, path),
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: diagnostic => {
          problems.add(`${path}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`)
        },
      },
    )
    if (!config) continue
    const program = ts.createProgram({
      rootNames: config.fileNames,
      options: config.options,
      projectReferences: config.projectReferences ?? [],
    })
    for (const source of program.getSourceFiles()) {
      const file = relative(root, source.fileName)
      if (inspected.has(file)) continue
      inspected.add(file)
      const reviewed = source.fileName === reviewedNextGlobal
      if (hasAmbientStylesheets(source, reviewed)) problems.add(`Ambient CSS declaration: ${file}`)
    }
  }
  return problems
}

function moduleSpecifier(
  node: ts.Node,
): { specifier: ts.Node | undefined; mode: ImportMode } | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return { specifier: node.moduleSpecifier, mode: 'import' }
  }
  if (ts.isExternalModuleReference(node)) return { specifier: node.expression, mode: 'require' }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    return { specifier: node.argument.literal, mode: 'import' }
  }
  if (ts.isCallExpression(node)) {
    const { expression } = node
    if (expression.kind === ts.SyntaxKind.ImportKeyword) {
      return { specifier: node.arguments[0], mode: 'import' }
    }
    if (ts.isIdentifier(expression) && expression.text === 'require') {
      return { specifier: node.arguments[0], mode: 'require' }
    }
  }
  return undefined
}

function sourceProblems(root: string, path: string): string[] {
  const problems: string[] = []
  if (/(?:\.d\.css\.ts|\.css\.d\.ts)$/.test(path) && !reviewedDeclarations.has(path)) {
    problems.push(`Unreviewed CSS declaration: ${path}`)
  }
  const source = ts.createSourceFile(
    path,
    fs.readFileSync(join(root, path)),
    ts.ScriptTarget.Latest,
  )
  if (hasAmbientStylesheets(source)) problems.push(`Ambient CSS declaration: ${path}`)
  const visit = (node: ts.Node) => {
    const reference = moduleSpecifier(node)
    if (reference?.specifier && ts.isStringLiteralLike(reference.specifier)) {
      const specifier = reference.specifier.text
      const stylesheet = localStylesheet(root, path, specifier, reference.mode)
      if (stylesheet === null || (stylesheet && !isFile(stylesheet))) {
        problems.push(`Missing stylesheet: ${path} imports ${specifier}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return problems
}

export function checkStylesheets(root = REPO_ROOT): string[] {
  const paths = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'apps', 'packages'],
    { cwd: root, encoding: 'utf8' },
  ).split('\0')
  const sources = new Set(
    paths.filter(path => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(path) && isFile(join(root, path))),
  )
  const problems: string[] = []

  for (const [declaration, stylesheet] of reviewedDeclarations) {
    if (!sources.has(declaration) || !isFile(join(root, stylesheet))) {
      problems.push(
        `Missing reviewed CSS declaration or stylesheet: ${declaration} / ${stylesheet}`,
      )
    }
  }
  for (const path of [...sources].sort()) {
    problems.push(...sourceProblems(root, path))
  }
  problems.push(...effectiveTypeProblems(root, paths, sources))
  return problems
}

if (require.main === module) {
  const problems = checkStylesheets()
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exitCode = 1
  } else {
    console.log('CSS guard: PASS')
  }
}
