import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  findWriteModeFormatters,
  expandScriptReferences,
  checkRootGate,
  checkThisRepoGate,
  ROOT_PACKAGE_JSON,
  GUARD_SCRIPT,
  REMEDY_SCRIPT,
  PRE_PUSH_REMEDY,
} from './pre-push-gate-composition'

// #394. The husky pre-push hook runs the root `quality-gate` script, which ran
// `prettier:fix` / `mdlint:fix` REPO-WIDE in write mode.
//
// The decisive argument is not noise, it is uselessness: at pre-push the commits
// already exist, so a write-mode formatter rewrites the WORKING TREE and cannot
// touch what is being pushed. The reformats go nowhere unless the author notices
// and amends — so the author either sweeps foreign files into the next commit or
// pushes with `--no-verify`. Once bypassing is routine the hook asserts nothing.
//
// This guard exists because the regression is a one-word edit away, and its
// symptom (a diff polluted with unrelated files) looks like author error rather
// than tooling behaviour. Twice in one day it polluted a PR here.
describe('the pre-push gate never runs a formatter in write mode (#394)', () => {
  it('flags prettier:fix', () => {
    expect(findWriteModeFormatters('turbo ts:check test lint && turbo prettier:fix')).toEqual([
      'prettier:fix',
    ])
  })

  it('flags mdlint:fix', () => {
    expect(findWriteModeFormatters('turbo mdlint:fix && pnpm hygiene:check')).toEqual([
      'mdlint:fix',
    ])
  })

  it('flags the markdownlint-fix shell entrypoint, not only the turbo task', () => {
    expect(
      findWriteModeFormatters("./tools/markdownlint-config/bin/markdownlint-fix.sh '*.md'"),
    ).toEqual(['markdownlint-fix.sh'])
  })

  it('flags every offender, so a partial fix cannot look clean', () => {
    expect(findWriteModeFormatters('turbo prettier:fix mdlint:fix')).toEqual([
      'prettier:fix',
      'mdlint:fix',
    ])
  })

  it('accepts the check-mode composition', () => {
    expect(
      findWriteModeFormatters(
        'turbo ts:check test lint && pnpm format:check && pnpm hygiene:check && pnpm dup:check',
      ),
    ).toEqual([])
  })

  it('does not mistake lint:fix for a formatter — it is not one of the two', () => {
    // `lint:fix` is an eslint autofix, a separate concern from formatting, and it
    // is NOT in the gate. The guard must stay specific rather than banning every
    // `:fix` string it sees.
    expect(findWriteModeFormatters('turbo lint:fix')).toEqual([])
  })

  it('names the remedy, so a failure is actionable', () => {
    expect(PRE_PUSH_REMEDY).toContain(`pnpm ${REMEDY_SCRIPT}`)
  })
})

// The gate no longer NAMES a formatter — it delegates to `pnpm format:check`.
// A scan of the gate string alone would therefore be defeated by the very
// indirection #394 introduced: `&& pnpm format` in the gate, or redefining
// `format:check` as `turbo prettier:fix`, both restore repo-wide write-mode
// formatting with a green guard. Expansion is what makes the guard real.
describe('script references are expanded transitively before scanning (#394)', () => {
  it('inlines a `pnpm <script>` reference to a sibling root script', () => {
    const expanded = expandScriptReferences(
      { format: 'turbo prettier:fix mdlint:fix' },
      'turbo lint && pnpm format',
    )
    expect(findWriteModeFormatters(expanded)).toEqual(['prettier:fix', 'mdlint:fix'])
  })

  it('inlines `pnpm run <script>` too', () => {
    const expanded = expandScriptReferences({ format: 'turbo prettier:fix' }, 'pnpm run format')
    expect(findWriteModeFormatters(expanded)).toEqual(['prettier:fix'])
  })

  it('follows more than one hop (gate -> format:check -> mdlint:fix)', () => {
    const expanded = expandScriptReferences(
      {
        'format:check': 'pnpm prettier:check && pnpm mdlint:check',
        'prettier:check': 'turbo prettier:check',
        'mdlint:check': 'turbo mdlint:fix',
      },
      'pnpm format:check',
    )
    expect(findWriteModeFormatters(expanded)).toEqual(['mdlint:fix'])
  })

  it('terminates on a self-referencing script instead of recursing forever', () => {
    const expanded = expandScriptReferences({ loop: 'pnpm loop' }, 'pnpm loop')
    expect(expanded).toContain('pnpm loop')
  })

  it('terminates on a reference cycle between two scripts', () => {
    const expanded = expandScriptReferences({ a: 'pnpm b', b: 'pnpm a' }, 'pnpm a')
    expect(findWriteModeFormatters(expanded)).toEqual([])
  })

  it('leaves an unknown reference alone (a package script is not a root script)', () => {
    const expanded = expandScriptReferences({}, 'pnpm --filter @pair/dev-tools pre-push-gate:check')
    expect(expanded).toBe('pnpm --filter @pair/dev-tools pre-push-gate:check')
  })
})

