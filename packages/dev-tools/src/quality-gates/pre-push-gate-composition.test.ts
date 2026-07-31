import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  findWriteModeFormatters,
  checkRootGate,
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
    expect(PRE_PUSH_REMEDY).toContain('pnpm format')
  })
})

describe('checkRootGate reads the repo gate rather than trusting a copy (#394)', () => {
  const pkg = (gate: string): string => JSON.stringify({ scripts: { 'quality-gate': gate } })

  it('passes on a check-mode gate', () => {
    expect(checkRootGate(pkg('turbo ts:check test lint && pnpm format:check')).ok).toBe(true)
  })

  it('fails and NAMES every offender', () => {
    const r = checkRootGate(pkg('turbo prettier:fix mdlint:fix'))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier:fix')
    expect(r.message).toContain('mdlint:fix')
    expect(r.message).toContain('pnpm format')
  })

  it('fails loudly when there is no gate at all, rather than passing vacuously', () => {
    expect(checkRootGate(JSON.stringify({ scripts: {} })).ok).toBe(false)
  })

  it('guards the ACTUAL root package.json of this repo', () => {
    // The point of the story: not that a string can be checked, but that THIS
    // repo's gate is check-mode. Reading the real file is what makes the
    // regression impossible to reintroduce silently.
    const root = join(__dirname, '../../../../package.json')
    const result = checkRootGate(readFileSync(root, 'utf-8'))
    expect(result.ok, result.message).toBe(true)
  })
})
