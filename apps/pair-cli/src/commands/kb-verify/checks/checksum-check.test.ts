import { describe, it, expect } from 'vitest'
import { verifyChecksum } from './checksum-check'
import AdmZip from 'adm-zip'
import { createHash } from 'crypto'

describe('verifyChecksum', () => {
  it('returns PASS when checksum matches', () => {
    const content = 'test content'
    const hash = createHash('sha256').update(content).digest('hex')

    const zip = new AdmZip()
    zip.addFile('test.txt', Buffer.from(content))
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({ contentChecksum: hash })))

    const result = verifyChecksum(zip.getEntries(), hash)

    expect(result.status).toBe('PASS')
    expect(result.expected).toBe(hash)
    expect(result.actual).toBe(hash)
  })

  it('returns FAIL when checksum does not match', () => {
    const content = 'test content'
    const wrongHash = 'wrong_hash_value'

    const zip = new AdmZip()
    zip.addFile('test.txt', Buffer.from(content))

    const result = verifyChecksum(zip.getEntries(), wrongHash)

    expect(result.status).toBe('FAIL')
    expect(result.expected).toBe(wrongHash)
    expect(result.actual).not.toBe(wrongHash)
  })

  it('excludes manifest.json from checksum calculation', () => {
    const fileContent = 'test content'
    const fileHash = createHash('sha256').update(fileContent).digest('hex')

    const zip = new AdmZip()
    zip.addFile('test.txt', Buffer.from(fileContent))
    zip.addFile('manifest.json', Buffer.from('{}'))

    const result = verifyChecksum(zip.getEntries(), fileHash)

    expect(result.status).toBe('PASS')
  })

  it('processes files in sorted order', () => {
    const hash = createHash('sha256')
    hash.update(Buffer.from('a'))
    hash.update(Buffer.from('b'))
    const expectedHash = hash.digest('hex')

    const zip = new AdmZip()
    zip.addFile('z.txt', Buffer.from('b'))
    zip.addFile('a.txt', Buffer.from('a'))

    const result = verifyChecksum(zip.getEntries(), expectedHash)

    expect(result.status).toBe('PASS')
  })
})
