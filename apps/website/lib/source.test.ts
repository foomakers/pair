import { describe, it, expect } from 'vitest'
import { join } from 'path'

describe('website source config', () => {
  it('source.config exports are importable', async () => {
    const mod = await import('../source.config')
    expect(mod.docs).toBeDefined()
    expect(mod.default).toBeDefined()
  })
})

describe('docs sidebar (B7)', () => {
  it('fumadocs renders the meta.json separator before Reference', async () => {
    const { loader } = await import('fumadocs-core/source')
    const { readFileSync } = await import('fs')
    const meta = JSON.parse(readFileSync(join(__dirname, '../content/docs/meta.json'), 'utf-8'))
    const page = (name: string) => ({
      type: 'page' as const,
      path: `${name}.mdx`,
      data: { title: name === 'reference' ? 'Reference' : name },
    })
    const tree = loader({
      baseUrl: '/docs',
      source: {
        files: [
          { type: 'meta' as const, path: 'meta.json', data: meta },
          ...meta.pages.filter((p: string) => !p.startsWith('---')).map(page),
        ],
      },
    }).pageTree
    const kinds = tree.children.map(n => n.type)
    const sep = kinds.indexOf('separator')
    expect(sep).toBeGreaterThan(-1)
    expect(tree.children[sep + 1].name).toBe('Reference')
  })
})
