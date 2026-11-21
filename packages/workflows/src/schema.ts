/**
 * The subset of JSON Schema the package needs, and its one validator: the grammar, a kind's `with`
 * options and a step's result are all checked here.
 * ponytail: no `$ref`, `oneOf` or formats; adopt a full validator when a schema needs them.
 */
export interface JsonSchema {
  readonly type?: 'object' | 'array' | 'string' | 'integer' | 'boolean'
  readonly description?: string
  readonly const?: unknown
  readonly enum?: readonly unknown[]
  readonly pattern?: string
  readonly required?: readonly string[]
  readonly properties?: Readonly<Record<string, JsonSchema>>
  readonly additionalProperties?: boolean | JsonSchema
  readonly propertyNames?: { readonly pattern: string }
  readonly minProperties?: number
  readonly items?: JsonSchema
}

export type Path = readonly (string | number)[]

/** One way `value` departs from a schema: where, what was found against what was expected, and the remedy. */
export interface Violation {
  readonly path: Path
  readonly problem: string
  readonly fix: string
}

const show = (value: unknown): string => JSON.stringify(value) ?? String(value)

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return Number.isInteger(value) ? 'integer' : typeof value
}

function scalarViolations(schema: JsonSchema, value: unknown, path: Path): Violation[] {
  if (schema.type !== undefined && typeOf(value) !== schema.type)
    return [
      {
        path,
        problem: `expected ${schema.type}, found ${value === null ? 'null' : `${typeOf(value)} ${show(value)}`}`,
        fix: `write a value of type ${schema.type}`,
      },
    ]
  if ('const' in schema && value !== schema.const)
    return [{ path, problem: `unknown value ${show(value)}`, fix: `use ${show(schema.const)}` }]
  if (schema.enum !== undefined && !schema.enum.includes(value))
    return [
      {
        path,
        problem: `unknown value ${show(value)}`,
        fix: `use one of ${schema.enum.map(show).join(', ')}`,
      },
    ]
  if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(String(value)))
    return [
      {
        path,
        problem: `${show(value)} does not match ${schema.pattern}`,
        fix: `write a value matching ${schema.pattern}`,
      },
    ]
  return []
}

function keyViolations(schema: JsonSchema, key: string, path: Path): Violation[] {
  const names = schema.propertyNames?.pattern
  if (names !== undefined && !new RegExp(names).test(key))
    return [
      {
        path: [...path, key],
        problem: `key '${key}' does not match ${names}`,
        fix: `rename it to match ${names}`,
      },
    ]
  if (schema.additionalProperties !== false) return []
  const allowed = Object.keys(schema.properties ?? {})
  return [
    {
      path: [...path, key],
      problem: `unknown key '${key}'`,
      fix: allowed.length > 0 ? `use one of ${allowed.join(', ')}` : 'remove it',
    },
  ]
}

function objectViolations(
  schema: JsonSchema,
  value: Readonly<Record<string, unknown>>,
  path: Path,
): Violation[] {
  const keys = Object.keys(value)
  const missing = (schema.required ?? [])
    .filter(key => !(key in value))
    .map(key => ({ path, problem: `missing key '${key}'`, fix: `add '${key}'` }))
  const empty =
    keys.length < (schema.minProperties ?? 0)
      ? [{ path, problem: 'is empty', fix: 'add at least one entry' }]
      : []
  const members = keys.flatMap(key => {
    // Own lookup: `constructor`, `toString`, `__proto__` are keys like any other, never the inherited members.
    const declared = Object.hasOwn(schema.properties ?? {}, key)
      ? schema.properties?.[key]
      : undefined
    if (declared !== undefined) return violations(declared, value[key], [...path, key])
    const named = keyViolations(schema, key, path)
    if (named.length > 0 || typeof schema.additionalProperties !== 'object') return named
    return violations(schema.additionalProperties, value[key], [...path, key])
  })
  return [...missing, ...empty, ...members]
}

/** Every violation of `schema` by `value`, in document order; empty when it conforms. */
export function violations(schema: JsonSchema, value: unknown, path: Path = []): Violation[] {
  const scalar = scalarViolations(schema, value, path)
  if (scalar.length > 0) return scalar
  if (Array.isArray(value))
    return value.flatMap((item, index) => violations(schema.items ?? {}, item, [...path, index]))
  if (typeof value === 'object' && value !== null)
    return objectViolations(schema, value as Record<string, unknown>, path)
  return []
}

/** Every string inside a JSON value, keys of maps included, each with its path: what a safety check reads. */
export function textsOf(value: unknown, path: Path = []): [Path, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (Array.isArray(value)) return value.flatMap((item, index) => textsOf(item, [...path, index]))
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, member]) => [
    [[...path, key], key] as [Path, string],
    ...textsOf(member, [...path, key]),
  ])
}
