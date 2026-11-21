import { textsOf, violations, type JsonSchema } from './schema'

const schema: JsonSchema = {
  type: 'object',
  required: ['kind'],
  additionalProperties: false,
  properties: {
    kind: { enum: ['a', 'b'] },
    version: { const: 1 },
    head: { type: 'string', pattern: '^[0-9a-f]{4}$' },
    gates: { type: 'array', items: { type: 'string' } },
    steps: {
      type: 'object',
      minProperties: 1,
      propertyNames: { pattern: '^[a-z]+$' },
      additionalProperties: { type: 'integer' },
    },
  },
}

const ALLOWED = 'use one of kind, version, head, gates, steps'

describe('violations', () => {
  it('accepts a conforming value', () => {
    const value = { kind: 'a', version: 1, head: '0af3', gates: ['x'], steps: { one: 1 } }
    expect(violations(schema, value)).toEqual([])
  })

  it.each([
    ['a missing required key', {}, { path: [], problem: "missing key 'kind'", fix: "add 'kind'" }],
    [
      'an undeclared key',
      { kind: 'a', extra: 1 },
      { path: ['extra'], problem: "unknown key 'extra'", fix: ALLOWED },
    ],
    [
      'a value outside the enum',
      { kind: 'c' },
      { path: ['kind'], problem: 'unknown value "c"', fix: 'use one of "a", "b"' },
    ],
    [
      'a value other than the const',
      { kind: 'a', version: 2 },
      { path: ['version'], problem: 'unknown value 2', fix: 'use 1' },
    ],
    [
      'a wrong type',
      { kind: 'a', head: 7 },
      {
        path: ['head'],
        problem: 'expected string, found integer 7',
        fix: 'write a value of type string',
      },
    ],
    [
      'a pattern mismatch',
      { kind: 'a', head: 'zzzz' },
      {
        path: ['head'],
        problem: '"zzzz" does not match ^[0-9a-f]{4}$',
        fix: 'write a value matching ^[0-9a-f]{4}$',
      },
    ],
    [
      'a wrong array item',
      { kind: 'a', gates: ['x', 2] },
      {
        path: ['gates', 1],
        problem: 'expected string, found integer 2',
        fix: 'write a value of type string',
      },
    ],
    [
      'an empty map',
      { kind: 'a', steps: {} },
      { path: ['steps'], problem: 'is empty', fix: 'add at least one entry' },
    ],
    [
      'a key outside the name pattern',
      { kind: 'a', steps: { '1': 1 } },
      {
        path: ['steps', '1'],
        problem: "key '1' does not match ^[a-z]+$",
        fix: 'rename it to match ^[a-z]+$',
      },
    ],
    [
      'a member against the additional-properties schema',
      { kind: 'a', steps: { one: 'x' } },
      {
        path: ['steps', 'one'],
        problem: 'expected integer, found string "x"',
        fix: 'write a value of type integer',
      },
    ],
    [
      'null where an object is expected',
      null,
      { path: [], problem: 'expected object, found null', fix: 'write a value of type object' },
    ],
  ])('reports %s', (_name, value, expected) => {
    expect(violations(schema, value)).toEqual([expected])
  })

  it('tells to remove a key when the schema declares none', () => {
    expect(violations({ type: 'object', additionalProperties: false }, { a: 1 })).toEqual([
      { path: ['a'], problem: "unknown key 'a'", fix: 'remove it' },
    ])
  })
})

describe('textsOf', () => {
  it('lists every string of a value, keys of maps included, with its path', () => {
    expect(textsOf({ a: 'x', b: [1, 'y', { c: 'z' }], d: null })).toEqual([
      [['a'], 'a'],
      [['a'], 'x'],
      [['b'], 'b'],
      [['b', 1], 'y'],
      [['b', 2, 'c'], 'c'],
      [['b', 2, 'c'], 'z'],
      [['d'], 'd'],
    ])
  })
})
