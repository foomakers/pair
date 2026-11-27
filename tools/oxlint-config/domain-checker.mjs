import { resolve } from 'node:path'
import ts from '@typescript/typescript6'

export const nullableDomainRule = 'pair-domain/nullable-domain-property'

const nullish = ts.TypeFlags.Null | ts.TypeFlags.Undefined
// An unresolved import, export or file reference can make an alias look like `any`.
const dependencyFailures = new Set([
  1192, 2303, 2305, 2306, 2307, 2308, 2459, 2613, 2614, 2688, 2694, 2724, 2732, 2792, 2834, 2835,
  2882, 6053, 6305, 7016,
])

function failDiagnostic(diagnostic, project) {
  const location = diagnostic.file?.fileName ?? project
  throw new Error(
    `${location}: TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
  )
}

function loadProject(project) {
  const fail = diagnostic => failDiagnostic(diagnostic, project)
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
    // Imported declarations can carry unresolved types into a model.
    options: { ...config.options, skipLibCheck: false },
    projectReferences: config.projectReferences,
  })
  const [error] = program.getOptionsDiagnostics()
  if (error) fail(error)
  for (const source of program.getSourceFiles()) {
    if (
      program.isSourceFileFromExternalLibrary(source) ||
      program.isSourceFileDefaultLibrary(source)
    )
      continue
    const unresolved = program
      .getSemanticDiagnostics(source)
      .find(diagnostic => dependencyFailures.has(diagnostic.code))
    if (unresolved) fail(unresolved)
  }
  return program
}

function typeDependencyCheck(program, checker) {
  const diagnosticsBySource = new Map()
  const checkedNodes = new Set()
  const checkedSymbols = new Set()

  function checkDiagnostics(node, excluded = []) {
    const source = node.getSourceFile()
    if (!diagnosticsBySource.has(source)) {
      diagnosticsBySource.set(
        source,
        program
          .getSemanticDiagnostics(source)
          // Composite build file lists can omit dependencies that still resolve for lint.
          .filter(d => d.category === ts.DiagnosticCategory.Error && d.code !== 6307),
      )
    }
    const start = node.getStart(source)
    const failure = diagnosticsBySource
      .get(source)
      .find(
        d =>
          d.start >= start &&
          d.start < node.end &&
          !excluded.some(([from, to]) => d.start >= from && d.start < to),
      )
    if (failure) failDiagnostic(failure)
  }

  function follow(symbol) {
    if (!symbol || checkedSymbols.has(symbol)) return
    checkedSymbols.add(symbol)
    const alias = symbol.flags & ts.SymbolFlags.Alias
    for (const declaration of symbol.declarations ?? []) {
      if (alias) {
        checkDiagnostics(declaration)
        // Resolution errors can be on the shared module specifier instead of the binding.
        for (let node = declaration.parent; node; node = node.parent) {
          if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue
          if (node.moduleSpecifier) checkDiagnostics(node.moduleSpecifier)
          break
        }
      } else {
        check(ts.isTypeAliasDeclaration(declaration) ? declaration : declaration.type)
        if (declaration.name && isUnresolvedType(checker.getTypeAtLocation(declaration.name))) {
          checkInference(declaration)
        }
      }
    }
    if (alias) follow(checker.getImmediateAliasedSymbol(symbol))
  }

  function checkSelectedObjectArguments(node, contributes, seen = new Set()) {
    if (seen.has(node) || program.isSourceFileDefaultLibrary(node.getSourceFile())) return
    seen.add(node)
    if (ts.isParenthesizedTypeNode(node)) {
      checkSelectedObjectArguments(node.type, contributes, seen)
    } else if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
      for (const type of node.types) checkSelectedObjectArguments(type, contributes, seen)
    } else {
      const name = ts.isTypeReferenceNode(node) ? node.typeName : node.expression
      let symbol = name && checker.getSymbolAtLocation(name)
      if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
      for (const argument of node.typeArguments ?? []) {
        // A projection can preserve the selected property's declaration through aliases.
        if (contributes(checker.getTypeFromTypeNode(argument))) {
          checkSelectedObjectArguments(argument, contributes, seen)
        } else {
          check(argument)
        }
      }
      if (!name) return
      checkDiagnostics(node)
      const argumentCount = node.typeArguments?.length ?? 0
      for (const declaration of symbol?.declarations ?? []) {
        // Errors in omitted arguments are reported at their defaults in the declaration.
        for (const parameter of declaration.typeParameters?.slice(argumentCount) ?? []) {
          check(parameter.default)
        }
        if (ts.isTypeAliasDeclaration(declaration)) {
          checkSelectedObjectArguments(declaration.type, contributes, seen)
        }
        for (const clause of declaration.heritageClauses ?? []) {
          if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue
          for (const base of clause.types) {
            // Only follow a base that contributes a declaration for the selected member.
            if (contributes(checker.getTypeAtLocation(base))) {
              checkSelectedObjectArguments(base, contributes, seen)
            }
          }
        }
      }
    }
  }

  function indexValueNodes(object, info) {
    if (info.declaration) return [info.declaration.type]
    // The checker combines the value types of signatures with the same key type.
    if (object.isUnionOrIntersection()) {
      const parts = object.types.flatMap(type => {
        const part = checker.getIndexInfosOfType(type).find(index => index.keyType === info.keyType)
        return part ? [indexValueNodes(type, part)] : []
      })
      if (parts.length && parts.every(Boolean)) return parts.flat()
    }
    const mapped = object.getSymbol()?.declarations?.find(ts.isMappedTypeNode)
    if (mapped?.type) return [mapped.type]
  }

  function indexedValueNodes(object, key) {
    let property
    if (key.isLiteral()) {
      property = checker.getPropertyOfType(object, String(key.value))
    } else if (key.flags & ts.TypeFlags.UniqueESSymbol) {
      property = checker.getPropertiesOfType(object).find(p => p.escapedName === key.escapedName)
    }
    if (property) return (property.declarations ?? []).map(declaration => declaration.type)
    if (key.flags & (ts.TypeFlags.Any | ts.TypeFlags.Never)) return

    const string = checker.getStringType()
    const number = checker.getNumberType()
    const applicable = checker
      .getIndexInfosOfType(object)
      .filter(
        ({ keyType }) =>
          checker.isTypeAssignableTo(key, keyType) ||
          (keyType === string && checker.isTypeAssignableTo(key, number)) ||
          (keyType === number && key.isStringLiteral() && String(Number(key.value)) === key.value),
      )
    // TypeScript uses the string signature only when no more specific signature applies.
    const specific = applicable.filter(info => info.keyType !== string)
    const selected = (specific.length ? specific : applicable).map(info =>
      indexValueNodes(object, info),
    )
    if (selected.length && selected.every(Boolean)) return selected.flat()
  }

  function check(node) {
    if (
      !node ||
      checkedNodes.has(node) ||
      program.isSourceFileDefaultLibrary(node.getSourceFile())
    ) {
      return
    }
    checkedNodes.add(node)
    const excluded = []
    function visit(part) {
      if (ts.isIndexedAccessTypeNode(part)) {
        const object = checker.getTypeFromTypeNode(part.objectType)
        const keys = constituents(checker.getTypeFromTypeNode(part.indexType))
        const selected = keys.map(key => indexedValueNodes(object, key))
        for (const types of selected) {
          for (const type of types ?? []) check(type)
        }
        if (selected.every(Boolean)) {
          const values = new Set(selected.flat())
          checkSelectedObjectArguments(part.objectType, type =>
            keys.some(key => indexedValueNodes(type, key)?.some(value => values.has(value))),
          )
          if (!isUnresolvedType(checker.getTypeFromTypeNode(part))) {
            // The checker has selected the members. The rest of the DTO is outside this dependency.
            excluded.push([part.objectType.getStart(), part.objectType.end])
            visit(part.indexType)
            return
          }
        }
      }
      if (ts.isCallExpression(part) && isUnresolvedType(checker.getTypeAtLocation(part))) {
        const declaration = checker.getResolvedSignature(part)?.declaration
        if (declaration) {
          check(declaration.type)
          checkInference(declaration)
        }
      }
      if (ts.isIdentifier(part)) follow(checker.getSymbolAtLocation(part))
      ts.forEachChild(part, visit)
    }
    visit(node)
    checkDiagnostics(node, excluded)
  }

  function checkInference(declaration) {
    if (declaration.type) return
    if (ts.isShorthandPropertyAssignment(declaration)) {
      follow(checker.getShorthandAssignmentValueSymbol(declaration))
    }
    check(declaration.initializer)
    if (ts.isFunctionLike(declaration) && declaration.body) {
      if (ts.isBlock(declaration.body)) {
        ts.forEachReturnStatement(declaration.body, statement => {
          check(statement.expression)
        })
      } else {
        check(declaration.body)
      }
    }
  }

  return (type, declarations, uses) => {
    for (const declaration of declarations) check(declaration.type)
    for (const use of uses) {
      if (!ts.isExpressionWithTypeArguments(use) && !ts.isTypeNode(use)) continue
      const contributes = base =>
        base.getProperties().some(property =>
          property.declarations?.some(declaration => declarations.includes(declaration)),
        )
      if (constituents(checker.getTypeAtLocation(use)).some(contributes)) {
        checkSelectedObjectArguments(use, contributes)
      }
    }
    if (!isUnresolvedType(type)) return
    for (const declaration of declarations) checkInference(declaration)
    // Instantiation can erase the error's origin from the generic property declaration.
    for (const use of uses) check(use)
    throw new Error(`${uses[0].getSourceFile().fileName}: cannot resolve domain property type`)
  }
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

function isParameterProperty(node) {
  return ts.isParameter(node) && ts.isParameterPropertyDeclaration(node, node.parent)
}

function isDomainProperty(node) {
  return (
    ts.isPropertySignature(node) ||
    ts.isPropertyDeclaration(node) ||
    isParameterProperty(node) ||
    ts.isGetAccessorDeclaration(node)
  )
}

function hasNullishSyntaxFinding(node) {
  // The syntax rule leaves getter annotations to the semantic checker.
  return !ts.isGetAccessorDeclaration(node) && hasDirectNullishType(node.type)
}

export function domainPropertySites(filename, text) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true)
  const sites = new Map()
  function visit(node) {
    if (isDomainProperty(node)) {
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
        if (isDomainProperty(parent)) {
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
        explicit: hasNullishSyntaxFinding(node),
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

function isNullishType(type) {
  return constituents(type).some(part => part.flags & nullish)
}

function isUnresolvedType(type) {
  // The pinned compiler represents failed type resolution as a distinct intrinsic any.
  return constituents(type).some(
    part => part.flags & ts.TypeFlags.Any && part.intrinsicName === 'error',
  )
}

function objectProperties(type, checker) {
  if (!(type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection))) return []
  const properties = checker.getPropertiesOfType(type)
  const literal = type.getSymbol()?.valueDeclaration
  if (!literal || !ts.isObjectLiteralExpression(literal)) return properties
  const original = checker.getTypeAtLocation(literal)
  // TypeScript pads inferred union arms with optional fields missing from their literals.
  return properties.filter(
    property => !(property.flags & ts.SymbolFlags.Optional) || original.getProperty(property.name),
  )
}

function returnedExpression(node) {
  if (ts.isReturnStatement(node)) return node.expression
  if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) return node.body
}

function findNullableProperties(source, checker, symbols, checkPropertyDependencies) {
  const findings = new Map()
  const inScope = owner => !symbols || symbols.includes(owner)

  // The declaration visitor reports in-scope getters at their names.
  function reportsGetter(declaration) {
    return (
      ts.isGetAccessorDeclaration(declaration) &&
      declaration.getSourceFile() === source &&
      inScope(domainOwner(declaration)) &&
      isNullishType(checker.getTypeAtLocation(declaration.name))
    )
  }

  function report(type, owner, name, location, optional = false) {
    if (!optional && !isNullishType(type)) return
    const start = location.getStart(source)
    const { line, character } = source.getLineAndCharacterOfPosition(start)
    const property = owner ? `${owner}.${name}` : name
    findings.set(`${start}:${property}`, {
      property,
      message: optional
        ? `Make ${property} required on the appropriate tagged variant.`
        : undefined,
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
      for (const property of objectProperties(type, checker)) {
        if (property.declarations?.some(reportsGetter)) continue
        const propertyType = checker.getTypeOfSymbolAtLocation(property, expression)
        checkPropertyDependencies(propertyType, property.declarations ?? [], [expression])
        const declaration = property.valueDeclaration
        const local =
          declaration?.getSourceFile() === source &&
          declaration.pos >= expression.pos &&
          declaration.end <= expression.end &&
          (ts.isPropertyAssignment(declaration) || ts.isShorthandPropertyAssignment(declaration))
        const location = local ? declaration.name : expression.getFirstToken(source)
        report(
          propertyType,
          owner,
          property.name,
          location,
          Boolean(property.flags & ts.SymbolFlags.Optional),
        )
      }
    }
  }

  function checkInherited(node) {
    const name = node.name
    if (!name || !inScope(name.text)) return
    const bases = node.heritageClauses?.find(
      clause => clause.token === ts.SyntaxKind.ExtendsKeyword,
    )
    if (!bases) return
    const declarations = checker.getSymbolAtLocation(name)?.declarations ?? []
    const declaredHere = declaration =>
      declarations.includes(
        isParameterProperty(declaration) ? declaration.parent.parent : declaration.parent,
      )
    for (const property of checker.getPropertiesOfType(checker.getTypeAtLocation(node))) {
      if (property.declarations?.some(declaredHere)) continue
      const propertyType = checker.getTypeOfSymbolAtLocation(property, node)
      checkPropertyDependencies(propertyType, property.declarations ?? [], bases.types)
      report(
        propertyType,
        name.text,
        property.name,
        name,
        Boolean(property.flags & ts.SymbolFlags.Optional),
      )
    }
  }

  function checkAlias(node) {
    const { name } = node
    if (!inScope(name.text)) return
    const alreadyChecked = declaration =>
      reportsGetter(declaration) ||
      (ts.isPropertySignature(declaration) &&
        declaration.getSourceFile() === source &&
        declaration.pos >= node.type.pos &&
        declaration.end <= node.type.end &&
        (declaration.questionToken ||
          hasDirectNullishType(declaration.type) ||
          isNullishType(checker.getTypeAtLocation(declaration.name))))
    for (const type of constituents(checker.getTypeAtLocation(node))) {
      for (const property of objectProperties(type, checker)) {
        if (property.declarations?.some(alreadyChecked)) continue
        const propertyType = checker.getTypeOfSymbolAtLocation(property, node)
        checkPropertyDependencies(propertyType, property.declarations ?? [], [node.type])
        report(
          propertyType,
          name.text,
          property.name,
          name,
          Boolean(property.flags & ts.SymbolFlags.Optional),
        )
      }
    }
  }

  function visit(node) {
    if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) checkInherited(node)
    if (ts.isTypeAliasDeclaration(node)) checkAlias(node)
    if (isDomainProperty(node)) {
      const owner = domainOwner(node)
      if (inScope(owner) && !node.questionToken) {
        const propertyType = checker.getTypeAtLocation(node.name)
        checkPropertyDependencies(propertyType, [node], [node.name])
        if (!hasNullishSyntaxFinding(node)) {
          report(propertyType, owner, node.name.getText(source), node.name)
        }
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
  const checkPropertyDependencies = typeDependencyCheck(program, checker)
  const seen = new Set()
  return files.flatMap(filename => {
    const path = resolve(filename)
    if (seen.has(path)) return []
    seen.add(path)
    const source = program.getSourceFile(path)
    if (!source) throw new Error(`${project}: domain source ${filename} is absent from the project`)
    if (source.isDeclarationFile) return []
    return findNullableProperties(
      source,
      checker,
      symbolsByFile.get(filename),
      checkPropertyDependencies,
    ).map(finding => ({ ...finding, filename, code: nullableDomainRule }))
  })
}
