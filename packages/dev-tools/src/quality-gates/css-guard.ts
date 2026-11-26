import { fileSystemService as fs } from '@pair/content-ops'
import { create, type FileSystem, type ResolveFunctionPromise } from 'enhanced-resolve'
import { execFileSync } from 'node:child_process'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { callbackify } from 'node:util'
import ts from 'typescript'

import { REPO_ROOT } from './repo-root'

const reviewedDeclarations = new Map([
  ['apps/website/app/global.d.css.ts', 'apps/website/app/global.css'],
  ['packages/brand/dev/styles.d.css.ts', 'packages/brand/dev/styles.css'],
])
const nextCssModules = new Set(['*.module.css', '*.module.sass', '*.module.scss'])

type ImportMode = 'import' | 'require'
type BuildMode = 'development' | 'production'
type NextLayer = 'rsc' | 'ssr' | 'browser'
type ModuleReference = { specifier: string; mode: ImportMode; typeOnly: boolean }
type Source = { references: ModuleReference[]; client: boolean }
type WorkspaceImport = { path: string; reference: ModuleReference }
type ViteResolver = (specifier: string, importer: string) => Promise<string | undefined>
type ViteConfigLoader = (
  options: { root: string; configFile: false; envFile: false },
  command: 'build' | 'serve',
  mode: BuildMode,
) => Promise<{
  createResolver(options: { isProduction: boolean; isRequire?: boolean }): ViteResolver
}>

const buildModes = ['development', 'production'] as const
const website = 'apps/website/'
const brand = 'packages/brand/'
const nextAppEntry =
  /^apps\/website\/app\/(?:.*\/)?(?:page|layout|route|template|loading|error|global-error|not-found|default|icon|apple-icon|opengraph-image|twitter-image|robots|sitemap)\.[jt]sx?$/

// Enhanced-resolve uses the path-and-callback forms for its package and symlink lookups.
const resolverFileSystem = {
  readFile: callbackify(fs.readFileBytes),
  readdir: callbackify(async (path: string) => (await fs.readdir(path)).map(entry => entry.name)),
  readlink: callbackify(fs.readlink),
  stat: callbackify(fs.stat),
} as FileSystem

function nextResolver(root: string, layer: NextLayer, build: BuildMode, mode: ImportMode) {
  const browser = layer === 'browser'
  return create.promise({
    fileSystem: resolverFileSystem,
    conditionNames: [
      ...(layer === 'rsc' ? ['react-server'] : []),
      mode,
      'module',
      'webpack',
      build,
      browser ? 'browser' : 'node',
    ],
    aliasFields: browser ? ['browser'] : [],
    mainFields: browser ? ['browser', 'module', 'main'] : ['module', 'main'],
    alias: { '@': join(root, website) },
    extensions: ['.js', '.mjs', '.tsx', '.ts', '.jsx', '.json', '.wasm'],
  })
}

async function resolveModule(
  resolver: ResolveFunctionPromise,
  importer: string,
  specifier: string,
) {
  try {
    return await resolver(dirname(importer), specifier)
  } catch {
    return undefined
  }
}

