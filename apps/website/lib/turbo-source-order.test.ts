import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// #568 B2: `next build` (fumadocs-mdx) rewrites .source/index.ts (measured: mtime changes across a build);
// a parallel `tsc` read it half-written (TS2306). ts:check must therefore run after the website build.
describe('turbo: website ts:check is ordered after the build that regenerates .source', () => {
  const raw = readFileSync(join(__dirname, '../../../turbo.json'), 'utf8')
  const turbo = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, '')) as {
    tasks: Record<string, { dependsOn?: string[] }>
  }

  it('@pair/website#ts:check dependsOn build (and keeps ^build)', () => {
    const deps = turbo.tasks['@pair/website#ts:check']?.dependsOn ?? []
    expect(deps).toContain('build')
    expect(deps).toContain('^build')
  })
})
