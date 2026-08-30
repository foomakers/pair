import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  findWriteModeFormatters,
  expandScriptReferences,
  referencesScript,
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
// than tooling behaviour. Three times in two days it polluted a PR here (#388,
// #408, #411 — see the ADL's Context).
describe('the pre-push gate never runs a write-mode step (#394)', () => {
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
    ).toEqual(['markdownlint-fix'])
  })

  // The offender list must be SYMMETRIC across the two tools: listing markdownlint's
  // shell entrypoint while omitting prettier's makes the prettier `.sh`/bin form an
  // equally plausible regression that walks straight past the guard.
  it("flags the prettier-fix shell entrypoint too, not only markdownlint's", () => {
    expect(findWriteModeFormatters('./tools/prettier-config/bin/prettier-fix.sh')).toEqual([
      'prettier-fix',
    ])
  })

  it('flags the bin aliases the tool packages declare (`turbo prettier-fix`)', () => {
    expect(findWriteModeFormatters('turbo prettier-fix')).toEqual(['prettier-fix'])
    expect(findWriteModeFormatters('turbo markdownlint-fix')).toEqual(['markdownlint-fix'])
  })

  it('flags the raw CLIs with their write flag, bypassing every alias', () => {
    expect(findWriteModeFormatters('prettier --write .')).toEqual(['prettier --write'])
    expect(findWriteModeFormatters("markdownlint --fix '**/*.md'")).toEqual(['markdownlint --fix'])
  })

  it('does not pair a check-mode invocation with a --write from another command', () => {
    // The write flag belongs to the second command; `prettier:check` is innocent.
    expect(findWriteModeFormatters('turbo prettier:check && other-tool --write')).toEqual([])
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

  // eslint's autofix is not a formatter, but it WRITES: `lint:fix` resolves to
  // `eslint . --fix`, which modifies files the branch never touched — AC1 of #394
  // ("pushing a branch never modifies a file the branch did not change"), one word
  // away from the gate. Nothing runs it today; the guard covers it anyway.
  it('flags lint:fix — eslint autofix writes files just like a formatter', () => {
    expect(findWriteModeFormatters('turbo lint:fix')).toEqual(['lint:fix'])
  })

  it('flags the lint-fix shell entrypoint and the raw `eslint --fix`', () => {
    expect(findWriteModeFormatters('./tools/eslint-config/bin/lint-fix.sh')).toEqual(['lint-fix'])
    expect(findWriteModeFormatters('eslint . --config eslint.config.cjs --fix')).toEqual([
      'eslint --fix',
    ])
  })

  it('leaves check-mode eslint alone (a --fix belonging to another command)', () => {
    expect(findWriteModeFormatters('eslint . && other-tool --fix')).toEqual([])
  })

  // The invariant is "no step reachable from the gate WRITES", and formatters are not
  // the only writers this repo already has. `pnpm sync-version` → sync-version-in-docs.ts
  // writeFileSync's every .md/.mdx it walks, i.e. it rewrites version strings in docs the
  // branch never touched — AC1's exact failure mode, from a real, currently-defined root
  // script whose only job is to write.
  it('flags sync-version — it rewrites version strings in every doc it walks', () => {
    expect(findWriteModeFormatters('turbo lint && pnpm sync-version 0.4.2')).toEqual([
      'sync-version',
    ])
  })

  it('flags the sync-version module path too (same entry, `-` is a word boundary)', () => {
    expect(
      findWriteModeFormatters('ts-node src/quality-gates/sync-version-in-docs.ts 0.4.2'),
    ).toEqual(['sync-version'])
  })

  // sync-version has a legitimate dry-run (`--check`, exit 1 on drift) that a gate could
  // reasonably run. Sparing it keeps the guard from banning the one non-writing form —
  // bounded to the same command segment, so a `--check` next door does not launder a write.
  it('spares `sync-version --check` (dry-run) but not a --check in the next command', () => {
    expect(findWriteModeFormatters('pnpm sync-version 0.4.2 --check')).toEqual([])
    expect(findWriteModeFormatters('pnpm sync-version 0.4.2 && other-tool --check')).toEqual([
      'sync-version',
    ])
  })

  // `pnpm test:perf` → benchmark-update-link.ts writes a scratch KB tree and
  // reports/performance/benchmark-report.json. No check mode exists: banned outright.
  it('flags test:perf and the benchmark module it runs (no dry-run exists)', () => {
    expect(findWriteModeFormatters('pnpm test:perf')).toEqual(['test:perf'])
    expect(findWriteModeFormatters('ts-node src/quality-gates/benchmark-update-link.ts')).toEqual([
      'benchmark-update-link',
    ])
  })

  it('names the remedy, so a failure is actionable', () => {
    expect(PRE_PUSH_REMEDY).toContain(`pnpm ${REMEDY_SCRIPT}`)
  })

  // The remedy is two-step or it is a trap: `pnpm format` fixes the dataset SKILL.md and
  // cannot reach its generated .claude twin (not a workspace member), while skill-md-mirror
  // asserts byte equality — so format:check-green becomes skills:conformance-red later in
  // the SAME gate. Reproduced on the real MD049 drift this branch cleared.
  it('the remedy warns that a dataset .skills edit needs the .claude mirror re-synced', () => {
    expect(PRE_PUSH_REMEDY).toContain('packages/knowledge-hub/dataset/.skills/**')
    expect(PRE_PUSH_REMEDY).toContain('.claude/skills/**')
    expect(PRE_PUSH_REMEDY).toContain('skills:conformance')
  })

  // The third of the three places ADL 2026-07-31-pre-push-gate-is-check-only requires to
  // agree (DEVELOPMENT.md, development-setup.mdx, this string). It is the PRINTED one, so
  // it is also the only one a developer copy-pastes: `pair` is a binary no install creates
  // (ADL 2026-08-25), and the other two were renamed to `pair-cli` while this drifted.
  it('the remedy names the published binary, so the copy-pasted step exists', () => {
    expect(PRE_PUSH_REMEDY).toContain('pair-cli update')
    // Lookbehind, not `[^-]`: a preceding-character class cannot see offset 0, so a future
    // reorder that OPENS the string with `pair update …` would slip past the pin while
    // `toContain('pair-cli update')` still passed on a later sentence.
    expect(PRE_PUSH_REMEDY).not.toMatch(/(?<!-)\bpair update/)
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

  // A single token between the runner and the script name used to defeat the whole
  // expansion: the captured "name" became the flag, the lookup missed, and the
  // referenced body was never scanned — `pnpm -s format` in the gate passed green.
  it.each(['pnpm -s format', 'pnpm -w format', 'pnpm --silent format', 'pnpm -r run format'])(
    'inlines a reference carrying runner flags: %s',
    command => {
      const expanded = expandScriptReferences({ format: 'turbo prettier:fix' }, command)
      expect(findWriteModeFormatters(expanded)).toEqual(['prettier:fix'])
    },
  )

  // The repo standardizes on pnpm, but nothing stops an edit from spelling the
  // delegation with npm/yarn, and the offending write would run all the same.
  it.each(['npm run format', 'yarn format', 'yarn run format'])(
    'inlines the npm/yarn spellings too: %s',
    command => {
      const expanded = expandScriptReferences({ format: 'turbo prettier:fix' }, command)
      expect(findWriteModeFormatters(expanded)).toEqual(['prettier:fix'])
    },
  )

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

// The guard-present check must require the gate to RUN the guard. Substring
// matching accepts anything that merely NAMES it — `echo gate:composition`, or a
// comment — which is a green guard doing nothing.
describe('referencesScript distinguishes running a script from naming it (#394)', () => {
  it('accepts a real invocation, with or without flags/`run`', () => {
    expect(referencesScript(`pnpm ${GUARD_SCRIPT}`, GUARD_SCRIPT)).toBe(true)
    expect(referencesScript(`pnpm run ${GUARD_SCRIPT}`, GUARD_SCRIPT)).toBe(true)
    expect(referencesScript(`pnpm -s ${GUARD_SCRIPT}`, GUARD_SCRIPT)).toBe(true)
  })

  it('rejects a mention that runs nothing', () => {
    expect(referencesScript(`echo ${GUARD_SCRIPT}`, GUARD_SCRIPT)).toBe(false)
    expect(referencesScript(`# keep ${GUARD_SCRIPT} in the gate`, GUARD_SCRIPT)).toBe(false)
  })
})

describe('checkRootGate reads the repo gate rather than trusting a copy (#394)', () => {
  /** A root package.json shaped like this repo's, with overridable scripts. */
  const pkg = (scripts: Record<string, string>): string =>
    JSON.stringify({
      scripts: {
        'quality-gate': `turbo ts:check test lint && pnpm format:check && pnpm ${GUARD_SCRIPT} && pnpm dup:check`,
        // Mirrors the shipped body: both checkers always run, the worse status wins.
        'format:check': 'pnpm prettier:check; _p=$?; pnpm mdlint:check; _m=$?; exit $((_p || _m))',
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

  // Pattern level is not enough: checkRootGate EXPANDS a referenced root script by
  // inlining `{ body }` right after the match, so the `--check` sparing has to survive
  // the braces AND the second bare `sync-version` the body brings with it. Asserted at
  // integration level because the form a real gate would use — `pnpm sync-version
  // --check` delegating to a root script — is exactly the one the lookahead broke on.
  it('spares a delegated `sync-version --check` through script expansion', () => {
    const r = checkRootGate(
      pkg({
        'quality-gate': `turbo ts:check test lint && pnpm sync-version --check && pnpm ${GUARD_SCRIPT}`,
        'sync-version': 'pnpm --filter @pair/dev-tools sync-version',
      }),
    )
    expect(r.ok, r.message).toBe(true)
  })

  it('still flags a delegated `sync-version` with no --check', () => {
    const r = checkRootGate(
      pkg({
        'quality-gate': `turbo ts:check test lint && pnpm sync-version && pnpm ${GUARD_SCRIPT}`,
        'sync-version': 'pnpm --filter @pair/dev-tools sync-version',
      }),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('sync-version')
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

  it.each([
    ['a flagged reference', 'turbo lint && pnpm -s format'],
    ['the npm spelling', 'turbo lint && npm run format'],
  ])('fails when the gate reaches the formatter through %s', (_label, gate) => {
    const r = checkRootGate(pkg({ 'quality-gate': `${gate} && pnpm ${GUARD_SCRIPT}` }))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier:fix')
  })

  // The review's own reproduction: `&& pnpm lint:fix` appended to the real gate used
  // to return ok=true, while `lint:fix` → `eslint . --fix` rewrites files the branch
  // never touched — the AC1 failure mode, back through a one-word edit.
  it('fails when the gate appends `pnpm lint:fix` (eslint autofix writes too)', () => {
    const r = checkRootGate(
      pkg({
        'quality-gate': `turbo ts:check test lint && pnpm format:check && pnpm ${GUARD_SCRIPT} && pnpm lint:fix`,
        'lint:fix': 'turbo lint:fix',
      }),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('lint:fix')
  })

  // Same shape as the lint:fix reproduction, on a stronger case: sync-version is a real
  // root script that exists only to write. Appending it to the gate used to report ok=true.
  it('fails when the gate appends `pnpm sync-version` (rewrites untouched docs)', () => {
    const r = checkRootGate(
      pkg({
        'quality-gate': `turbo ts:check test lint && pnpm format:check && pnpm ${GUARD_SCRIPT} && pnpm sync-version 0.4.2`,
        'sync-version': 'pnpm --filter @pair/dev-tools sync-version',
      }),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('sync-version')
  })

  it('fails when the gate appends `pnpm test:perf` (writes a scratch tree + a report)', () => {
    const r = checkRootGate(
      pkg({
        'quality-gate': `turbo lint && pnpm format:check && pnpm ${GUARD_SCRIPT} && pnpm test:perf`,
        'test:perf': 'pnpm --filter @pair/dev-tools benchmark-update-link',
      }),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('test:perf')
  })

  it('fails when a gate script calls the prettier bin wrapper directly', () => {
    const r = checkRootGate(pkg({ 'format:check': './tools/prettier-config/bin/prettier-fix.sh' }))
    expect(r.ok).toBe(false)
    expect(r.message).toContain('prettier-fix')
  })

  it('fails when the gate drops the guard itself', () => {
    const r = checkRootGate(
      pkg({ 'quality-gate': 'turbo ts:check test lint && pnpm format:check && pnpm dup:check' }),
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain(GUARD_SCRIPT)
  })

  it('fails when the gate only MENTIONS the guard instead of running it', () => {
    const r = checkRootGate(
      pkg({ 'quality-gate': `turbo lint && pnpm format:check && echo ${GUARD_SCRIPT}` }),
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

// `-w` is prettier's documented short form of `--write` (`prettier --help`, 3.6.2: "-w,
// --write  Edit files in-place"); measured, `prettier -w x.ts` rewrites the file. The list
// had the long spelling only (#413 round 13).
describe('prettier `-w` is the write flag (#413)', () => {
  it('flags `prettier -w`', () => {
    expect(findWriteModeFormatters('prettier -w .')).toEqual(['prettier --write'])
    expect(findWriteModeFormatters('npx prettier -w src')).toEqual(['prettier --write'])
    expect(findWriteModeFormatters('pnpm exec prettier --config x -w "**/*.ts"')).toEqual([
      'prettier --write',
    ])
  })

  it('does not pair a `-w` from another command with a check-mode prettier', () => {
    expect(findWriteModeFormatters('other-tool -w && prettier --check .')).toEqual([])
    expect(findWriteModeFormatters('prettier --check . ; sleep -w')).toEqual([])
  })

  it('does not read `--write`-like or `-w`-prefixed words as the flag', () => {
    expect(findWriteModeFormatters('prettier --log-level warn --check .')).toEqual([])
    expect(findWriteModeFormatters('prettier -write .')).toEqual([])
  })
})
