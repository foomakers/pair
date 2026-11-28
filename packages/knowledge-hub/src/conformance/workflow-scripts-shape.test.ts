import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * The Claude Code Workflow runtime evaluates a saved workflow as a function body: the ONLY top-level `export`
 * it accepts is `export const meta`. Any other `export` is "SyntaxError: Unexpected keyword 'export'" and the
 * workflow is never launched (pair-loop.js shipped 17 helper exports since #250 and could not run in-session).
 */
const ROOTS = [
  join(__dirname, '../../dataset/.workflows'),
  join(__dirname, '../../../../.claude/workflows'),
]
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

describe.each(ROOTS)('workflow scripts shape (%s)', root => {
  const scripts = readdirSync(root).filter(f => f.endsWith('.js'))

  it('there are workflow scripts to check', () => {
    expect(scripts.length).toBeGreaterThan(0)
  })

  it.each(scripts)('%s: the only top-level export is `export const meta`', file => {
    const source = readFileSync(join(root, file), 'utf-8')
    const exports = source.split('\n').filter(line => /^export\b/.test(line))
    expect(exports.filter(line => !/^export const meta\b/.test(line))).toEqual([])
    expect(exports.filter(line => /^export const meta\b/.test(line))).toHaveLength(1)
  })

  it.each(scripts)('%s: parses as the runtime evaluates it (a function body)', file => {
    const source = readFileSync(join(root, file), 'utf-8').replace(
      /^export const meta\b/m,
      'const meta',
    )
    expect(
      () => new AsyncFunction('agent', 'parallel', 'workflow', 'phase', 'log', 'args', source),
    ).not.toThrow()
  })
})

