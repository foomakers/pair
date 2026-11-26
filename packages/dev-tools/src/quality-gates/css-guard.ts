import { fileSystemService as fs } from '@pair/content-ops'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import ts from 'typescript'

import { REPO_ROOT } from './repo-root'

const reviewedDeclarations = new Map([
  ['apps/website/app/global.d.css.ts', 'apps/website/app/global.css'],
  ['packages/brand/dev/styles.d.css.ts', 'packages/brand/dev/styles.css'],
])

function localStylesheet(root: string, importer: string, specifier: string) {
  const stylesheet = specifier.split(/[?#]/, 1)[0]
  if (!stylesheet?.endsWith('.css')) return undefined
  if (/^\.\.?\//.test(stylesheet)) return resolve(root, dirname(importer), stylesheet)
  if (importer.startsWith('apps/website/') && stylesheet.startsWith('@/')) {
    return join(root, 'apps/website', stylesheet.slice(2))
  }
  if (importer.startsWith('packages/brand/') && /^\$(?:components|tokens)\//.test(stylesheet)) {
    return join(root, 'packages/brand/src', stylesheet.slice(1))
  }
  return undefined
}

function isFile(path: string) {
  return fs.existsSync(path) && fs.statSync(path).isFile()
}

function declaresStylesheets(name: string) {
  const [pattern = ''] = name.split(/[?#]/, 1)
  const wildcard = pattern.indexOf('*')
  return (
    pattern.endsWith('.css') ||
    pattern === '*.*' ||
    (wildcard !== -1 && '.css'.endsWith(pattern.slice(wildcard + 1)))
  )
}

function hasStylesheetDeclaration(node: ts.Node): boolean {
  if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
    if (declaresStylesheets(node.name.text)) return true
  }
  return ts.forEachChild(node, hasStylesheetDeclaration) === true
}

function sourceProblems(root: string, path: string): string[] {
  const problems: string[] = []
  if (/(?:\.d\.css\.ts|\.css\.d\.ts)$/.test(path) && !reviewedDeclarations.has(path)) {
    problems.push(`Unreviewed CSS declaration: ${path}`)
  }
  const source = fs.readFileSync(join(root, path))
  const { importedFiles } = ts.preProcessFile(source, true, true)
  if (hasStylesheetDeclaration(ts.createSourceFile(path, source, ts.ScriptTarget.Latest))) {
    problems.push(`Ambient CSS declaration: ${path}`)
  }
  for (const { fileName } of importedFiles) {
    const stylesheet = localStylesheet(root, path, fileName)
    if (stylesheet && !isFile(stylesheet)) {
      problems.push(`Missing stylesheet: ${path} imports ${fileName}`)
    }
  }
  return problems
}

export function checkStylesheets(root = REPO_ROOT): string[] {
  const paths = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'apps', 'packages'],
    { cwd: root, encoding: 'utf8' },
  )
  const sources = new Set(
    paths
      .split('\0')
      .filter(path => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(path) && isFile(join(root, path))),
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
