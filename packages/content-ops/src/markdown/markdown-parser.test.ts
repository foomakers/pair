import { describe, it, expect } from 'vitest'
import { extractLinks } from './markdown-parser'

describe('markdown-parser extractLinks - edge cases', () => {
  it('handles empty href links', async () => {
    const content = 'Empty link: [text]() and another [](empty.md)'
    const links = await extractLinks(content)
    expect(links).toHaveLength(2)
    expect(links[0]!.href).toBe('')
    expect(links[1]!.href).toBe('empty.md')
  })
})
