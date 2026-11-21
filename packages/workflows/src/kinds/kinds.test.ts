import { kindByName, readGateRegistry } from '.'
import { violations } from '../schema'

describe('kind `with` options (AC-5)', () => {
  it.each([
    ['implement', { gates: ['quality-gate'] }],
    ['implement', { gates: [] }],
    ['implement', {}],
    ['review', { blocking: 'Major' }],
    ['generic', { anything: { nested: [1, 2] } }],
  ] as const)('%s accepts %j', (kind, options) => {
    expect(violations(kindByName[kind].with, options)).toEqual([])
  })

  it.each([
    ['implement', { gate: ['quality-gate'] }, "unknown key 'gate'"],
    ['review', { floor: 'Major' }, "unknown key 'floor'"],
    ['implement', { gates: 'quality-gate' }, 'expected array, found string "quality-gate"'],
    ['review', { blocking: 'Trivial' }, 'unknown value "Trivial"'],
  ] as const)('%s refuses %j', (kind, options, problem) => {
    expect(violations(kindByName[kind].with, options).map(found => found.problem)).toEqual([
      problem,
    ])
  })
})

describe('kind contracts (AC-4, design §3)', () => {
  it('names the pair skill of each typed kind, and none for generic', () => {
    expect(kindByName.implement.defaultUses).toBe('pair-process-implement')
    expect(kindByName.review.defaultUses).toBe('pair-process-review')
    expect(kindByName.generic.defaultUses).toBeUndefined()
  })

  it.each([
    ['implement', ['card'], ['branch', 'pr', 'head']],
    ['review', ['card', 'pr', 'head'], ['verdict', 'reviewedHead', 'findings']],
    ['generic', [], []],
  ] as const)('%s receives %j and returns %j', (kind, inputs, outputs) => {
    expect(kindByName[kind].inputs.required ?? []).toEqual(inputs)
    expect(kindByName[kind].outputs.required ?? []).toEqual(outputs)
  })
})

describe('readGateRegistry', () => {
  const table = (header: string, rows: string[]) =>
    [
      '## Quality Gates',
      '',
      '### Custom Gate Registry',
      '',
      header,
      '| --- |',
      ...rows,
      '',
      '## Next',
    ].join('\n')

  it('maps each key to its command', () => {
    const text = table('| Order | Key | Gate | Command | Required |', [
      '| 1 | quality-gate | Quality Gate | `pnpm quality-gate` | Yes |',
      '| 2 | smoke-tests | Smoke tests | `pnpm smoke-tests` | Yes |',
    ])
    expect(readGateRegistry(text)).toEqual({
      'quality-gate': 'pnpm quality-gate',
      'smoke-tests': 'pnpm smoke-tests',
    })
  })

  it('reads the registry table only: not the prose around it, not the table of the next section', () => {
    const text = [
      '### Custom Gate Registry',
      '',
      'Gate 2 runs a subset in CI | see the list.',
      '',
      '| Order | Key | Gate | Command |',
      '| --- | --- | --- | --- |',
      '| 1 | quality-gate | Quality Gate | `pnpm quality-gate` |',
      '',
      '## Merge Strategy',
      '',
      '| Order | Key | Gate | Command |',
      '| --- | --- | --- | --- |',
      '| 1 | not-a-gate | Other | `other` |',
    ].join('\n')
    expect(readGateRegistry(text)).toEqual({ 'quality-gate': 'pnpm quality-gate' })
  })

  it.each([
    [
      'a table with no Key column',
      table('| Order | Gate | Command |', ['| 1 | Quality Gate | `pnpm quality-gate` |']),
    ],
    [
      'a registry declared empty',
      '### Custom Gate Registry\n\nNo custom quality gates configured.\n',
    ],
    ['no registry section', '## Quality Gates\n'],
  ])('has no keys for %s', (_name, text) => {
    expect(readGateRegistry(text)).toEqual({})
  })
})
