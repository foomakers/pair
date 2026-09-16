import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * D18, made mechanical — the story's own Definition of Done asks for it in exactly these words:
 * *"grep-verifiable: no classification criteria in workflow code — only tag reads"*.
 *
 * Tags are produced by `classify` and consumed here as **opaque routing keys**. The property that
 * makes tag-driven dispatch safe is not that the current code happens to compare strings: it is that
 * the routing modules are structurally incapable of *judging* a tag — no tier vocabulary, no
 * ordering, no pattern matching, nothing that could make `risk:green` mean more or less than
 * `team:ui`. Prose cannot hold that (the comments already claim it, and a comment has never failed a
 * build); this test is the grep the DoD asks for, run on every commit.
 *
 * Scoped to the two modules that decide routing. The handler around them wires I/O and is allowed
 * its own vocabulary; what must stay pure is the decision.
 */

const HERE = __dirname
const ROUTING_MODULES = ['dispatch.ts', 'workflow-mapping.ts'] as const

/**
 * Source with comments removed — the guard is about CODE.
 *
 * Comments legitimately say "no tier ordering" and "never reads a classification criterion", and a
 * guard that tripped on its own documentation would be deleted within the week.
 */
function code(module: string): string {
  return readFileSync(join(HERE, module), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

// A tier NAME as a value, not as English: `'green'`, `"risk:red"`, `risk:yellow` in a literal. What
// must not exist is code that can tell one tier from another.
const TIER_VOCABULARY = /['"`][^'"`\n]*\b(green|yellow|orange|red)\b[^'"`\n]*['"`]|['"`]risk:/i

// Anything that inspects the SHAPE of a tag instead of comparing it whole. A prefix test is how
// "the risk family" gets special-cased, and a comparison operator is how a tier order gets one.
const SHAPE_INSPECTION =
  /\.(startsWith|endsWith|toLowerCase|toUpperCase|split|match|matchAll|search|replace|slice|substring|localeCompare)\s*\(/

describe.each(ROUTING_MODULES)('%s — routing reads tags, it never judges them (D18)', module => {
  const source = code(module)

  it('names no classification tier anywhere in its code', () => {
    const offender = TIER_VOCABULARY.exec(source)
    expect(
      offender,
      `${module} carries a tier literal (${offender?.[0]}): routing must not be able to tell one tag from another`,
    ).toBeNull()
  })

  it('imports nothing from a classification or quality module', () => {
    const imports = [...source.matchAll(/from '([^']+)'/g)].map(m => m[1]!)
    for (const specifier of imports) {
      expect(specifier).not.toMatch(/classif|quality|risk|tier/i)
    }
  })
})

describe('dispatch.ts — the routing core compares whole strings, and nothing else', () => {
  const source = code('dispatch.ts')

  it('inspects no tag by shape — no prefix, case or pattern test', () => {
    const offender = SHAPE_INSPECTION.exec(source)
    expect(
      offender,
      `dispatch.ts inspects a value by shape (${offender?.[0]}) — tag matching is plain string equality`,
    ).toBeNull()
  })

  it('carries no regular expression at all', () => {
    // A regex over a tag IS a classification criterion, however innocent it looks on the day it
    // lands: `/^risk:(green|yellow)$/` is a tier policy written in a place no adoption file can see.
    expect(source).not.toMatch(/=\s*\/[^/\n]+\/[gimsuy]*/)
    expect(source).not.toMatch(/\.test\s*\(/)
  })

  it('reads a tag collection only through membership and reporting', () => {
    // Every method called on a `tags` collection, allowlisted. `includes` is the match; `map`,
    // `filter`, `find`, `join` and `length` build the decision and the message that explains it.
    const calls = [...source.matchAll(/\btags\.(\w+)/g)].map(m => m[1]!)
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(['includes', 'map', 'filter', 'find', 'join', 'length']).toContain(call)
    }
  })
})
