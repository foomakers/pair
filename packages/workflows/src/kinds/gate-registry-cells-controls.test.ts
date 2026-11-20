import { describe, expect, it } from 'vitest'
import { readGateRegistry } from '.'

/**
 * #652 r0-4 — what reading a registry cell already does right, and must keep doing once a Key
 * loses its backticks and an escaped pipe stays in its cell.
 */

const HEADER = '| Order | Key | Gate | Command |'
const registry = (header: string, ...rows: string[]) =>
  ['### Custom Gate Registry', '', header, '| --- |', ...rows, '', '## Next'].join('\n')

describe('readGateRegistry: cells already read right (r0-4 controls)', () => {
  it.each([
    [
      'c1 a plain key, the command as inline code',
      registry(HEADER, '| 1 | quality-gate | Quality Gate | `pnpm quality-gate` |'),
      { 'quality-gate': 'pnpm quality-gate' },
    ],
    [
      'c2 a plain key, a plain command',
      registry(HEADER, '| 1 | quality-gate | Quality Gate | pnpm quality-gate |'),
      { 'quality-gate': 'pnpm quality-gate' },
    ],
    [
      'c3 the adopted shape: padded cells, columns after Command',
      registry(
        '| Order | Key          | Gate         | Command             | Scope Key | Required |',
        '| 1     | quality-gate | Quality Gate | `pnpm quality-gate` | quality   | Yes      |',
        '| 2     | smoke-tests  | Smoke tests  | `pnpm smoke-tests`  | testing   | Yes      |',
      ),
      { 'quality-gate': 'pnpm quality-gate', 'smoke-tests': 'pnpm smoke-tests' },
    ],
    [
      'c4 a backtick inside the command is kept: only the cell edges are inline-code marks',
      registry(HEADER, '| 1 | quality-gate | Quality Gate | pnpm run `gate` now |'),
      { 'quality-gate': 'pnpm run `gate` now' },
    ],
    [
      'c5 a backslash that escapes no pipe is kept',
      registry(HEADER, '| 1 | quality-gate | Quality Gate | `printf a\\tb` |'),
      { 'quality-gate': 'printf a\\tb' },
    ],
    [
      'c6 a row with an empty Key cell is no key',
      registry(
        HEADER,
        '| 1 |  | Nothing | `pnpm nothing` |',
        '| 2 | quality-gate | Quality Gate | `pnpm quality-gate` |',
      ),
      { 'quality-gate': 'pnpm quality-gate' },
    ],
  ])('%s', (_name, text, expected) => {
    expect(readGateRegistry(text)).toEqual(expected)
  })
})