function stylesheetPath(specifier: string) {
  const [path] = specifier.split(/[?#]/, 1)
  return path && /\.(?:css|sass|scss)$/.test(path) ? path : undefined
}

function localStylesheet(root: string, importer: string, stylesheet: string) {
  if (/^\.\.?\//.test(stylesheet)) return resolve(root, dirname(importer), stylesheet)
  if (importer.startsWith(website) && stylesheet.startsWith('@/')) {
    return join(root, website, stylesheet.slice(2))
  }
  if (importer.startsWith(brand) && /^\$(?:components|tokens)\//.test(stylesheet)) {
    return join(root, brand, 'src', stylesheet.slice(1))
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
    const inspected = new Set(sources)
    for (const source of program.getSourceFiles()) {
      const file = relative(root, source.fileName)
      if (inspected.has(file)) continue
      inspected.add(file)
      const reviewed = path.startsWith('apps/website/') && source.fileName === reviewedNextGlobal
      if (hasAmbientStylesheets(source, reviewed)) problems.add(`Ambient CSS declaration: ${file}`)
    }
  }
  return problems
}

function moduleSpecifier(
  node: ts.Node,
): { specifier: ts.Node | undefined; mode: ImportMode; typeOnly?: boolean } | undefined {
  if (ts.isImportDeclaration(node)) {
    return {
      specifier: node.moduleSpecifier,
      mode: 'import',
      typeOnly: node.importClause?.isTypeOnly ?? false,
    }
  }
  if (ts.isExportDeclaration(node))
    return { specifier: node.moduleSpecifier, mode: 'import', typeOnly: node.isTypeOnly }
  if (ts.isExternalModuleReference(node)) return { specifier: node.expression, mode: 'require' }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    return { specifier: node.argument.literal, mode: 'import', typeOnly: true }
  }
  if (ts.isCallExpression(node)) return calledModule(node)
  return undefined
}

function calledModule({ expression, arguments: args }: ts.CallExpression) {
  if (expression.kind === ts.SyntaxKind.ImportKeyword) {
    return { specifier: args[0], mode: 'import' as const }
  }
  if (ts.isIdentifier(expression) && expression.text === 'require') {
    return { specifier: args[0], mode: 'require' as const }
  }
  return undefined
}

function inspectSource(root: string, path: string, problems: string[]): Source {
  if (/(?:\.d\.css\.ts|\.css\.d\.ts)$/.test(path) && !reviewedDeclarations.has(path)) {
    problems.push(`Unreviewed CSS declaration: ${path}`)
  }
  const source = ts.createSourceFile(
    path,
    fs.readFileSync(join(root, path)),
    ts.ScriptTarget.Latest,
  )
  if (hasAmbientStylesheets(source)) problems.push(`Ambient CSS declaration: ${path}`)
  const references: ModuleReference[] = []
  const visit = (node: ts.Node) => {
    const reference = moduleSpecifier(node)
    if (reference?.specifier && ts.isStringLiteralLike(reference.specifier)) {
      references.push({
        specifier: reference.specifier.text,
        mode: reference.mode,
        typeOnly: reference.typeOnly ?? false,
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  let client = false
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break
    if (statement.expression.text === 'use client') client = true
  }
  return { references, client }
}

async function nextCompilation(root: string, build: BuildMode, sources: Map<string, Source>) {
  const resolvers = new Map<string, ResolveFunctionPromise>()
  const resolveNext = (layer: NextLayer, path: string, { specifier, mode }: ModuleReference) => {
    const key = `${layer}/${mode}`
    let resolver = resolvers.get(key)
    if (!resolver) {
      resolver = nextResolver(root, layer, build, mode)
      resolvers.set(key, resolver)
    }
    return resolveModule(resolver, join(root, path), specifier)
  }
  const layers = new Map<string, Set<NextLayer>>()
  const visit = async (path: string, layer: NextLayer): Promise<void> => {
    const source = sources.get(path)
    if (!source) return
    if (source.client && layer === 'rsc') {
      await visit(path, 'ssr')
      await visit(path, 'browser')
      return
    }
    const seen = layers.get(path) ?? new Set<NextLayer>()
    if (seen.has(layer)) return
    seen.add(layer)
    layers.set(path, seen)
    for (const reference of source.references) {
      if (!isRuntimeWorkspaceImport(reference)) continue
      const resolved = await resolveNext(layer, path, reference)
      if (resolved) await visit(relative(root, resolved), layer)
    }
  }
  // Next compiles a client boundary and its dependencies for SSR and the browser.
  for (const path of sources.keys()) if (nextAppEntry.test(path)) await visit(path, 'rsc')
  return { layers, resolveNext }
}

function isRuntimeWorkspaceImport({ typeOnly, specifier }: ModuleReference) {
  return !typeOnly && /^(?:\.{1,2}\/|@\/|@pair\/)/.test(specifier) && !stylesheetPath(specifier)
}

async function viteResolver(root: string, build: BuildMode) {
  // Vite's declarations include browser globals, so use its Node resolver API at runtime.
  const packageName = 'vite'
  const { resolveConfig }: { resolveConfig: ViteConfigLoader } = await import(packageName)
  const config = await resolveConfig(
    { root: join(root, brand, 'dev'), configFile: false, envFile: false },
    build === 'production' ? 'build' : 'serve',
    build,
  )
  const options = { isProduction: build === 'production' }
  return {
    import: config.createResolver(options),
    require: config.createResolver({ ...options, isRequire: true }),
  }
}

function standaloneNextLayers(path: string, source: Source | undefined): NextLayer[] {
  if (!path.startsWith(website)) return []
  return source?.client ? ['ssr', 'browser'] : ['rsc']
}

function inspectStylesheetImports(
  root: string,
  sources: Map<string, Source>,
  problems: Set<string>,
) {
  const workspaceImports: WorkspaceImport[] = []
  for (const [path, source] of sources) {
    for (const reference of source.references) {
      const { specifier } = reference
      const stylesheet = stylesheetPath(specifier)
      if (!stylesheet) continue
      const local = localStylesheet(root, path, stylesheet)
      if (local && !isFile(local)) problems.add(`Missing stylesheet: ${path} imports ${specifier}`)
      if (stylesheet.startsWith('@pair/')) workspaceImports.push({ path, reference })
    }
  }
  return workspaceImports
}

async function viteStylesheetExists(resolver: ViteResolver, specifier: string, importer: string) {
  try {
    return resolvedStylesheet(await resolver(specifier, importer))
  } catch {
    return false
  }
}

function nodeStylesheetResolver(mode: ImportMode) {
  return create.promise({
    fileSystem: resolverFileSystem,
    conditionNames: [mode, 'node', 'node-addons'],
    fullySpecified: true,
  })
}

async function workspaceImportResolves(
  root: string,
  { path, reference }: WorkspaceImport,
  fallbackLayers: NextLayer[],
  resolvers: {
    next: Awaited<ReturnType<typeof nextCompilation>>
    vite: Record<ImportMode, ViteResolver> | undefined
    node: Record<ImportMode, ResolveFunctionPromise>
  },
) {
  const { next, vite, node } = resolvers
  const { specifier, mode } = reference
  const issuer = join(root, path)
  const layers = [...(next.layers.get(path) ?? fallbackLayers)]
  for (const layer of layers) {
    if (!resolvedStylesheet(await next.resolveNext(layer, path, reference))) return false
  }
  if (path.startsWith(brand) && vite) return viteStylesheetExists(vite[mode], specifier, issuer)
  return layers.length > 0 || resolvedStylesheet(await resolveModule(node[mode], issuer, specifier))
}

async function stylesheetImportProblems(root: string, sources: Map<string, Source>) {
  const problems = new Set<string>()
  const workspaceImports = inspectStylesheetImports(root, sources, problems)
  if (!workspaceImports.length) return problems

  const hasBrandImports = workspaceImports.some(({ path }) => path.startsWith(brand))
  const node = {
    import: nodeStylesheetResolver('import'),
    require: nodeStylesheetResolver('require'),
  }
  for (const build of buildModes) {
    const next = await nextCompilation(root, build, sources)
    const vite = hasBrandImports ? await viteResolver(root, build) : undefined
    for (const entry of workspaceImports) {
      const { path, reference } = entry
      const fallbackLayers = standaloneNextLayers(path, sources.get(path))
      if (!(await workspaceImportResolves(root, entry, fallbackLayers, { next, vite, node }))) {
        problems.add(`Missing stylesheet: ${path} imports ${reference.specifier}`)
      }
    }
  }
  return problems
}

function resolvedStylesheet(result: string | false | undefined) {
  // Both bundlers support browser mappings that explicitly replace an import with an empty module.
  if (result === false || result === '__vite-browser-external') return true
  const [file] = result?.split(/[?#]/, 1) ?? []
  return !!file && isAbsolute(file) && isFile(file)
}

export async function checkStylesheets(directory = REPO_ROOT): Promise<string[]> {
  const root = fs.realpathSync(directory)
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
  const inspected = new Map(
    [...sources].sort().map(path => [path, inspectSource(root, path, problems)]),
  )
  problems.push(...(await stylesheetImportProblems(root, inspected)))
  problems.push(...effectiveTypeProblems(root, paths, sources))
  return problems
}

async function main() {
  const problems = await checkStylesheets()
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exitCode = 1
  } else {
    console.log('CSS guard: PASS')
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
