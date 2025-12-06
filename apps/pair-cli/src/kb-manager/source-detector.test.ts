import { detectSourceType, SourceType } from './source-detector'
import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const tmpDir = path.join(__dirname, '../../.tmp/source-detector-test')
const zipFile = path.join(tmpDir, 'test.zip')
const dir = path.join(tmpDir, 'testdir')

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true })
  fs.writeFileSync(zipFile, 'dummy')
  fs.mkdirSync(dir, { recursive: true })
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('detectSourceType', () => {
  it('detects REMOTE_URL', () => {
    expect(detectSourceType('https://example.com/kb.zip')).toBe(SourceType.REMOTE_URL)
    expect(detectSourceType('http://example.com/kb.zip')).toBe(SourceType.REMOTE_URL)
  })

  it('rejects unsafe protocols', () => {
    expect(detectSourceType('file:///tmp/kb.zip')).toBe(SourceType.INVALID)
    expect(detectSourceType('ftp://example.com/kb.zip')).toBe(SourceType.INVALID)
  })

  it('detects LOCAL_ZIP (absolute)', () => {
    expect(detectSourceType(zipFile)).toBe(SourceType.LOCAL_ZIP)
  })

  it('detects LOCAL_ZIP (relative)', () => {
    const rel = path.relative(process.cwd(), zipFile)
    expect(detectSourceType(rel)).toBe(SourceType.LOCAL_ZIP)
  })

  it('detects LOCAL_DIRECTORY (absolute)', () => {
    expect(detectSourceType(dir)).toBe(SourceType.LOCAL_DIRECTORY)
  })

  it('detects LOCAL_DIRECTORY (relative)', () => {
    const rel = path.relative(process.cwd(), dir)
    expect(detectSourceType(rel)).toBe(SourceType.LOCAL_DIRECTORY)
  })

  it('returns INVALID for non-existent path', () => {
    expect(detectSourceType('/not/a/real/path')).toBe(SourceType.INVALID)
  })
})
