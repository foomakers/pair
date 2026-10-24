import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { ensureWorkingIgnored } from './working-gitignore'

/** US-576 AC7: `pair install` / `update` add `.pair/working/` to `.gitignore` when missing — idempotently. */
describe('ensureWorkingIgnored', () => {
  const at = (files: Record<string, string>) => new InMemoryFileSystemService(files, '/p', '/p')

  it('creates .gitignore when absent', async () => {
    const fs = at({})
    expect(await ensureWorkingIgnored(fs, '/p')).toBe(true)
    expect(fs.readFileSync('/p/.gitignore')).toBe('.pair/working/\n')
  })

  it('appends to an existing file, keeping its content and adding a missing final newline', async () => {
    const fs = at({ '/p/.gitignore': 'node_modules' })
    await ensureWorkingIgnored(fs, '/p')
    expect(fs.readFileSync('/p/.gitignore')).toBe('node_modules\n.pair/working/\n')
  })

  it.each(['.pair/working/', '.pair/working', '/.pair/working/', '/.pair/working'])(
    'leaves a file that already ignores it (%s) untouched — a second run changes nothing',
    async line => {
      const fs = at({ '/p/.gitignore': `dist\n${line}\n` })
      expect(await ensureWorkingIgnored(fs, '/p')).toBe(false)
      expect(fs.readFileSync('/p/.gitignore')).toBe(`dist\n${line}\n`)
    },
  )
})
