import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'

// Conformance home for dataset/.skills/capability/verify-quality/SKILL.md.
//
// One file per TARGET artifact, not per introducing story (ADL 2026-07-18); each
// story extends this file with its own `describe`. Caller-side assertions about a
// skill that COMPOSES verify-quality live here too, next to the contract they
// depend on — the corpus precedent is classify.test.ts / assess-security.test.ts,
// which hold their own "/review composes X" describes rather than a second file.
//
// Story #259 — verify-quality integrated with the tier gate matrix (local = CI).
// The skill must resolve the item/PR classification tags and run locally exactly
// the checks the CI gate would run for that tier — reading TAGS + the KB gate
// matrix only (D18), never classifying itself. These are content invariants on
// the source-of-record SKILL.md (dataset), asserted the same way the rest of the
// KB/skill corpus is tested (see quality-model.test.ts). The parity claim is
// verified transitively, in two layers, by scripts/smoke-tests/scenarios/tier-aware-gate.sh
// per the gate-tooling ADL (scripts are smoke-tested, not vitest-unit-tested):
// (a) the smoke test asserts this SKILL.md *references* the shared tier-resolve.sh
//     helper (resolve_tier / required_suites_for_tier / require_suite) — i.e. it
//     composes the same resolver CI uses rather than re-implementing a matrix; and
// (b) that helper's own tier/suite resolution is behaviorally *executed* there (the
//     pre-existing #258 block). The skill is prose, so its resolution is not itself
//     executed here — parity rests on it composing the behaviorally-tested helper.

const SKILL_PATH = join(__dirname, '../../dataset/.skills/capability/verify-quality/SKILL.md')
const SKILL = readFileSync(SKILL_PATH, 'utf-8')

const RESOLVER = readFileSync(
  join(__dirname, '../../dataset/.pair/knowledge/assets/tier-resolve.sh'),
  'utf-8',
)

describe('verify-quality SKILL.md — tier gate matrix integration (#259)', () => {
  it('frames itself as mirroring the CI gate for the resolved tier (local = CI)', () => {
    expect(SKILL).toMatch(/gate matrix/i)
    expect(SKILL).toMatch(/local[^\n]*\bCI\b|mirror[^\n]*\bCI\b|\bCI\b[^\n]*parity/i)
  })

  it('AC1 — 🟢 green runs base only (install + lint + type + build), same set CI would run', () => {
    expect(SKILL).toMatch(/risk:green/)
    // base spelled out as the green check set
    expect(SKILL).toMatch(/install[^\n]*lint[^\n]*type[^\n]*build/i)
  })

  it('AC2 — the check set widens per tier: +unit from 🟡, +integration/E2E on 🔴', () => {
    expect(SKILL).toMatch(/risk:yellow/)
    expect(SKILL).toMatch(/risk:red/)
    expect(SKILL).toMatch(/\bunit\b/)
    expect(SKILL).toMatch(/integration/i)
    expect(SKILL).toMatch(/e2e/i)
  })

  it('AC3 — fail-safe: no resolvable tags ⇒ full 🔴 set, stated explicitly in the report', () => {
    expect(SKILL).toMatch(/fail-safe/i)
    expect(SKILL).toMatch(/red/i)
    // explicit report line, not a silent widening
    expect(SKILL).toMatch(/no[^\n]*tag[\s\S]{0,120}(red|full)/i)
  })

  it('AC4 — any failing check ⇒ red verdict with the failing command output surfaced', () => {
    expect(SKILL).toMatch(/failing command output|surface[^\n]*output|command output/i)
    // Pin the behavioral linkage (failing check ⇒ red verdict ⇒ output surfaced):
    // the red-verdict wording must co-occur with the failing-output phrase, so a
    // future edit can't drop the "red verdict" half and still pass.
    expect(SKILL).toMatch(
      /red verdict[\s\S]{0,120}(failing command output|command output)|(failing command output|command output)[\s\S]{0,120}red verdict/i,
    )
  })

  it('reads the risk:* tag from the PR, and pre-publish from the story card (never classifies)', () => {
    expect(SKILL).toMatch(/gh pr view/)
    expect(SKILL).toMatch(/story card|from the story/i)
  })

  it('contains NO classification criteria — reads tags + the KB matrix only (D18)', () => {
    expect(SKILL).toMatch(/no classification criteria|contains no[^\n]*criteria/i)
    expect(SKILL).toMatch(/D18/)
  })

  it('delegates tier + suite resolution to the shipped tier-resolve.sh helper (single source, not re-implemented)', () => {
    expect(SKILL).toContain('tier-resolve.sh')
    expect(SKILL).toContain('resolve_tier')
    expect(SKILL).toContain('required_suites_for_tier')
    expect(SKILL).toContain('require_suite')
  })

  it('preserves the opt-in tiering flag: tiering disabled ⇒ full suite (CI parity, current behavior)', () => {
    expect(SKILL).toContain('Pre-merge tiering')
    expect(SKILL).toMatch(/disabled[\s\S]{0,160}full suite|full suite[\s\S]{0,160}disabled/i)
  })

  it('a suite required by the tier but absent locally ⇒ explicit "suite missing — CI will fail", never a silent pass', () => {
    expect(SKILL).toMatch(/suite missing|missing suite/i)
    expect(SKILL).toMatch(/CI will fail/i)
    expect(SKILL).toMatch(/not[^\n]*silent|never[^\n]*silent/i)
  })

  it('matrix/KB not found ⇒ falls back to all adopted gates with a notice', () => {
    expect(SKILL).toMatch(/fall[- ]?back[\s\S]{0,160}(all[^\n]*gates|adopted gates)/i)
    expect(SKILL).toMatch(/notice/i)
  })

  it('preserves idempotency (already-passing gates skipped) and adoption command overrides', () => {
    expect(SKILL).toMatch(/already[- ]passing|not already passing|skip/i)
    expect(SKILL).toMatch(/way-of-working/)
  })

  it('links to the matrix single source (quality-model §4) and the delivery wiring (tier-aware-pipeline)', () => {
    const dir = dirname(SKILL_PATH)
    const targets = ['quality-model.md', 'tier-aware-pipeline.md', 'tier-resolve.sh']
    for (const t of targets) {
      const m = SKILL.match(new RegExp(`\\]\\(([^)]*${t.replace('.', '\\.')})\\)`))
      expect(m, `SKILL.md must link to ${t}`).not.toBeNull()
      const linkPath = (m as RegExpMatchArray)[1] as string
      expect(
        existsSync(resolve(dir, linkPath.split('#')[0] as string)),
        `link to ${t} must resolve`,
      ).toBe(true)
    }
  })
})

