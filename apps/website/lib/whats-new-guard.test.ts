import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../../..')

describe('#562 What\'s new + CHANGELOG guards', () => {
  it('whats-new has exactly one link per list item', () => {
    const src = readFileSync(resolve(root, 'apps/website/content/docs/whats-new.mdx'), 'utf8')
    const body = src.split(/\nNext: /)[0]
    const items = body.split(/\n(?=\d+\. )/).slice(1)
    expect(items.length).toBeGreaterThan(0)
    for (const i of items) expect(i.match(/\]\(\/docs\//g)).toHaveLength(1)
  })

  it('no CHANGELOG has a "## 0.5.0" heading', () => {
    const files: string[] = []
    for (const d of ['apps', 'packages', 'tools'])
      for (const p of readdirSync(resolve(root, d))) files.push(resolve(root, d, p, 'CHANGELOG.md'))
    const bad = files.filter(f => {
      try {
        return /^## 0\.5\.0\b/m.test(readFileSync(f, 'utf8'))
      } catch {
        return false
      }
    })
    expect(bad).toEqual([])
  })
})
