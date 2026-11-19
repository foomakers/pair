import { execFileSync } from 'child_process'
import { fileSystemService as fs } from '@pair/content-ops'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../quality-gates/repo-root'

// Found by the throwaway-repo release run (AC10): pre/rc went out under dist-tag `latest`.
let dir = ''
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

function publishArgs(version: string): string {
  dir = fs.mkdtempSync(join(tmpdir(), 'publish-npm-'))
  fs.mkdirSync(join(dir, 'package'))
  fs.writeFileSync(
    join(dir, 'package/package.json'),
    JSON.stringify({ name: '@foomakers/pair-cli', version }),
  )
  execFileSync('tar', ['czf', 'pkg.tgz', 'package'], { cwd: dir })
  fs.mkdirSync(join(dir, 'bin'))
  fs.writeFileSync(join(dir, 'bin/npm'), `#!/bin/sh\necho "$@" >> "${dir}/npm.log"\n`)
  fs.chmodSync(join(dir, 'bin/npm'), 0o755)
  execFileSync(
    join(REPO_ROOT, 'scripts/workflows/release/publish-npm.sh'),
    [join(dir, 'pkg.tgz'), '--dry-run'],
    { env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, NPM_TOKEN: 't' } },
  )
  return fs
    .readFileSync(join(dir, 'npm.log'))
    .split('\n')
    .find(l => l.startsWith('publish')) as string
}

describe('publish-npm dist-tag', () => {
  it('publishes a prerelease under its channel dist-tag, never latest', () => {
    expect(publishArgs('0.5.0-rc.1')).toMatch(/--tag rc\b/)
    expect(publishArgs('0.5.0-pre.2')).toMatch(/--tag pre\b/)
  })
  it('publishes a final under the default dist-tag', () => {
    expect(publishArgs('0.5.0')).not.toMatch(/--tag/)
  })
})
