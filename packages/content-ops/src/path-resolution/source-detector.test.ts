import { detectSourceType, SourceType, isGitUrl } from './source-detector'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'
import { describe, it, expect } from 'vitest'

describe('isGitUrl', () => {
  it('matches git:// protocol', () => {
    expect(isGitUrl('git://github.com/org/repo.git')).toBe(true)
  })

  it('matches git@ SSH shorthand', () => {
    expect(isGitUrl('git@github.com:org/repo.git')).toBe(true)
  })

  it('matches ssh://git@ protocol', () => {
    expect(isGitUrl('ssh://git@github.com/org/repo.git')).toBe(true)
  })

  it('matches HTTPS URL ending in .git', () => {
    expect(isGitUrl('https://github.com/org/repo.git')).toBe(true)
  })

  it('matches HTTPS URL ending in .git with #ref', () => {
    expect(isGitUrl('https://github.com/org/repo.git#v1.0.0')).toBe(true)
  })

  it('matches git@ with #ref', () => {
    expect(isGitUrl('git@github.com:org/repo.git#main')).toBe(true)
  })

  it('does not match plain HTTPS URL without .git', () => {
    expect(isGitUrl('https://example.com/kb.zip')).toBe(false)
  })

  it('does not match local path', () => {
    expect(isGitUrl('/some/local/path')).toBe(false)
  })
})

describe('Source Detector', () => {
  const cwd = '/test/project'

  function createFs(files: Record<string, string> = {}) {
    return new InMemoryFileSystemService(files, cwd, cwd)
  }

  it('detects GIT_REPO for HTTPS .git URL', () => {
    expect(detectSourceType('https://github.com/org/repo.git', createFs())).toBe(
      SourceType.GIT_REPO,
    )
  })

  it('detects GIT_REPO for git@ SSH URL', () => {
    expect(detectSourceType('git@github.com:org/repo.git', createFs())).toBe(SourceType.GIT_REPO)
  })

  it('detects GIT_REPO for HTTPS .git URL with #ref', () => {
    expect(detectSourceType('https://github.com/org/repo.git#v1.0.0', createFs())).toBe(
      SourceType.GIT_REPO,
    )
  })

  it('detects REMOTE_URL for https', () => {
    expect(detectSourceType('https://example.com/kb.zip', createFs())).toBe(SourceType.REMOTE_URL)
  })

  it('detects REMOTE_URL for http', () => {
    expect(detectSourceType('http://example.com/kb.zip', createFs())).toBe(SourceType.REMOTE_URL)
  })

  it('rejects file:// protocol', () => {
    expect(detectSourceType('file:///tmp/kb.zip', createFs())).toBe(SourceType.INVALID)
  })

  it('rejects ftp:// protocol', () => {
    expect(detectSourceType('ftp://example.com/kb.zip', createFs())).toBe(SourceType.INVALID)
  })

  it('detects LOCAL_ZIP for absolute path', () => {
    const fs = createFs({ '/data/kb.zip': 'zipdata' })
    expect(detectSourceType('/data/kb.zip', fs)).toBe(SourceType.LOCAL_ZIP)
  })

  it('detects LOCAL_ZIP for relative path', () => {
    const fs = createFs({ [`${cwd}/my-kb.zip`]: 'zipdata' })
    expect(detectSourceType('my-kb.zip', fs)).toBe(SourceType.LOCAL_ZIP)
  })

  it('detects LOCAL_DIRECTORY for absolute path', () => {
    const fs = createFs()
    fs.mkdirSync('/data/kb-dataset')
    expect(detectSourceType('/data/kb-dataset', fs)).toBe(SourceType.LOCAL_DIRECTORY)
  })

  it('detects LOCAL_DIRECTORY for relative path', () => {
    const fs = createFs()
    fs.mkdirSync(`${cwd}/kb-dataset`)
    expect(detectSourceType('kb-dataset', fs)).toBe(SourceType.LOCAL_DIRECTORY)
  })

  it('returns INVALID for non-existent path', () => {
    expect(detectSourceType('/not/a/real/path', createFs())).toBe(SourceType.INVALID)
  })

  it('requires fs parameter', () => {
    const fs = createFs()
    expect(detectSourceType('https://example.com/kb.zip', fs)).toBe(SourceType.REMOTE_URL)
    expect(detectSourceType('ftp://example.com/kb.zip', fs)).toBe(SourceType.INVALID)
  })
})
