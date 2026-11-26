import { resolve } from 'node:path'
import ts from 'typescript'

export const nullableDomainRule = 'pair-domain/nullable-domain-property'

const nullish = ts.TypeFlags.Null | ts.TypeFlags.Undefined
// Without a resolved module or declaration output, an alias may look like `any`.
const importFailures = new Set([2307, 2688, 2732, 2792, 6305, 7016])

function loadProject(project) {
  const fail = diagnostic => {
    const location = diagnostic.file?.fileName ?? project
    throw new Error(
      `${location}: TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
    )
  }
  const config = ts.getParsedCommandLineOfConfigFile(
    project,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: fail,
    },
  )
  if (config.errors.length) fail(config.errors[0])
  if (!(config.options.strictNullChecks ?? config.options.strict)) {
    throw new Error(`${project}: domain lint requires strictNullChecks`)
  }
  const program = ts.createProgram({
    rootNames: config.fileNames,
    options: config.options,
    projectReferences: config.projectReferences,
  })
  const [error] = program.getOptionsDiagnostics()
  if (error) fail(error)
  for (const source of program.getSourceFiles()) {
    if (program.isSourceFileFromExternalLibrary(source)) continue
    const unresolved = program
      .getSemanticDiagnostics(source)
      .find(diagnostic => importFailures.has(diagnostic.code))
    if (unresolved) fail(unresolved)
  }
  return program
}

function hasDirectNullishType(type) {
  if (!type) return false
  if (ts.isParenthesizedTypeNode(type)) return hasDirectNullishType(type.type)
  if (ts.isUnionTypeNode(type)) return type.types.some(hasDirectNullishType)
  return (
    type.kind === ts.SyntaxKind.UndefinedKeyword ||
    (ts.isLiteralTypeNode(type) && type.literal.kind === ts.SyntaxKind.NullKeyword)
  )
}

function domainOwner(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isVariableDeclaration(parent)
    ) {
      if (parent.name && ts.isIdentifier(parent.name)) return parent.name.text
    }
  }
}

function constituents(type) {
  return type.isUnion() ? type.types : [type]
}

function returnedProperties(node, checker) {
  let expression
  if (ts.isReturnStatement(node)) expression = node.expression
  if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) expression = node.body
  if (!expression) return []
  return constituents(checker.getTypeAtLocation(expression))
    .filter(type => type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection))
    .flatMap(type => checker.getPropertiesOfType(type))
    .flatMap(property => property.declarations ?? [])
    .filter(
      declaration =>
        ts.isPropertyAssignment(declaration) || ts.isShorthandPropertyAssignment(declaration),
    )
}

function findNullableProperties(source, checker, symbols) {
  const candidates = new Set()
  function visit(node) {
    if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) candidates.add(node)
    for (const property of returnedProperties(node, checker)) {
      if (property.getSourceFile() === source) candidates.add(property)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)

  return [...candidates]
    .flatMap(property => {
      if (property.questionToken || hasDirectNullishType(property.type)) return []
      const owner = domainOwner(property)
      if (symbols && !symbols.includes(owner)) return []
      const type = checker.getTypeAtLocation(property.name)
      if (!constituents(type).some(part => part.flags & nullish)) return []
      const start = property.name.getStart(source)
      const { line, character } = source.getLineAndCharacterOfPosition(start)
      const name = property.name.getText(source)
      return [
        {
          property: owner ? `${owner}.${name}` : name,
          span: {
            offset: Buffer.byteLength(source.text.slice(0, start)),
            length: Buffer.byteLength(name),
            line: line + 1,
            column: character + 1,
          },
        },
      ]
    })
    .sort((a, b) => a.span.offset - b.span.offset)
}

/** Check selected paths relative to the current directory. Scope entries are keyed by those paths. */
export function checkNullableDomainProperties(project, files, symbolsByFile = new Map()) {
  if (!files.length) return []
  const program = loadProject(resolve(project))
  const checker = program.getTypeChecker()
  const seen = new Set()
  return files.flatMap(filename => {
    const path = resolve(filename)
    if (seen.has(path)) return []
    seen.add(path)
    const source = program.getSourceFile(path)
    if (!source) throw new Error(`${project}: domain source ${filename} is absent from the project`)
    if (source.isDeclarationFile) return []
    return findNullableProperties(source, checker, symbolsByFile.get(filename)).map(finding => ({
      ...finding,
      filename,
      code: nullableDomainRule,
    }))
  })
}
