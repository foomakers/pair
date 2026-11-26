import { fileSystemService as fs } from '@pair/content-ops'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

import { REPO_ROOT } from './repo-root'

const reviewedDeclarations = new Map([
  ['apps/website/app/global.d.css.ts', 'apps/website/app/global.css'],
  ['packages/brand/dev/styles.d.css.ts', 'packages/brand/dev/styles.css'],
])
const nextCssModules = new Set(['*.module.css', '*.module.sass', '*.module.scss'])

function resolveWorkspaceStylesheet(importer: string, stylesheet: string) {
  try {
    return createRequire(importer).resolve(stylesheet)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'MODULE_NOT_FOUND' || code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') return null
    throw error
  }
}

function localStylesheet(root: string, importer: string, specifier: string) {
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
    return resolveWorkspaceStylesheet(resolve(root, importer), stylesheet)
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

function moduleSpecifier(node: ts.Node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier
  if (ts.isExternalModuleReference(node)) return node.expression
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) return node.argument.literal
  if (ts.isCallExpression(node)) {
    const { expression } = node
    if (
      expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(expression) && expression.text === 'require')
    ) {
      return node.arguments[0]
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
  const specifiers: string[] = []
  const visit = (node: ts.Node) => {
    const specifier = moduleSpecifier(node)
    if (specifier && ts.isStringLiteralLike(specifier)) specifiers.push(specifier.text)
    ts.forEachChild(node, visit)
  }
  visit(source)

  if (hasAmbientStylesheets(source)) problems.push(`Ambient CSS declaration: ${path}`)
  for (const specifier of specifiers) {
    const stylesheet = localStylesheet(root, path, specifier)
    if (stylesheet === null || (stylesheet && !isFile(stylesheet))) {
      problems.push(`Missing stylesheet: ${path} imports ${specifier}`)
    }
  }
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