describe('verify-quality — matrix parity with tier-resolve.sh (the executable source)', () => {
  // The skill must not restate an independent matrix. The per-tier suite keys the
  // helper exposes are the single source; the skill documents the increments and
  // defers the mapping to required_suites_for_tier. Parity guard: the suite keys
  // named in the helper are exactly the ones the skill's tier prose references.
  const helperKeys = ['install', 'lint', 'type', 'build', 'unit', 'integration', 'e2e']

  it('the helper exposes the four required-suite entry points the skill composes', () => {
    for (const fn of ['resolve_tier', 'required_suites_for_tier', 'require_suite']) {
      expect(RESOLVER).toContain(fn)
    }
  })

  it('every suite key in the helper matrix is referenced by the skill (no drift)', () => {
    for (const key of helperKeys) {
      expect(SKILL.toLowerCase()).toContain(key)
    }
  })
})

// --- Story #382 — /review tells verify-quality WHICH PR to resolve the tier from. ---
//
// The forwarded thing is a PR IDENTIFIER, never a tier value: the code host's PR
// labels stay the single source of truth (the same source CI gates on), so no
// second source and no widen-only guard of its own is needed. Reusing `$story`
// was the cheap option and is forbidden — the story card carries the REFINEMENT
// tier, and review confirms-or-raises (D17), so a review-raised PR would run a
// NARROWER set than CI: an under-check.
//
// The caller-side block below reads process/review/SKILL.md because the invariant
// IS the composition contract of this skill (see the file header).

const REVIEW = readFileSync(
  join(__dirname, '../../dataset/.skills/process/review/SKILL.md'),
  'utf-8',
)

