# Code Review Template

<!-- word-limits: Verdict=120; Assessments=450; Details=450 -->

> **Verdict-first (D22, R6.6).** This is the **native GitHub review body** submitted with the review action (Approve / Request Changes / Comment) — **not a separate PR comment** (decision Q5). An independent reviewer agent, or a self-authored PR where GitHub blocks self-approval, delivers this **same body** via a PR comment instead (`.claude/agents/pair-reviewer.md`, review Step 5.3); only the delivery event differs. The top (classification tags, tier, cost class, 1-line verdict) reads in **~30 seconds**; every assessment is a 1-line verdict with the breakdown collapsed in `<details>`, so the 30-second reading budget needs no `<details>` opened.
>
> **Not assessed is explicit.** When the backing capability is missing or failed (`/assess-security`, `/assess-cost`, `/assess-coupling`), the section verdict reads **not assessed** — never silently omitted.

## Verdict

`risk:<tier>` · `cost:<class>` — **[APPROVED | CHANGES-REQUESTED]** — [one-line reason]

<!-- No TECH-DEBT verdict. Minor findings block merge exactly like Major (11-how-to-code-review.md, Convergence): either a finding meets the Minor bar (fix it) or it is a Question (informational, never blocking). -->

<!-- Open-findings count: the one number a merger needs above the fold (PR #388: ticked, past-tense items under "Remaining Minor" read as pending work). State it explicitly; title a section by what its items ARE (`Minor — closed`). The `- [ ]` boxes in the first-review comment are the findings AS RAISED, ticked off in the remediation report, not in place: an unticked box upstream is history, not an open item. Say so when the count is zero. -->
> **Open findings: <N>.** <When 0: every finding is resolved; nothing on this PR is waiting on anyone.>

<!-- Unassessed-chip fallback: the chip is NEVER dropped — the verdict line always carries both `risk:` and `cost:` and stays scannable. `cost:n/a` renders when `/assess-cost` is absent (single-source dimension). `risk:n/a` renders ONLY when `/classify` is entirely absent (no matrix, skill Step 1.5); a single unassessed dimension (Security relevance, or Coupling until #263) is EXCLUDED from `max(assessed)` (§3.1 / D21), not propagated, so the risk chip still shows the max of the others. `n/a` is a rendering placeholder, never a tag value (no `cost:not assessed` / `risk:not assessed` tag is emitted). -->

<!-- Classification-changed drift note: include ONLY when the review-time tier/cost differs from the refinement-time classification. Raise-only (quality-model §3.2 / D17): never a silent downgrade. Omit when unchanged. -->
> **Classification changed:** `risk:<from>` → `risk:<to>` — [one-line reason]

**PR:** [#XXX] · **Author:** [name] · **Reviewer:** [name] · **Date:** [YYYY-MM-DD] · **Story:** [US-XXX] · **Type:** [feature | bug | refactor | docs | config]

<details>
<summary>Classification matrix — per dimension</summary>

| Dimension                   | Tier    | Source                     | Note              |
| --------------------------- | ------- | -------------------------- | ----------------- |
| Service/domain criticality  | [color] | [KB default / table]       | [note]            |
| Change/diff risk            | [color] | [diff footprint]           | [note]            |
| Business impact             | [color] | [subdomain class \| Overrides: business-impact.trivial-diff] | [note]            |
| Security relevance          | [color] | `/assess-security`         | [raise-only, D17] |
| Coupling balance            | [color] | `/assess-coupling`         | [not assessed until #263] |

Tier = max(assessed). Cost = highest detected signal. Review value is a **floor** (D17): confirm or raise, never lower.

</details>

## Assessments

Each assessment: **1-line verdict**, breakdown in `<details>`. Unavailable capability → **not assessed** (section never dropped).

### Security — Input validation

**Verdict:** [green | yellow | red | not assessed] — [one-line]

<details>
<summary>Details</summary>

- Inputs touched by the diff, each validated / sanitized or not; feeds from `/assess-security` (`$mode: review`).

</details>

### Security — Output handling

**Verdict:** [green | yellow | red | not assessed] — [one-line]

<details>
<summary>Details</summary>

- Output encoding / escaping on the touched surfaces (XSS, injection).

</details>

### Security — Authentication

**Verdict:** [green | yellow | red | not assessed] — [one-line]

<details>
<summary>Details</summary>

- Authentication mechanisms on the changed paths.

</details>

### Security — Authorization

**Verdict:** [green | yellow | red | not assessed] — [one-line]

<details>
<summary>Details</summary>

- Access-control enforcement on the changed paths.

</details>

### Security — Introduced vulnerabilities

**Verdict:** [green | yellow | red | not assessed] — [N introduced, N pre-existing]

<details>
<summary>Details</summary>

| Severity | Category | File:location | Introduced / pre-existing | Recommendation |
| -------- | -------- | ------------- | ------------------------- | -------------- |
| [P0/P1]  | [OWASP]  | [file:line]   | [introduced]              | [fix]          |

Any **introduced** red finding drives **CHANGES-REQUESTED** (introduced-red-security rule, story #227/AC4, not an AC of #228). Pre-existing findings are surfaced, not blocking.

</details>

### Cost

**Verdict:** `cost:<class>` — [one-line rationale]

<details>
<summary>Details</summary>

| Signal | Class | Provider | Note |
| ------ | ----- | -------- | ---- |
| [signal] | [color] | [stack] | [note] |

From `/assess-cost` on the diff. A **red** cost class surfaces a **blocking human sign-off** requirement in the Verdict area. Capability absent → not assessed.

</details>

### Architecture (Coupling)

**Verdict:** [green | yellow | red | not assessed] — [one-line balance verdict]

<details>
<summary>Details</summary>

- Integration strength / socio-technical distance / volatility on the touched integrations; from `/assess-coupling` (`$scope: diff`). Capability absent (until #263) → not assessed.

</details>

### Bug fix — Red test before fix

**Verdict:** [green | red | not applicable — not a bug fix | not applicable — rationale recorded] — [the test that reproduces the bug, or the one-line rationale why an automated test is not the proof]

<details>
<summary>Details</summary>

<!-- Bug-fix-conditional. On a PR that fixes a bug (label, story type, or a referenced defect) the fix is backed by a test that reproduces the bug and lands with or before it (test-first rule, `AGENTS.md` § Bug Resolution Workflow), verified here, not assumed. A feature PR has NO test-first obligation: write "not applicable — not a bug fix", never drop the section. Reviewer judgment, no automated commit-order analysis. -->

- **Which test reproduces the bug** — `file::test name`, and what it asserts about the reported behavior.
- **Failing-before / passing-after** — the test is added at or before the fix commit and exercises the fixed path (a test that passes on the unfixed code is no reproduction). Name the specific evidence; never tick empty.
- **No reproducing test and no recorded rationale → a Major finding** under _Findings by severity_ — surfaced, never silently passed.
- **Genuinely untestable fix** (doc typo, pure-formatting fix): record the one-line rationale why an automated test is not the proof — verdict **not applicable — rationale recorded**.
- **Mixed bug fix + feature PR**: applies to the bug-fix portion only.
- **Ambiguous classification**: decide here and record it; default to applying the check when the PR references a bug or defect.

</details>

## Details

<details>
<summary>Findings by severity</summary>

<!-- Classification criteria: severity is capped by HOW a finding is reached, not only by its consequence.
1. Realistic-trigger test: does it fire on a plausible edit/usage, or only on a contrived scenario built to defeat the code (an unmotivated reorder, a construct that does not exist today, adversarial input to a script nothing untrusted feeds)? Contrived trigger → Question, never Critical/Major/Minor, however bad the consequence.
2. Deliverable vs. test-infrastructure: a bug in shipped code/docs/config is Critical/Major/Minor per the bar below. A robustness gap in a helper that only scopes a TEST's own assertion (e.g. a string-boundary function) is Minor only if a realistic edit to the file it reads would hit it; otherwise a Question.
Apply both BEFORE assigning severity: this makes "fix every Critical/Major/Minor, always" (11-how-to-code-review.md) converge — the entry bar for Minor is the control, not a relaxed exit policy. -->

**Critical (must fix before merge)**

- [ ] **[File:Line]** — [issue + impact]

**Major (must fix before merge)**

- [ ] **[File:Line]** — [issue + suggested fix]

**Minor (must fix before merge — same bar as Major, just lower impact)**

- [ ] **[File:Line]** — [issue + suggested fix]

**Questions (informational, never blocking — includes anything that only fires on a contrived scenario)**

- [ ] **[File:Line]** — [clarification]

</details>

<details>
<summary>Positive feedback</summary>

<!-- Feedback bucket, NOT a severity — outside "Findings by severity" so the contract-generator's severity extraction (labels under that grouping) stays clean. -->

- [what's done well]

</details>

<details>
<summary>Functionality & requirements (AC coverage)</summary>

- [ ] Acceptance criteria met
- [ ] Business logic + edge cases correct
- [ ] Integrates with existing systems
- [ ] Error handling appropriate

</details>

<details>
<summary>Testing & quality gates</summary>

- [ ] Adequate coverage (unit / integration / e2e as applicable)
- [ ] Edge + error scenarios tested
- [ ] Quality gates: [PASS | FAIL — which]

</details>

<details>
<summary>Adoption compliance</summary>

- Degradation level: [1–4]
- Dependencies match `tech-stack.md`; patterns match `architecture.md`
- ADRs present for new technical decisions (missing ADR → CHANGES-REQUESTED)

</details>

<details>
<summary>Tech debt</summary>

- Items flagged by `/analyze-debt` (surfaced, never blocking on debt grounds alone).

</details>

<details>
<summary>Documentation</summary>

- [ ] Code / API / user / architecture docs updated as applicable.

</details>

<details>
<summary>Performance & deployment</summary>

<!-- Lightweight prompt, collapsed: must not compete with the verdict for the 30s budget. -->

- [ ] No performance regression on hot paths (added queries / N+1, large allocations, sync work on the request path).
- [ ] Deployment / rollback considered (reversible migrations, feature-flag or staged rollout, a known rollback path).

</details>

---

For review type emphasis: Feature → acceptance criteria and UX; Bug Fix → root cause addressed + regression test; Refactoring → behavior unchanged, coverage maintained; Hotfix → minimal change, rollback ready. Review conduct standards: see [team standards](../team/standards.md) (single source of truth).
