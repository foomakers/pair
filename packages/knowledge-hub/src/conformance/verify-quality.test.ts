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
    // followed by a `has_risk_tag` test rather than an emptiness test.
    const labelReads = (step15Code.match(/LABELS="\$\(/g) ?? []).length
    const tagTests = (step15Code.match(/has_risk_tag "\$LABELS"/g) ?? []).length
    expect(labelReads).toBeGreaterThanOrEqual(3)
    expect(tagTests).toBeGreaterThanOrEqual(3)
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
    for (const source of [/PR \$pr/, /current-branch PR/, /story card/]) {
      expect(reasons.filter(r => source.test(r)).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('AC4 — an unreadable current-branch PR fails safe with its own reason, it never degrades to the story card', () => {
    // `gh pr view` exits non-zero for BOTH "no PR on this branch" and "host unreachable",
    // so the exit status alone cannot decide: only the no-PR message may fall through to
    // `$story` (the refinement tier — an under-check anywhere else, D17).
    expect(step15).toMatch(/no pull requests found/i)
    expect(reasons).toContain('current-branch PR unreadable — the code host is not reachable')
    // the story-card read is nested under the no-PR arm, not under a bare failure arm
    expect(step15).toMatch(/no pull requests found[\s\S]{0,600}gh issue view/)
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
    // the property: HEAD's commit is compared to the PR's head sha, and no branch-name
    // equality decides anything
    expect(step15).toMatch(/"\$\(git rev-parse HEAD\)" = "\$PR_HEAD_SHA"/)
    expect(step15).not.toMatch(/\[ "\$LOCAL_REF" = "\$PR_HEAD_REF" \]/)
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
  })

  it('AC5 — the PR is read in ONE round trip, and an unreadable PR renders `unknown`, never a mismatch', () => {
    // Three `gh pr view "$pr"` calls cost three round trips AND, on the unreadable path,
    // return empty and drive a "NOT PR #N's head" row that asserts a mismatch the snippet
    // could not know.
    expect((step15.match(/gh pr view "\$pr"/g) ?? []).length).toBe(1)
    expect(step15).toMatch(/--json labels,headRefName,headRefOid/)
    expect(step15).toMatch(/TREE_MATCH=unknown/)
  })

  it('AC5 — every resolved TREE_MATCH value has a rendering arm in the Output Format', () => {
    // No improvised rows: the values the snippet can assign and the arms the report
    // enumerates are the same set, so a pre-publish run never claims to match a PR that
    // does not exist and an unreadable PR never renders as a mismatch.
    const assigned = new Set([...step15.matchAll(/TREE_MATCH=(\w+)/g)].map(m => m[1]))
    expect(assigned).toEqual(new Set(['match', 'mismatch', 'unknown', 'none']))
    const out = section(SKILL, '## Output Format')
    const treeRow = (out.match(/^├── Tree:.*$/m) as RegExpMatchArray)[0]
    expect(treeRow).toMatch(/matches PR #N's head/)
    expect(treeRow).toMatch(/⚠️ NOT PR #N's head/)
    expect(treeRow).toMatch(/unknown — PR #N unreadable/)
    expect(treeRow).toMatch(/no PR named/)
    // and the tier-source row covers the modes that read no tag at all
    const sourceRow = (out.match(/^├── Tier source:.*$/m) as RegExpMatchArray)[0]
    expect(sourceRow).toMatch(/n\/a \(tiering disabled/)
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

  it('the tag read is qualified by the Tag Projection declaration, not promised unconditionally', () => {
    expect(step21).toMatch(/Tag Projection/)
  })

  it('documents the post-2.1 raise: the set that ran stays Phase 1 tier, widen-only ⇒ re-run', () => {
    expect(step21).toMatch(/2\.4/)
    expect(step21).toMatch(/re-run/i)
    expect(step21).toMatch(/widen-only|never lower|D17/i)
  })
})
