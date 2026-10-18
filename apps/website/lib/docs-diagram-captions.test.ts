import { describe, it, expect, vi } from 'vitest'
import { resolve } from 'node:path'
import { findUncaptionedDiagrams, runAllChecks } from './docs-staleness-check'

vi.mock('node:fs', async importOriginal => {
  const real = await importOriginal<typeof import('node:fs')>()
  const readFileSync = ((p: unknown, ...rest: unknown[]) => {
    const out = (real.readFileSync as (...a: unknown[]) => unknown)(p, ...rest)
    if (process.env['STRIP_CAPTIONS'] && String(p).endsWith('.mdx') && typeof out === 'string') {
      return out.replace(/^\*Figure:.*$/gm, '')
    }
    return out
  }) as typeof real.readFileSync
  return { ...real, readFileSync, default: { ...real, readFileSync } }
})

const IMG = '![alt](/diagrams/x.svg)'

describe('findUncaptionedDiagrams', () => {
  it('flags an image not followed by an italic line', () => {
    expect(findUncaptionedDiagrams(`${IMG}\n\ntext\n`, 'a.mdx')).toHaveLength(1)
    expect(findUncaptionedDiagrams(`${IMG}\n`, 'a.mdx')).toHaveLength(1)
  })
  it('passes a captioned image and non-diagram images', () => {
    expect(findUncaptionedDiagrams(`${IMG}\n\n*Figure: x.*\n`, 'a.mdx')).toEqual([])
    expect(findUncaptionedDiagrams('![a](/img/p.png)\ntext', 'a.mdx')).toEqual([])
  })
})

describe('docs:staleness wiring', () => {
  const root = resolve(__dirname, '../../..')
  it('control: current docs have no uncaptioned diagram', () => {
    const { errors } = runAllChecks(root, () => 'open')
    expect(errors.filter(e => /caption/i.test(e))).toEqual([])
  }, 60000)
  it('witness: removing captions makes runAllChecks report them', () => {
    process.env['STRIP_CAPTIONS'] = '1'
    try {
      const { errors } = runAllChecks(root, () => 'open')
      expect(errors.filter(e => /caption/i.test(e)).length).toBeGreaterThan(0)
    } finally {
      delete process.env['STRIP_CAPTIONS']
    }
  }, 60000)
})
