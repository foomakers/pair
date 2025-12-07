import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'
import extractZip from './archive-operations'

describe('Archive Operations - ZIP Extraction', () => {
  it('extractZip extracts files into target path (in-memory)', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const zipPath = '/tmp/fake.zip'
    const target = '/out/target'
    fs.writeFile(zipPath, 'zip-contents')

    await extractZip(zipPath, target, fs)
    expect(fs.existsSync(target)).toBe(true)
    expect(fs.existsSync(join(target, 'manifest.json'))).toBe(true)
  })

  it('extractZip throws when zip missing', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    await expect(extractZip('/no-such.zip', '/out', fs)).rejects.toThrow()
  })
})
