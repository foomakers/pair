const domainDeclarations = new Set([
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'ClassDeclaration',
])
const propertyVisitors = [
  'TSPropertySignature',
  'PropertyDefinition',
  'TSAbstractPropertyDefinition',
  'AccessorProperty',
  'TSAbstractAccessorProperty',
  'TSParameterProperty',
]
const assertionVisitors = ['TSAsExpression', 'TSTypeAssertion', 'TSNonNullExpression']

function domainOwner(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (domainDeclarations.has(parent.type) && parent.id) return parent.id.name
  }
}

function directNullish(type) {
  switch (type?.type) {
    case 'TSNullKeyword':
    case 'TSUndefinedKeyword':
      return true
    case 'TSParenthesizedType':
      return directNullish(type.typeAnnotation)
    case 'TSUnionType':
      return type.types.some(directNullish)
    default:
      return false
  }
}

function propertyTarget(node) {
  if (node.type !== 'TSParameterProperty') return node
  const { parameter } = node
  return parameter.type === 'AssignmentPattern' ? parameter.left : parameter
}

function propertyReport(context, node, owner) {
  const key = node.key ?? context.sourceCode.getFirstToken(node)
  const property = context.sourceCode.getText(key)
  return { loc: key.loc, data: { property: owner ? `${owner}.${property}` : property } }
}

function domainRule(visitors, message, matches, report = (_context, node) => ({ node })) {
  return {
    meta: {
      type: 'problem',
      schema: [
        {
          type: 'object',
          properties: { domainSymbols: { type: 'array', items: { type: 'string' } } },
          additionalProperties: false,
        },
      ],
      messages: { violation: message },
    },
    create(context) {
      const symbols = context.options[0]?.domainSymbols
      function visit(declaration) {
        const node = propertyTarget(declaration)
        if (!matches(node)) return
        const owner = domainOwner(declaration)
        if (symbols && !symbols.includes(owner)) return
        context.report({ messageId: 'violation', ...report(context, node, owner) })
      }
      return Object.fromEntries(visitors.map(type => [type, visit]))
    },
  }
}

export default {
  meta: { name: 'pair-domain' },
  rules: {
    'no-optional-domain-properties': domainRule(
      propertyVisitors,
      'Make {{property}} required on the appropriate tagged variant.',
      node => node.optional,
      propertyReport,
    ),
    'no-explicit-nullish-domain-types': domainRule(
      propertyVisitors,
      'Remove null or undefined from {{property}} and model absence as a separate variant.',
      node => directNullish(node.typeAnnotation?.typeAnnotation),
      propertyReport,
    ),
    'no-unsafe-domain-assertions': domainRule(
      assertionVisitors,
      'Use a guard, checked annotation or satisfies instead of a type assertion.',
      () => true,
    ),
  },
}
