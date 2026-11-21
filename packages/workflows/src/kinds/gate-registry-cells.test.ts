import { describe, expect, it } from 'vitest'
import { readGateRegistry } from '.'

/**
 * #652 r0-4 — a registry cell is read the way Markdown writes it.
 *
 * - The Key cell loses its inline-code backticks the way the Command cell of the same function
 *   already does.
 * - GFM tables: "It is possible to include a pipe in a cell's content by escaping it, including
 *   inside other inline spans" — `\|` is a pipe of the cell, never a cell boundary.
 */

const HEADER = '| Order | Key | Gate | Command |'
const registry = (header: string, ...rows: string[]) =>
  ['### Custom Gate Registry', '', header, '| --- |', ...rows, '', '## Next'].join('\n')

const QUALITY = { 'quality-gate': 'pnpm quality-gate' }

describe('readGateRegistry: a Key written as inline code (r0-4)', () => {
  it.each([
    [
      'w1 the key and the command as inline code',
      '| 1 | `quality-gate` | Quality Gate | `pnpm quality-gate` |',
    ],
    [
      'w2 the key as inline code, the command plain',
      '| 1 | `quality-gate` | Quality Gate | pnpm quality-gate |',
    ],
  ])('%s: the key is read without its backticks', (_name, row) => {
    expect(readGateRegistry(registry(HEADER, row))).toEqual(QUALITY)
  })

  it('i1 rows that write the key both ways give the same kind of key', () => {
    const text = registry(
      HEADER,
      '| 1 | `quality-gate` | Quality Gate | `pnpm quality-gate` |',
      '| 2 | smoke-tests | Smoke tests | `pnpm smoke-tests` |',
      '| 3 | `e2e-tests` | E2E tests | pnpm e2e |',
    )
    expect(readGateRegistry(text)).toEqual({
      'quality-gate': 'pnpm quality-gate',
      'smoke-tests': 'pnpm smoke-tests',
      'e2e-tests': 'pnpm e2e',
    })
  })

  it('b1 a key cell that is empty inline code is no key', () => {
    const text = registry(
      HEADER,
      '| 1 | `` | Nothing | `pnpm nothing` |',
      '| 2 | `quality-gate` | Quality Gate | `pnpm quality-gate` |',
    )
    expect(readGateRegistry(text)).toEqual(QUALITY)
  })
})

describe('readGateRegistry: an escaped pipe belongs to its cell (r0-4)', () => {
  it.each([
    [
      'w3 in an inline-code command',
      registry(HEADER, '| 1 | quality-gate | Quality Gate | `pnpm test \\| tee log` |'),
      { 'quality-gate': 'pnpm test | tee log' },
    ],
    [
      'w4 in a plain command',
      registry(HEADER, '| 1 | quality-gate | Quality Gate | pnpm test \\| tee log |'),
      { 'quality-gate': 'pnpm test | tee log' },
    ],
    [
      'w5 in a cell before the Key column',
      registry(
        '| Gate | Key | Command |',
        '| Build \\| test | quality-gate | `pnpm quality-gate` |',
      ),
      QUALITY,
    ],
    [
      'b2 in a header cell before the Key column',
      registry(
        '| Gate \\| Stage | Key | Command |',
        '| Build | quality-gate | `pnpm quality-gate` |',
      ),
      QUALITY,
    ],
    [
      'i2 next to a key written as inline code',
      registry(HEADER, '| 1 | `quality-gate` | Quality Gate | `pnpm test \\| tee log` |'),
      { 'quality-gate': 'pnpm test | tee log' },
    ],
  ])('%s', (_name, text, expected) => {
    expect(readGateRegistry(text)).toEqual(expected)
  })
})