describe('checkRootGate reads the repo gate rather than trusting a copy (#394)', () => {
  /** A root package.json shaped like this repo's, with overridable scripts. */
  const pkg = (scripts: Record<string, string>): string =>
    JSON.stringify({
      scripts: {
        'quality-gate': `turbo ts:check test lint && pnpm format:check && pnpm ${GUARD_SCRIPT} && pnpm dup:check`,
        'format:check': 'pnpm prettier:check && pnpm mdlint:check',
        'prettier:check': 'turbo prettier:check',
        'mdlint:check':
          "turbo mdlint:check && ./tools/markdownlint-config/bin/markdownlint-check.sh '*.md'",
        format: 'pnpm prettier:fix && pnpm mdlint:fix',
        'prettier:fix': 'turbo prettier:fix',
        'mdlint:fix':
          "turbo mdlint:fix && ./tools/markdownlint-config/bin/markdownlint-fix.sh '*.md'",
        [GUARD_SCRIPT]: 'pnpm --filter @pair/dev-tools pre-push-gate:check',
        ...scripts,
      },
    })

  it('passes on a check-mode gate that delegates, even though `format` exists', () => {
    // `pnpm format` is DEFINED (write mode, deliberately) — the guard is about
    // what the GATE reaches, not about the repo owning a formatter.
    const r = checkRootGate(pkg({}))
    expect(r.ok, r.message).toBe(true)
  })

  it('fails and NAMES every offender when the gate inlines formatters', () => {
    const r = checkRootGate(
      pkg({ 'quality-gate': `turbo prettier:fix mdlint:fix && pnpm ${GUARD_SCRIPT}` }),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier:fix')
    expect(r.message).toContain('mdlint:fix')
    expect(r.message).toContain('pnpm format')
  })

  it('fails on the one-word regression: the gate calling `pnpm format`', () => {
    const r = checkRootGate(
      pkg({
        'quality-gate': `turbo ts:check test lint && pnpm format && pnpm ${GUARD_SCRIPT}`,
      }),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier:fix')
  })

  it('fails when `format:check` is redefined as a write-mode formatter', () => {
    const r = checkRootGate(pkg({ 'format:check': 'turbo prettier:fix' }))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier:fix')
  })

  it('fails when the gate drops the guard itself', () => {
    const r = checkRootGate(
      pkg({ 'quality-gate': 'turbo ts:check test lint && pnpm format:check && pnpm dup:check' }),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain(GUARD_SCRIPT)
  })

  it('fails when the remedy it advertises does not exist', () => {
    const scripts = JSON.parse(pkg({})) as { scripts: Record<string, string> }
    delete scripts.scripts[REMEDY_SCRIPT]
    const r = checkRootGate(JSON.stringify(scripts))
    expect(r.ok).toBe(false)
    expect(r.message).toContain(REMEDY_SCRIPT)
  })

  it('fails loudly when there is no gate at all, rather than passing vacuously', () => {
    expect(checkRootGate(JSON.stringify({ scripts: {} })).ok).toBe(false)
  })

  it('reports malformed JSON as a gate failure, not a raw SyntaxError', () => {
    // Otherwise the developer reads a stack trace about the guard instead of
    // "your package.json is broken".
    const r = checkRootGate('{ "scripts": { ')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('not valid JSON')
  })

  it('guards the ACTUAL root package.json of this repo', () => {
    // The point of the story: not that a string can be checked, but that THIS
    // repo's gate is check-mode. Reading the real file is what makes the
    // regression impossible to reintroduce silently. The hop count lives in the
    // module (ROOT_PACKAGE_JSON), not duplicated here.
    const result = checkRootGate(readFileSync(ROOT_PACKAGE_JSON, 'utf-8'))
    expect(result.ok, result.message).toBe(true)
  })

  it('this repo keeps the guard wired into its own gate', () => {
    // Removing `pnpm gate:composition` from the gate fails THIS test, which runs
    // inside the gate — so the guard cannot be quietly unplugged.
    const result = checkThisRepoGate()
    expect(result.ok, result.message).toBe(true)
  })
})
