import { describe, it, expect } from 'vitest'
import {
  renderReleaseScript,
  releaseZipPath,
  shellSingleQuoted,
  defaultPairCliInvocation,
} from './release-script'

const identity = { name: 'acme-kb', slug: 'acme-kb', skillPrefix: 'acme-kb' }

describe('releaseZipPath', () => {
  it('places the packaged ZIP under dist/ named after the KB slug', () => {
    expect(releaseZipPath(identity)).toBe('dist/acme-kb-$VERSION.zip')
  })
})

describe('shellSingleQuoted', () => {
  it('wraps a plain value in single quotes', () => {
    expect(shellSingleQuoted('Acme KB')).toBe("'Acme KB'")
  })

  it('neutralises quotes, semicolons and expansions', () => {
    expect(shellSingleQuoted('x"; touch /tmp/pwned; #')).toBe(`'x"; touch /tmp/pwned; #'`)
    expect(shellSingleQuoted('$(whoami)`id`')).toBe("'$(whoami)`id`'")
  })

  it('escapes an embedded single quote by closing and reopening the literal', () => {
    expect(shellSingleQuoted("Acme's KB")).toBe("'Acme'\\''s KB'")
  })
})

describe('defaultPairCliInvocation', () => {
  it('pins the CLI version so packaging is reproducible over time', () => {
    expect(defaultPairCliInvocation('0.4.3')).toBe('npx --yes @foomakers/pair-cli@0.4.3')
  })

  it('falls back to the unpinned package when no version is known', () => {
    expect(defaultPairCliInvocation()).toBe('npx --yes @foomakers/pair-cli')
  })
})

describe('renderReleaseScript', () => {
  const github = renderReleaseScript({ identity, host: 'github', cliVersion: '0.4.3' })
  const generic = renderReleaseScript({ identity, host: 'generic', cliVersion: '0.4.3' })

  it('is a strict-mode bash script', () => {
    expect(github.startsWith('#!/usr/bin/env bash\n')).toBe(true)
    expect(github).toContain('set -euo pipefail')
  })

  it('runs from the KB repo root regardless of the invocation directory', () => {
    expect(github).toContain('KB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"')
    expect(github).toContain('cd "$KB_ROOT"')
  })

  it('requires a semver version argument', () => {
    expect(github).toContain('VERSION="${1:-}"')
    expect(github).toContain('grep -Eq')
    expect(github).toMatch(/usage: .*<version>/)
  })

  it('reuses the existing pair package command instead of a new release mechanism', () => {
    expect(github).toContain('PAIR_CLI="${PAIR_CLI:-npx --yes @foomakers/pair-cli@0.4.3}"')
    expect(github).toContain('$PAIR_CLI package')
    expect(github).toContain('--layout source')
    expect(github).toContain('--name "$KB_NAME"')
    expect(github).toContain('--pkg-version "$VERSION"')
    expect(github).toContain('-o "$ZIP"')
  })

  it('documents how to override the pinned CLI', () => {
    expect(github).toMatch(/# Env:\s+PAIR_CLI/)
    expect(github).toContain('@foomakers/pair-cli@latest')
  })

  it('tags and publishes a GitHub release with the ZIP attached on the github host', () => {
    expect(github).toContain('git tag -a "v$VERSION"')
    expect(github).toContain('git push origin "v$VERSION"')
    expect(github).toContain('gh release create "v$VERSION" "$ZIP"')
  })

  it('skips tagging when the tag already exists (re-runs and tag-triggered CI)', () => {
    expect(github).toContain('refs/tags/v$VERSION')
  })

  it('degrades to documented manual publishing when gh is unavailable', () => {
    expect(github).toContain('command -v gh')
    expect(github).toMatch(/publish it however your org does/i)
  })

  it('never presents the release ZIP as an equivalent install source (#395)', () => {
    expect(github).toContain('install --source <git-url-or-path-of-this-KB>')
    expect(github).not.toMatch(/install --source <url-or-path-of-the-zip>/)
  })

  it('omits GitHub-specific publishing on the generic host but still reports the ZIP', () => {
    expect(generic).not.toContain('gh release create')
    expect(generic).toContain('$PAIR_CLI package')
    expect(generic).toMatch(/publish it however your org does/i)
    expect(generic).toContain('$ZIP')
  })

  describe('tagging safety', () => {
    it('tags only when the KB directory is the root of its own git repository', () => {
      expect(github).toContain(
        'GIT_TOPLEVEL="$(git -C "$KB_ROOT" rev-parse --show-toplevel 2>/dev/null || true)"',
      )
      expect(github).toContain('[ "$GIT_TOPLEVEL" != "$KB_ROOT" ]')
      // the guard must short-circuit BEFORE any git tag call
      expect(github.indexOf('$GIT_TOPLEVEL')).toBeLessThan(github.indexOf('git tag -a'))
    })

    it('removes the local tag again when it cannot be pushed', () => {
      expect(github).toContain('if ! git push origin "v$VERSION"; then')
      expect(github).toContain('git tag -d "v$VERSION"')
      expect(github).toMatch(/Could not push v\$VERSION to origin/)
    })
  })

  describe('KB name handling (command injection)', () => {
    const hostile = {
      name: 'x"; touch /tmp/pwned; #',
      slug: 'x-touch-tmp-pwned',
      skillPrefix: 'x-touch-tmp-pwned',
    }
    const script = renderReleaseScript({ identity: hostile, host: 'github' })

    it('assigns the name once, single-quoted, and references it as a variable', () => {
      expect(script).toContain(`KB_NAME='x"; touch /tmp/pwned; #'`)
      expect(script).toContain('echo "==> Packaging $KB_NAME v$VERSION"')
      expect(script).toContain('--name "$KB_NAME"')
      expect(script).toContain('git tag -a "v$VERSION" -m "$KB_NAME v$VERSION"')
      expect(script).toContain('--title "$KB_NAME v$VERSION"')
    })

    it('never interpolates the raw name into an executable line', () => {
      const executableLines = script
        .split('\n')
        .filter(line => !line.startsWith('#') && !line.startsWith('KB_NAME='))
      expect(executableLines.some(line => line.includes(hostile.name))).toBe(false)
    })
  })
})
