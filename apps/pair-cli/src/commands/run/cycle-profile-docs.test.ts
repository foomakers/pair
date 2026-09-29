import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, resolve } from 'path'

/**
 * US-488 r0-1 (b) — the KB zero-config paragraph must state what BOTH realizations do over an
 * existing run binding (`.workflow-profile.json`): the in-session coordinator always runs the
 * resolver with `--dir` (binding the KB default), and a pair-cli zero-config resume must not keep an
 * earlier binding. An unqualified "nothing is written" is false for both.
 */
const ROOT = process.env['PAIR_DOCS_ROOT'] ?? resolve(__dirname, '../../../../..')
const DOC = '.pair/knowledge/guidelines/collaboration/automation/workflow-profiles.md'
const COPIES = [DOC, join('packages/knowledge-hub/dataset', DOC)]

function zeroConfigSection(file: string): string {
  const text = readFileSync(join(ROOT, file), 'utf8')
  const start = text.indexOf('## Zero-configuration path')
  expect(start, `${file}: zero-config section`).toBeGreaterThanOrEqual(0)
  const end = text.indexOf('\n## ', start + 1)
  return text.slice(start, end === -1 ? undefined : end)
}

const sentences = (s: string): string[] =>
  s
    .replace(/\s+/g, ' ')
    .split(/(?<=[.;])\s+/)
    .filter(x => x.length > 0)

describe('r0-1 doc parity: zero-config paragraph over an existing binding', () => {
  it('r0-1 doc parity', () => {
    const [canonical, mirror] = COPIES.map(zeroConfigSection)
    expect(mirror, 'dataset mirror equals canonical').toBe(canonical)
    const all = sentences(canonical ?? '')
    // No unqualified "nothing is written": only a sentence scoped to a FRESH run may say it.
    const unqualified = all.filter(x => /nothing is written/i.test(x) && !/\bfresh\b/i.test(x))
    expect(unqualified, 'unqualified "nothing is written"').toEqual([])
    // The behaviour over an existing binding: the binding file, the KB default, and that the
    // earlier binding does not survive (replaced / rebound / removed).
    const binding = all.filter(
      x =>
        x.includes('.workflow-profile.json') &&
        x.includes('KB default') &&
        /(earlier|existing|previous|prior)/i.test(x) &&
        /(replac|rebind|rebound|overwrit|remov)/i.test(x),
    )
    expect(
      binding.length,
      'sentence stating the zero-config effect on an earlier binding',
    ).toBeGreaterThan(0)
  })
})