/** The body of a `## `/`### ` section, up to the next heading of the same level. */
const section = (doc: string, heading: string): string => {
  const start = doc.indexOf(heading)
  expect(start, `section not found: ${heading}`).toBeGreaterThan(-1)
  const level = (heading.match(/^#+/) as RegExpMatchArray)[0]
  const rest = doc.slice(start + heading.length)
  const next = rest.search(new RegExp(`^${level} `, 'm'))
  return next === -1 ? rest : rest.slice(0, next)
}

/** Step 1.5's body — where every tier/tree resolution rule lives. */
const step15 = section(SKILL, '### Step 1.5: Resolve the Tier Gate Matrix (CI parity)')

/** Every `REASON="…"` the resolution snippet assigns, in source order. */
const reasons = [...step15.matchAll(/REASON="([^"]+)"/g)].map(m => m[1])

/**
 * Step 1.5's EXECUTABLE lines only — shell inside its fenced blocks, with `#`
 * comment lines and the surrounding prose dropped. Assertions about what the
 * snippet *decides on* run against this, so a comment that quotes a banned test
 * to explain why it is banned does not read as the test itself.
 */
const step15Code = [...step15.matchAll(/```bash\n([\s\S]*?)```/g)]
  .map(m => m[1] as string)
  .join('\n')
  .split('\n')
  .filter(l => !/^\s*#/.test(l))
  .join('\n')

describe('verify-quality — optional $pr argument: which PR the tier is read from (#382)', () => {
  it('the Arguments table documents `$pr` as optional', () => {
    const args = section(SKILL, '## Arguments')
    expect(args).toMatch(/\|\s*`\$pr`\s*\|\s*No\s*\|/)
  })

  it('AC2 — `$pr` names WHICH PR; the tier is read from that PR labels, never carried as a value', () => {
    expect(SKILL).toMatch(/read, never carried|never a tier value|not a tier value/i)
    expect(SKILL).toMatch(/`\$pr`[\s\S]{0,400}labels/)
  })

  it('states the resolution precedence explicitly: `$pr` → current-branch PR → `$story` → fail-safe', () => {
    expect(SKILL).toMatch(
      /`\$pr`[^\n]*→[^\n]*current-branch PR[^\n]*→[^\n]*`\$story`[^\n]*→[^\n]*fail-safe/i,
    )
  })

  it('AC3 — the standalone on-branch and pre-publish paths are unchanged (no-arg PR read, then the story card)', () => {
    expect(SKILL).toContain('gh pr view --json labels')
    expect(SKILL).toContain('gh issue view')
    expect(SKILL).toMatch(/no `\$pr`|without `\$pr`|`\$pr` (is )?(absent|omitted)/i)
  })

  it('AC4 — a passed PR with no resolvable tag ⇒ fail-safe 🔴, reason distinguishing "reachable, no tag" from "unreadable"', () => {
    expect(SKILL).toMatch(/PR[^\n]*reachable[^\n]*no risk:\*/i)
    expect(SKILL).toMatch(/PR[^\n]*unreadable/i)
    expect(SKILL).toMatch(/fail-safe/)
  })

  it('AC4 — "no tag" is decided by TAG PRESENCE: label EMPTINESS decides nothing, on any branch', () => {
    // Property, not spelling: emptiness of `$LABELS` must not be a decision anywhere in
    // Step 1.5. An `[ -z "$LABELS" ]` / `[ -n "$LABELS" ]` test conflates three states —
    // no PR, a PR with zero labels, and a failed read — so the common shape (pr-state:*/
    // cost:*/type labels and no risk:*) would emit the generic fail-safe line the skill
    // forbids, and a zero-label PR would fall through to the story card's refinement tier.
    expect(step15Code).not.toMatch(/\[\s*-[zn]\s*"\$LABELS"\s*\]/)
    // Secondary guard on today's spelling of the replacement.
    expect(step15).toMatch(/grep -q '\^risk:'/)
    expect(step15).toMatch(/has_risk_tag/)
    // One spelling of the rule on every branch that reads labels: each `LABELS=` read is
    // followed by at least one `has_risk_tag` test rather than an emptiness test.
    const labelReads = (step15Code.match(/LABELS="\$\(/g) ?? []).length
    const tagTests = (step15Code.match(/has_risk_tag "\$LABELS"/g) ?? []).length
    expect(labelReads).toBeGreaterThanOrEqual(2)
    expect(tagTests).toBeGreaterThanOrEqual(labelReads)
  })

  it('every variable the snippet READS is initialized in the step before first use', () => {
    // The fail-safe design only holds if nothing can be read stale. This skill is
    // idempotent by contract, so it is re-invoked in shells where a previous run's
    // variables survive: an arm that falls through to `resolve_tier "$LABELS"` without
    // assigning `LABELS` would resolve the PREVIOUS run's tier — a silent NARROW on
    // exactly the paths whose purpose is to fail safe (D17 forbids the direction).
    const lines = step15Code.split('\n')
    const assignedAt = new Map<string, number>()
    lines.forEach((l, i) => {
      for (const m of l.matchAll(/(?:^|[\s;(])([A-Z][A-Z0-9_]*)=/g)) {
        const name = m[1] as string
        if (!assignedAt.has(name)) assignedAt.set(name, i)
      }
    })
    const readBeforeAssigned: string[] = []
    lines.forEach((l, i) => {
      for (const m of l.matchAll(/\$\{?([A-Z][A-Z0-9_]*)\}?/g)) {
        const name = m[1] as string
        const at = assignedAt.get(name)
        if (at === undefined || at > i) readBeforeAssigned.push(`${name} (line ${i + 1})`)
      }
    })
    expect(
      readBeforeAssigned,
      `read before assignment in Step 1.5: ${readBeforeAssigned.join(', ')}`,
    ).toEqual([])
    // Pin the one the fall-through arms depend on, by spelling too.
    expect(step15Code).toMatch(/^\s*LABELS=""/m)
  })

  it('AC4 — every resolution branch sets a DISTINCT reason; the generic line stays for the sourceless case', () => {
    // The invariant the Fail-safe bullet states: six reachable failure states, six
    // different messages. Uniqueness is asserted on the values, not on their wording, so
    // a rephrase stays green while a copy-pasted duplicate (two states, one message) fails.
    expect(reasons.length).toBeGreaterThanOrEqual(6)
    expect(new Set(reasons).size, `duplicate REASON strings: ${reasons.join(' | ')}`).toBe(
      reasons.length,
    )
    // and each of the three sources appears in both of its two states (reachable / unreadable)
    for (const source of [/^PR #\$PR_NUM/, /current-branch PR/, /story card/]) {
      expect(reasons.filter(r => source.test(r)).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('AC4 — an unreadable current-branch PR fails safe with its own reason, it never degrades to the story card', () => {
    // `gh pr view` exits non-zero for BOTH "no PR on this branch" and "host unreachable",
    // so the exit status alone cannot decide: only the no-PR message may fall through to
    // `$story` (the refinement tier — an under-check anywhere else, D17).
    expect(step15).toMatch(/no pull requests found/i)
    expect(reasons).toContain('current-branch PR unreadable — the code host is not reachable')
    // the no-PR message is the ONLY thing that raises the pre-publish flag …
    const noPrFlagLines = step15Code.split('\n').filter(l => /NO_PR_ON_BRANCH=1/.test(l))
    expect(noPrFlagLines.length).toBe(1)
    expect(step15Code).toMatch(
      /no pull requests found'?\s*"\$PR_ERR"[\s\S]{0,200}NO_PR_ON_BRANCH=1/,
    )
    // … and the story-card read is nested under that flag, not under a bare failure arm
    expect(step15Code).toMatch(/NO_PR_ON_BRANCH" = "1"[\s\S]{0,400}gh issue view/)
  })

  it('a passed `$pr` never falls back to the story card — the refinement tier would be an under-check (D17)', () => {
    expect(SKILL).toMatch(/`\$pr`[\s\S]{0,300}(never|not|NO)[\s\S]{0,80}story.card/i)
    expect(SKILL).toMatch(/under-check/i)
    expect(SKILL).toMatch(/D17/)
  })

  it('AC5 — the report states the tier SOURCE and the TREE the suites ran against, separately', () => {
    const out = section(SKILL, '## Output Format')
    expect(out).toMatch(/Tier source/i)
    expect(out).toMatch(/Tree/i)
    expect(SKILL).toMatch(
      /tier[^.\n]*exact[\s\S]{0,200}tree|tree[^\n]*(differs|not)[\s\S]{0,200}(branch|PR)/i,
    )
  })

  it('AC5 — the `Tree:` row is PRODUCED by Step 1.5, and the match test is a COMMIT compare in every case', () => {
    // Without this the ⚠️ arm is not deterministically reachable. Branch NAMES cannot be
    // the test: a checkout on the PR's own branch at a different commit (stale, or ahead
    // with unpushed work) is not the PR's head, and a detached review worktree at the head
    // is — a name compare gets both wrong, in opposite directions.
    expect(step15).toMatch(/headRefName/)
    expect(step15).toMatch(/headRefOid/)
    expect(step15).toMatch(/TREE_MATCH/)
    expect(step15).toMatch(/detached/i)
    // The PROPERTY, not one banned spelling: EVERY `TREE_MATCH=match` in the step —
    // the `$pr` arm and the current-branch arm alike — must sit on a line that compares
    // `git rev-parse HEAD` to a head sha read from the PR. A bare `TREE_MATCH=match`
    // promoted by BRANCH identity passes a spelling ban and still reports "matches PR
    // #N's head" for a locally-committed-unpushed or stale checkout of that branch.
    const lines = step15Code.split('\n')
    const compare = /\[ "\$\(git rev-parse HEAD\)" = "\$PR_HEAD_SHA" \]/
    const matchAt = lines.map((l, i) => (/TREE_MATCH=match\b/.test(l) ? i : -1)).filter(i => i >= 0)
    expect(matchAt.length).toBeGreaterThan(0)
    for (const i of matchAt) {
      const window = lines.slice(Math.max(0, i - 2), i + 1).join('\n')
      expect(
        window,
        `every TREE_MATCH=match must be guarded by the commit compare, got: ${lines[i]?.trim()}`,
      ).toMatch(compare)
    }
    // and no branch-name equality decides anything, on either arm
    expect(step15Code).not.toMatch(/\[ "\$LOCAL_REF" = "\$[A-Z_]*HEAD_REF" \]/)
    // ONE name for the PR head sha across the whole step: the rendering spec interpolates
    // `PR_HEAD_SHA`, so a second spelling on one arm renders an EMPTY sha in that arm's row.
    const shaNames = new Set(
      [...step15Code.matchAll(/\b([A-Z][A-Z0-9_]*HEAD_SHA)\b/g)].map(m => m[1]),
    )
    expect(shaNames, `one head-sha variable only, got: ${[...shaNames].join(', ')}`).toEqual(
      new Set(['PR_HEAD_SHA']),
    )
  })

  it('AC5 — "ahead of the PR head" is its OWN arm: the ⚠️ is reserved for stale/divergent trees', () => {
    // `/implement` composes verify-quality after every task and `/publish-pr` runs it as a
    // pre-flight — both on the story branch, BEFORE pushing. Once a PR exists, every such
    // run is tree-different by construction; rendering ⚠️ on that expected state trains
    // the reader to ignore the warning that means "the suites ran on OTHER code".
    const lines = step15Code.split('\n')
    const aheadAt = lines.map((l, i) => (/TREE_MATCH=ahead\b/.test(l) ? i : -1)).filter(i => i >= 0)
    expect(aheadAt.length).toBeGreaterThan(0)
    for (const i of aheadAt) {
      const window = lines.slice(Math.max(0, i - 2), i + 1).join('\n')
      expect(window, 'the ahead arm must be decided by ancestry, not by branch name').toMatch(
        /git merge-base --is-ancestor "\$PR_HEAD_SHA" HEAD/,
      )
    }
    // the ⚠️ belongs to `mismatch` only
    const out = section(SKILL, '## Output Format')
    const treeRow = (out.match(/^├── Tree:.*$/m) as RegExpMatchArray)[0]
    const arms = treeRow.split('|')
    const warned = arms.filter(a => a.includes('⚠️'))
    expect(warned.length).toBe(1)
    expect(warned[0]).toMatch(/NOT PR #N's head/)
    expect(arms.some(a => /ahead of PR #N's head/.test(a))).toBe(true)
  })

  it('AC5 — the current-branch arm reads the head sha too, and names the PR it reports on', () => {
    // The standalone pre-push flow: a dev on the PR's own branch with unpushed commits is
    // the CANONICAL pre-push state and is NOT the PR's head. That arm therefore needs
    // `headRefOid` (to compare) and `number` (to render "PR #N") — a `--json labels` read
    // can supply neither, so the arm could not even name the PR it claimed to match.
    const branchRead = step15Code.match(/gh pr view --json [^\s]+/)
    expect(branchRead, 'the current-branch read must be present').not.toBeNull()
    expect((branchRead as RegExpMatchArray)[0]).toMatch(/headRefOid/)
    expect((branchRead as RegExpMatchArray)[0]).toMatch(/number/)
  })

  it('`LOCAL_REF` is resolved for EVERY arm — the `none` and branch arms render it too', () => {
    // Assigned inside `if [ -n "$pr" ]` it is empty on exactly the arms that interpolate
    // it: the `none` row (fires when `$pr` was NOT supplied) and the branch-promoted row.
    const localAt = step15Code.indexOf('LOCAL_REF=')
    const prGuardAt = step15Code.indexOf('if [ -n "$pr" ]')
    expect(localAt).toBeGreaterThan(-1)
    expect(prGuardAt).toBeGreaterThan(-1)
    expect(localAt, 'LOCAL_REF must be hoisted above the `$pr` guard').toBeLessThan(prGuardAt)
    // …and it must name a COMMIT when detached: `git rev-parse --abbrev-ref HEAD` yields the
    // literal string "HEAD" there, while both renderings promise a commit — and a detached
    // checkout is the canonical independent-review/CI shape this contract targets.
    expect(step15Code).toMatch(/\[ "\$LOCAL_REF" = HEAD \][\s\S]{0,120}git rev-parse --short HEAD/)
  })

  it('the PR-read temp file is released even if a later arm exits early', () => {
    expect(step15Code).toMatch(/trap 'rm -f "\$PR_ERR"'/)
  })

  it('a `$pr` given as a URL is normalized to a bare number before it is rendered', () => {
    // The Arguments table accepts "number or URL", but every rendering assumes a number:
    // the REASON strings say "PR #123 …" and the Output Format row is "PR #N".
    expect(step15Code).toMatch(/PR_NUM=/)
    // The number comes from the `pull/<n>` PATH SEGMENT, never from the string TAIL: a
    // tail match yields nothing for `…/pull/420/files` (⇒ the reason renders the whole
    // URL) and yields the WRONG number for `…/pull/420#issuecomment-98765`.
    expect(step15Code).toMatch(/pull\|pull-requests\|merge_requests/)
    expect(step15Code).not.toMatch(/grep -oE '\[0-9\]\+\$'/)
    // a bare number still passes through, anchored at BOTH ends
    expect(step15Code).toMatch(/grep -oE '\^\[0-9\]\+\$'/)
    // and the Arguments table says which forms are recognized
    const args = section(SKILL, '## Arguments')
    expect(args).toMatch(/pull\/<n>|`pull\/`/)
    const reasonStrings = [...step15Code.matchAll(/REASON="([^"]*)"/g)].map(m => m[1] as string)
    const prReasons = reasonStrings.filter(r => /\bPR\b/.test(r) && /\$/.test(r))
    expect(prReasons.length).toBeGreaterThan(0)
    for (const r of prReasons) {
      expect(r, `PR reasons must render a normalized #number, got: ${r}`).toMatch(/#\$PR_NUM/)
    }
    expect(reasonStrings.join(' '), 'no raw `$pr` interpolation in a report string').not.toMatch(
      /(?<![A-Za-z_])\$pr(?![A-Za-z_])/,
    )
  })

  it('the PR read consumes the NORMALIZED identifier, not the raw `$pr`', () => {
    // `PR_NUM` is normalized structurally *because* tail parsing is wrong for
    // `…/pull/420/files` and `…/pull/420#issuecomment-98765`, and the Arguments table
    // promises both forms are accepted — but the read that must survive them passed the RAW
    // value, so a documented-as-accepted input fail-safes 🔴 with "unreadable — nonexistent
    // identifier, or the code host is not reachable": a parsing problem misreported as an
    // unreachable host, which the step's own Fail-safe bullet forbids. Normalization already
    // falls back to `$pr` verbatim when nothing is recognized, so `$PR_NUM` is never empty
    // when `$pr` was supplied.
    expect(step15Code).toMatch(/read_pr "\$PR_NUM"/)
    expect(step15Code, 'the read must not consume the un-normalized `$pr`').not.toMatch(
      /read_pr "\$pr"/,
    )
  })

  it('point 1 carries the code-host routing qualification, like every other host read in the step', () => {
    // GitHub-only field names (`headRefName`/`headRefOid`) with no substitution pointer
    // leave a non-GitHub host nothing to route against: the read fails and a perfectly
    // reachable PR renders `Tree: unknown` + a 🔴 fail-safe.
    const point1 = step15.slice(0, step15.search(/\*\*Check — is tiering on\?\*\*/))
    expect(point1).toMatch(/routing table/i)
    expect(point1).toMatch(/code host/i)
    expect(point1).toMatch(/headRefName/)
  })

  it('AC5 — the tree is resolved TIER-INDEPENDENTLY, before the `Pre-merge tiering` flag is read', () => {
    // `disabled` is the default, and it skips straight to Step 2 — so a tree resolution
    // living under the tiering-enabled arm would never run in the default configuration,
    // and /review's `Tree: ⚠️` advisory rule could never fire.
    const treeAt = step15.indexOf('TREE_MATCH')
    const flagStepAt = step15.search(/\*\*Check — is tiering on\?\*\*/)
    expect(treeAt).toBeGreaterThan(-1)
    expect(flagStepAt).toBeGreaterThan(-1)
    expect(
      treeAt,
      'TREE_MATCH must be resolved before the point that reads the tiering flag',
    ).toBeLessThan(flagStepAt)
    expect(step15).toMatch(/tier-independent/i)
    // …on BOTH resolution paths. The promotion of `none` for the CHECKED-OUT BRANCH's own
    // PR must be pre-flag too: left in the tiering-enabled point, the ⚠️ arm is unreachable
    // in the DEFAULT `disabled` configuration — where the row would be the only thing
    // saying which code the full suite ran on.
    const preFlag = step15Code.slice(0, step15Code.indexOf('source .pair/knowledge/assets'))
    expect(preFlag, 'the branch (no-`$pr`) PR read must sit before the flag').toContain(
      'gh pr view --json',
    )
    expect(preFlag).toContain('gh pr view "$1"')
  })

  it('AC5 — the PR is read in ONE round trip on either path, and an unreadable PR renders `unknown`', () => {
    // Two calls cost two round trips AND, on the unreadable path, return empty and drive a
    // "NOT PR #N's head" row that asserts a mismatch the snippet could not know. One read
    // point serves both paths (`$pr` and the checked-out branch's own PR).
    expect((step15Code.match(/read_pr /g) ?? []).length).toBe(1)
    expect((step15Code.match(/gh pr view/g) ?? []).length).toBe(2) // the two arms of read_pr
    expect(step15).toMatch(/--json labels,headRefName,headRefOid/)
    expect(step15).toMatch(/TREE_MATCH=unknown/)
  })

  it('AC5 — every resolved TREE_MATCH value has a rendering arm in the Output Format', () => {
    // No improvised rows: the values the snippet can assign and the arms the report
    // enumerates are the same set, so a pre-publish run never claims to match a PR that
    // does not exist and an unreadable PR never renders as a mismatch.
    const assigned = new Set([...step15Code.matchAll(/TREE_MATCH=(\w+)/g)].map(m => m[1]))
    expect(assigned).toEqual(new Set(['match', 'ahead', 'mismatch', 'unknown', 'none']))
    const out = section(SKILL, '## Output Format')
    const treeRow = (out.match(/^├── Tree:.*$/m) as RegExpMatchArray)[0]
    expect(treeRow).toMatch(/matches PR #N's head/)
    expect(treeRow).toMatch(/ahead of PR #N's head/)
    expect(treeRow).toMatch(/⚠️ NOT PR #N's head/)
    expect(treeRow).toMatch(/unknown — PR #N unreadable/)
    expect(treeRow).toMatch(/no PR on this branch/)
  })

  it('AC5 — the tier SOURCE is resolved by the snippet too, with one arm per resolved value', () => {
    // Same contract as `Tree:`, for the same reason: an improvised row has no arm for
    // "`$pr` supplied but unreadable" or "current-branch PR unreadable", and neither
    // `PR #N (named by $pr)` (claims a tier came from a PR that could not be read) nor
    // `fail-safe — no source resolved` (a source WAS named) is true there.
    const assigned = [...step15Code.matchAll(/TIER_SOURCE="([^"]+)"/g)].map(m => m[1] as string)
    expect(assigned.length).toBeGreaterThanOrEqual(6)
    expect(new Set(assigned).size, `duplicate TIER_SOURCE values: ${assigned.join(' | ')}`).toBe(
      assigned.length,
    )
    const out = section(SKILL, '## Output Format')
    const sourceRow = (out.match(/^├── Tier source:.*$/m) as RegExpMatchArray)[0].replace(/`/g, '')
    for (const value of assigned) {
      const rendered = value
        .replace(/\$PR_NUM/g, 'N')
        .replace(/\$story/g, 'ID')
        .replace(/\\\$/g, '$')
      expect(sourceRow, `Tier source: has no arm for ${value}`).toContain(rendered)
    }
    // and the modes that read no tag at all keep their arms
    expect(sourceRow).toMatch(/n\/a \(tiering disabled/)
    expect(sourceRow).toMatch(/fail-safe — no source resolved/)
  })

  it('AC5 — no `Tree:` arm can render an empty `PR_NUM` (`PR # unreadable`)', () => {
    // `unknown` is reachable on the no-`$pr` path — `PR_NUM` is initialized to "" and only
    // the `$pr` normalization block writes it, so a failed current-branch read whose stderr
    // is not "no pull requests found" (unauthenticated, offline, rate-limited, remote not on
    // the code host) renders `Tree: unknown — PR # unreadable`. Point 1 now makes that read
    // on EVERY run including the default `Pre-merge tiering: disabled`, so the malformed row
    // is the common case there. `TIER_SOURCE` already handles the same state with a
    // numberless arm (`current-branch PR unreadable`); the Tree row must too.
    const out = section(SKILL, '## Output Format')
    const treeRow = (out.match(/^├── Tree:.*$/m) as RegExpMatchArray)[0]
    const arms = (treeRow.match(/\[(.*)\]$/) as RegExpMatchArray)[1].split(' | ')
    const unknownArms = arms.filter(a => /^unknown/.test(a))
    expect(unknownArms.length, `the \`unknown\` value needs both spellings: ${treeRow}`).toBe(2)
    expect(
      unknownArms.some(a => /PR #N/.test(a)),
      'the numbered spelling (a `$pr` was normalized) must stay',
    ).toBe(true)
    expect(
      unknownArms.some(a => !/#/.test(a)),
      'the numberless spelling (no `$pr`, `PR_NUM` never assigned) is missing',
    ).toBe(true)
    // and the rendering paragraph must state the two-state rule, not just the Output Format
    expect(step15).toMatch(/`PR_NUM`[^.\n]{0,80}empty|empty[^.\n]{0,40}`PR_NUM`/)
  })

  it('AC5 — every arm of the `Tier source:` row is ASSIGNED, never improvised prose', () => {
    // The step's contract is that both rows are "resolved variables, not improvised prose",
    // and `TIER_SOURCE` is initialized to the fail-safe attribution precisely so no arm can
    // render stale. The tag-free modes (`tiering disabled` — the DEFAULT this repo runs —
    // and the matrix-not-found fallback) must therefore ASSIGN their value, not merely ask
    // for it in prose: otherwise an agent rendering the variable it was told to resolve
    // prints `fail-safe — no source resolved` on a run that never attempted a tier read.
    const render = (v: string) =>
      v
        .replace(/\$PR_NUM/g, 'N')
        .replace(/\$story/g, 'ID')
        .replace(/\\\$/g, '$')
    // read the WHOLE step (prose arms included), not just its fenced code
    const assigned = new Set(
      [...step15.matchAll(/TIER_SOURCE="([^"]+)"/g)].map(m => render(m[1] as string)),
    )
    expect(assigned).toContain('n/a (tiering disabled — no tag read)')
    expect(assigned).toContain('n/a (matrix fallback — no tag read)')
    const out = section(SKILL, '## Output Format')
    const sourceRow = (out.match(/^├── Tier source:.*$/m) as RegExpMatchArray)[0].replace(/`/g, '')
    const arms = new Set((sourceRow.match(/\[(.*)\]$/) as RegExpMatchArray)[1].split(' | '))
    // exact correspondence in BOTH directions: no unassigned arm, no unrendered assignment
    expect(arms, `Tier source: arms ≠ assigned TIER_SOURCE values`).toEqual(assigned)
  })

  it('AC5 — report rows are column-aligned: every value bracket sits at the same offset', () => {
    const out = section(SKILL, '## Output Format')
    const offsets = out
      .split('\n')
      .filter(l => /^[├└]── /.test(l))
      .map(l => l.indexOf('['))
    expect(offsets.length).toBeGreaterThan(5)
    expect(new Set(offsets).size, `misaligned report rows: ${offsets.join(',')}`).toBe(1)
  })

  it('AC6 — the argument is optional and additive: callers that omit it are unchanged', () => {
    expect(SKILL).toMatch(/optional[^\n]*additive|additive[^\n]*optional/i)
  })

  it('the stale boundary note is gone — no "PR number is never needed", no "belongs to /review"', () => {
    expect(SKILL).not.toMatch(/PR number is never needed/i)
    expect(SKILL).not.toMatch(/belongs to `?\/review`?/i)
    expect(SKILL).not.toMatch(/out of scope for this skill/i)
  })

  it('ships no story-local (ACn) markers — the corpus installs into downstream projects with no referent', () => {
    expect(SKILL).not.toMatch(/\(AC\d\)/)
  })
})

describe('review Step 2.1 — forwards the PR under review to verify-quality (#382)', () => {
  const step21 = section(REVIEW, '### Step 2.1: Quality Gates')

  it('AC1 — composes verify-quality with `$scope = all` AND the PR under review', () => {
    expect(step21).toMatch(/\$scope = all/)
    expect(step21).toMatch(/\$pr/)
  })

  it('forwards an identifier, not the tier it resolved in Phase 1 (no second source of truth)', () => {
    // Positive form first: `$pr` is named as WHICH PR, and the tier is read from labels.
    expect(step21).toMatch(/which PR/i)
    expect(step21).toMatch(/identifier/i)
    expect(step21).toMatch(/reads[^\n]*labels|labels[^\n]*read/i)
    // Negative, narrowed to the stale phrasing actually banned: an AFFIRMATIVE instruction
    // to hand the tier VALUE over. A correct sentence ("Forward the identifier, never the
    // resolved tier") must stay green, so a negated occurrence is not an offender.
    const handsOverTier =
      /\b(?:pass|passes|passing|forward|forwards|forwarding)\b[^.\n]{0,40}\btier\b/i
    const negated = /\b(?:never|not|no|rather than|instead of)\b/i
    const offenders = step21
      .split(/(?<=\.)\s+/)
      .filter(s => handsOverTier.test(s) && !negated.test(s))
    expect(
      offenders,
      `Step 2.1 must not instruct passing the tier value: ${offenders.join(' | ')}`,
    ).toEqual([])
  })

  it('a tree-mismatched local run is ADVISORY — CI on the PR head is authoritative for the state synthesis', () => {
    expect(step21).toMatch(/advisory/i)
    expect(step21).toMatch(/resolve_pr_state|5\.4/)
    expect(step21).toMatch(/head commit|PR head/i)
  })

  it('defines the arm where CI has published NO conclusion on the head commit (absence ≠ green)', () => {
    // The normal state for the first minutes after a push, and the PERMANENT state on a
    // host with no checks. Redirecting `<gates>` to "CI's check on the head commit"
    // without this arm leaves Step 5.4 with no gates value at all.
    expect(step21).toMatch(/no conclusion|not (yet )?published|no check|pending/i)
    expect(step21).toMatch(/to-be-reviewed/)
    expect(step21).toMatch(/never[^.\n]*ready-to-merge|ready-to-merge[^.\n]*never/i)
  })

  it('the authoritative-gates read is NAMED and code-host-routed, not left to improvisation', () => {
    // "Read the gates from CI's check on the head commit" with no command and no routing
    // pointer forces a guess (`gh pr checks`? the status API? which conclusions count?),
    // and leaves a non-GitHub host nothing to substitute — on the input that decides
    // `ready-to-merge`. Every other host read in this corpus carries the qualification.
    expect(step21).toMatch(/gh pr checks/)
    expect(step21).toMatch(/routing table|way-of-working-pm-resolution/i)
    expect(step21).toMatch(/success/)
    expect(step21).toMatch(/to-be-reviewed/)
    expect(step21).toMatch(/never[^.\n]*ready-to-merge|ready-to-merge[^.\n]*never/i)
  })

  it('disambiguates WHICH gate signal caps the verdict — the advisory run contributes findings only', () => {
    // Otherwise "with any gate red the review can never reach APPROVED" reads as a block
    // on evidence the same step just declared advisory (a red local run over other code).
    expect(step21).toMatch(/authoritative/i)
    expect(step21).toMatch(/findings only|only[^.\n]*findings/i)
  })

  it('the authoritative/advisory split keys on the RESOLVED `Tree:` value, never on the ⚠️ glyph', () => {
    // ⚠️ is rendered by `mismatch` ALONE (the `ahead` arm was split out deliberately: it is
    // the normal pre-push state and warning on it would train the reader to ignore the ⚠️).
    // A rule keyed on the glyph therefore reads `ahead` — the state the implement→review→fix
    // loop produces on EVERY locally committed, not-yet-pushed fix — as authoritative, and
    // feeds a local green over code the PR does not contain to the Step 5.4 synthesis:
    // `ready-to-merge` on gates CI never saw. `unknown` is the same hole with no glyph either.
    expect(step21, 'the rule must name the `match` arm as the authoritative one').toMatch(/`match`/)
    for (const arm of ['ahead', 'mismatch', 'unknown', 'none']) {
      expect(step21, `Step 2.1 must name \`${arm}\` as advisory`).toMatch(new RegExp(`\`${arm}\``))
    }
    // the banned round-3 spelling: the trigger stated as the glyph
    expect(step21, 'the advisory trigger must not be the ⚠️ glyph').not.toMatch(/`Tree: ⚠️`/)
    // …and the cap must key on the same resolved value, not on a second phrasing
    const cap = step21.slice(step21.indexOf('caps the verdict'))
    expect(cap, 'the verdict cap must key on the same `match` arm').toMatch(/`match`/)
  })

  it('the tag read is qualified by the Tag Projection declaration, not promised unconditionally', () => {
    expect(step21).toMatch(/Tag Projection/)
  })

  it('documents the post-2.1 raise: the set that ran stays Phase 1 tier, widen-only ⇒ re-run', () => {
    expect(step21).toMatch(/2\.4/)
    expect(step21).toMatch(/re-run/i)
    expect(step21).toMatch(/widen-only|never lower|D17/i)
  })

  it('the /review step numbers verify-quality cross-references still RESOLVE to headings', () => {
    // Precedent: code-host-routing.test.ts pins publish-pr's cross-reference to the
    // board-state step by its actual number. A renumber in review/SKILL.md must break the
    // suite here, not leave verify-quality asserting a step that no longer exists — the
    // silent-prose-drift class this story exists to remove.
    const referenced = [...SKILL.matchAll(/`?\/review`?[^.\n]{0,60}?Step (\d+\.\d+)/g)].map(
      m => m[1] as string,
    )
    // the Composition Interface note points at review's post-gate raise step by number too
    const alsoReferenced = [...SKILL.matchAll(/\(its Step (\d+\.\d+)\)/g)].map(m => m[1] as string)
    const all = [...new Set([...referenced, ...alsoReferenced])]
    expect(all, 'verify-quality must cross-reference /review by step number').toContain('2.1')
    for (const n of all) {
      expect(
        REVIEW,
        `verify-quality references /review Step ${n}, which has no heading in review/SKILL.md`,
      ).toMatch(new RegExp(`^### Step ${n.replace('.', '\\.')}:`, 'm'))
    }
  })
})
