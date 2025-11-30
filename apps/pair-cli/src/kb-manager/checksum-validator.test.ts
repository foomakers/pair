import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createHash } from 'crypto'

const {
  calculateSHA256,
  validateChecksum,
  getExpectedChecksum,
} = await import('./checksum-validator')

describe('Checksum Validator - SHA256 Calculation', () => {
  it('calculates SHA256 hash of file content', async () => {
    const content = 'test content'
    const expectedHash = createHash('sha256').update(content).digest('hex')
    
    const fs = new InMemoryFileSystemService(
      { '/tmp/test.txt': content },
      '/',
      '/',
    )
    
    const hash = await calculateSHA256('/tmp/test.txt', fs)
    expect(hash).toBe(expectedHash)
  })

  it('calculates hash for binary content', async () => {
    const content = Buffer.alloc(1024, 'binary data')
    const expectedHash = createHash('sha256').update(content).digest('hex')
    
    const fs = new InMemoryFileSystemService(
      { '/tmp/binary.dat': content.toString() },
      '/',
      '/',
    )
    
    const hash = await calculateSHA256('/tmp/binary.dat', fs)
    expect(hash).toBe(expectedHash)
  })

  it('produces different hashes for different content', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/tmp/file1.txt': 'content1',
        '/tmp/file2.txt': 'content2',
      },
      '/',
      '/',
    )
    
    const hash1 = await calculateSHA256('/tmp/file1.txt', fs)
    const hash2 = await calculateSHA256('/tmp/file2.txt', fs)
    expect(hash1).not.toBe(hash2)
  })

  it('produces consistent hashes for same content', async () => {
    const content = 'consistent content'
    const fs = new InMemoryFileSystemService(
      { '/tmp/test.txt': content },
      '/',
      '/',
    )
    
    const hash1 = await calculateSHA256('/tmp/test.txt', fs)
    const hash2 = await calculateSHA256('/tmp/test.txt', fs)
    expect(hash1).toBe(hash2)
  })
})

describe('Checksum Validator - Validation', () => {
  it('validates correct checksum', async () => {
    const content = 'test content for validation'
    const expectedHash = createHash('sha256').update(content).digest('hex')
    
    const fs = new InMemoryFileSystemService(
      { '/tmp/file.zip': content },
      '/',
      '/',
    )
    
    const result = await validateChecksum('/tmp/file.zip', expectedHash, fs)
    expect(result.isValid).toBe(true)
    expect(result.actualChecksum).toBe(expectedHash)
    expect(result.expectedChecksum).toBe(expectedHash)
  })

  it('detects incorrect checksum', async () => {
    const content = 'actual content'
    const wrongHash = createHash('sha256').update('wrong content').digest('hex')
    
    const fs = new InMemoryFileSystemService(
      { '/tmp/file.zip': content },
      '/',
      '/',
    )
    
    const result = await validateChecksum('/tmp/file.zip', wrongHash, fs)
    expect(result.isValid).toBe(false)
    expect(result.actualChecksum).not.toBe(wrongHash)
    expect(result.expectedChecksum).toBe(wrongHash)
  })

  it('handles case-insensitive checksum comparison', async () => {
    const content = 'test content'
    const hash = createHash('sha256').update(content).digest('hex')
    const upperCaseHash = hash.toUpperCase()
    
    const fs = new InMemoryFileSystemService(
      { '/tmp/file.zip': content },
      '/',
      '/',
    )
    
    const result = await validateChecksum('/tmp/file.zip', upperCaseHash, fs)
    expect(result.isValid).toBe(true)
  })
})

describe('Checksum Validator - Expected Checksum Retrieval', () => {
  it('fetches checksum from .sha256 file', async () => {
    const checksumContent = 'abc123def456'
    
    const result = await getExpectedChecksum(checksumContent)
    expect(result).toBe('abc123def456')
  })

  it('extracts checksum from format: hash filename', async () => {
    const checksumContent = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  file.zip'
    
    const result = await getExpectedChecksum(checksumContent)
    expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('handles checksum-only content', async () => {
    const hash = 'a'.repeat(64) // SHA256 is 64 hex chars
    
    const result = await getExpectedChecksum(hash)
    expect(result).toBe(hash)
  })

  it('trims whitespace from checksum', async () => {
    const checksumContent = '  abc123def456  \n'
    
    const result = await getExpectedChecksum(checksumContent)
    expect(result).toBe('abc123def456')
  })

  it('returns null when checksum file not found', async () => {
    const result = await getExpectedChecksum(null)
    expect(result).toBeNull()
  })
})

describe('Checksum Validator - Integration', () => {
  it('validates downloaded file against checksum', async () => {
    const content = 'KB archive content'
    const expectedHash = createHash('sha256').update(content).digest('hex')
    
    const fs = new InMemoryFileSystemService(
      { '/tmp/kb.zip': content },
      '/',
      '/',
    )
    
    const checksumContent = `${expectedHash}  kb.zip`
    const checksum = await getExpectedChecksum(checksumContent)
    expect(checksum).not.toBeNull()
    
    const result = await validateChecksum('/tmp/kb.zip', checksum!, fs)
    expect(result.isValid).toBe(true)
  })
})
