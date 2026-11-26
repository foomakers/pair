import { resolve } from 'node:path'
import ts from 'typescript'

export const nullableDomainRule = 'pair-domain/nullable-domain-property'

const nullish = ts.TypeFlags.Null | ts.TypeFlags.Undefined
// A missing module, declaration output or exported member can make an alias look like `any`.
const importFailures = new Set([
  1192, 2305, 2306, 2307, 2459, 2613, 2614, 2688, 2694, 2724, 2732, 2792, 6305, 7016,
])

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

function literalFields(type) {
  while (ts.isParenthesizedTypeNode(type)) type = type.type
  if (!ts.isTypeLiteralNode(type)) return new Map()
  return new Map(
    type.members.flatMap(member => {
      if (
        !ts.isPropertySignature(member) ||
        member.questionToken ||
        !member.type ||
        !ts.isLiteralTypeNode(member.type)
      )
        return []
      const { literal } = member.type
      const value = ts.isStringLiteral(literal) ? JSON.stringify(literal.text) : literal.getText()
      return [[member.name.getText(), value]]
    }),
  )
}

function unionArm(arm, variants, property, source) {
  const fields = literalFields(arm)
  const siblings = variants.filter(variant => variant !== arm).map(literalFields)
  for (const [name, value] of [...fields].sort()) {
    if (siblings.every(sibling => sibling.has(name) && sibling.get(name) !== value)) {
      return [name, value]
    }
  }

  // For an untagged arm, compare its other content independently of layout or comments.
  const text = `${source.text.slice(arm.getStart(source), property.getStart(source))} ${source.text.slice(property.end, arm.end)}`
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text)
  const tokens = []
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    tokens.push(scanner.getTokenText())
  }
  return tokens
}

export function domainPropertySites(filename, text) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true)
  const sites = new Map()
  function visit(node) {
    if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) {
      const owner = domainOwner(node)
      const name = node.name.getText(source)
      const path = []
      for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
        if (
          ts.isTypeAliasDeclaration(parent) ||
          ts.isInterfaceDeclaration(parent) ||
          ts.isClassDeclaration(parent)
        )
          break
        if (ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent)) {
          path.push(['property', parent.name.getText(source)])
        }
        if (ts.isUnionTypeNode(parent)) {
          path.push(['union', unionArm(child, parent.types, node, source)])
        }
      }
      const offset = Buffer.byteLength(text.slice(0, node.name.getStart(source)))
      sites.set(offset, {
        property: owner ? `${owner}.${name}` : name,
        path: path.reverse(),
        optional: Boolean(node.questionToken),
        explicit: hasDirectNullishType(node.type),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return sites
}

function constituents(type) {
  return type.isUnion() ? type.types : [type]
}

function returnedExpression(node) {
  if (ts.isReturnStatement(node)) return node.expression
  if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) return node.body
}

function findNullableProperties(source, checker, symbols) {
  const findings = new Map()
  const inScope = owner => !symbols || symbols.includes(owner)

  function report(type, owner, name, location) {
    if (!constituents(type).some(part => part.flags & nullish)) return
    const start = location.getStart(source)
    const { line, character } = source.getLineAndCharacterOfPosition(start)
    const property = owner ? `${owner}.${name}` : name
    findings.set(`${start}:${property}`, {
      property,
      span: {
        offset: Buffer.byteLength(source.text.slice(0, start)),
        length: Buffer.byteLength(location.getText(source)),
        line: line + 1,
        column: character + 1,
      },
    })
  }

  function checkReturn(expression, owner) {
    for (const type of constituents(checker.getTypeAtLocation(expression))) {
      if (!(type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection))) continue
      for (const property of checker.getPropertiesOfType(type)) {
        if (property.flags & ts.SymbolFlags.Optional) continue
        const declaration = property.valueDeclaration
        const local =
          declaration?.getSourceFile() === source &&
          declaration.pos >= expression.pos &&
          declaration.end <= expression.end &&
          (ts.isPropertyAssignment(declaration) || ts.isShorthandPropertyAssignment(declaration))
        const location = local ? declaration.name : expression.getFirstToken(source)
        report(
          checker.getTypeOfSymbolAtLocation(property, expression),
          owner,
          property.name,
          location,
        )
      }
    }
  }

  function visit(node) {
    if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) {
      const owner = domainOwner(node)
      if (inScope(owner) && !node.questionToken && !hasDirectNullishType(node.type)) {
        report(checker.getTypeAtLocation(node.name), owner, node.name.getText(source), node.name)
      }
    }
    const expression = returnedExpression(node)
    if (expression) {
      const owner = domainOwner(expression)
      if (inScope(owner)) checkReturn(expression, owner)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return [...findings.values()].sort((a, b) => a.span.offset - b.span.offset)
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
