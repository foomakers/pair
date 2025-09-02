import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../../../')

const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Root package.json scripts', () => {
  it('should have a lint script that runs ESLint with turbo', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts.lint).toMatch(/turbo lint/)
  })

  it('should have a prettier:check script that checks formatting', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts['prettier:check']).toMatch(/turbo prettier:check/)
  })

  it('should have a prettier:fix script that fix formatting', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts['prettier:fix']).toMatch(/turbo prettier:fix/)
  })
})
