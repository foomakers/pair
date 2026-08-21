# Code Review Template

> **Verdict-first (D22, R6.6).** This is the **native GitHub review body** submitted with the review action (Approve / Request Changes / Comment). In `/pair-process-review`'s own self-review flow it is submitted as that native review body — **not a separate PR comment** (decision Q5). (An independent reviewer agent, or a self-authored PR where GitHub blocks self-approval, delivers this **same body** via a PR comment instead — see `.claude/agents/pair-reviewer.md` and review Step 5.3; the artifact is identical, only the delivery event differs.) The top of the body — classification tags, tier, cost class and the 1-line verdict — reads in **~30 seconds**; every assessment is a 1-line verdict with the breakdown collapsed in `<details>`. A reader scanning the top understands verdict, tier and cost class inside the 30-second reading budget without opening a single `<details>`.
>
> **Not assessed is explicit.** When the backing capability is missing or failed (`/pair-capability-assess-security`, `/pair-capability-assess-cost`, `/pair-capability-assess-coupling`), the section verdict reads **not assessed** — never silently omitted.

## Verdict

`risk:<tier>` · `cost:<class>` — **[APPROVED | CHANGES-REQUESTED]** — [one-line reason]

<!-- No TECH-DEBT verdict. Minor findings block merge exactly like Major (11-how-to-code-review.md's
Convergence section) — a review does not converge by waving real findings through as tracked debt.
What used to get filed as "only minor, approve as debt" either meets the Minor bar (fix it) or
doesn't meet any bar at all (file it as a Question instead — informational, never blocking). -->

<!-- Open-findings count: the ONE number a merger needs above the fold. A report that
lists resolved findings under a heading like "Remaining Minor" reads as if work is
pending — observed on PR #388, where all four items were ticked and past-tense and the
maintainer still had to ask twice. State the count explicitly, and title a section by
what its items ARE (`Minor — closed`), never by a word that could mean either. The
`- [ ]` checkboxes in the first-review comment are the findings AS RAISED; they are
ticked off in the remediation report, not in place, so an unticked box upstream is
history and not an open item. Say so when the count is zero. -->
> **Open findings: <N>.** <When 0: every finding is resolved; nothing on this PR is waiting on anyone.>

<!-- Unassessed-chip fallback: the chip is NEVER dropped — the verdict line always carries both `risk:` and `cost:` prefixes and stays scannable. `cost:n/a` renders when `/pair-capability-assess-cost` is absent (cost is a single-source dimension). `risk:n/a` renders ONLY when `/pair-capability-classify` is entirely absent (no matrix at all, per skill Step 1.5) — a single unassessed dimension (Security relevance, or Coupling until #263) is EXCLUDED from `max(assessed)` (§3.1 / D21), NOT propagated to the tier, so the risk chip still shows the max of the other assessed dimensions. `n/a` is a rendering placeholder, not a tag value (no `cost:not assessed` / `risk:not assessed` tag is ever emitted). This keeps the top-line degradation consistent with the section degradation, whose collapsed body reads "not assessed". -->

<!-- Classification-changed drift note: include ONLY when the review-time tier/cost differs from the story's refinement-time classification. Raise-only per quality-model §3.2 / D17 — a drift note fires upward, never records a silent downgrade. Omit the line entirely when unchanged. -->
> **Classification changed:** `risk:<from>` → `risk:<to>` — [one-line reason]

**PR:** [#XXX] · **Author:** [name] · **Reviewer:** [name] · **Date:** [YYYY-MM-DD] · **Story:** [US-XXX] · **Type:** [feature | bug | refactor | docs | config]

<details>
<summary>Classification matrix — per dimension</summary>

| Dimension                   | Tier    | Source                     | Note              |
| --------------------------- | ------- | -------------------------- | ----------------- |
| Service/domain criticality  | [color] | [KB default / table]       | [note]            |
| Change/diff risk            | [color] | [diff footprint]           | [note]            |
| Business impact             | [color] | [subdomain class]          | [note]            |
| Security relevance          | [color] | `/pair-capability-assess-security`         | [raise-only, D17] |
| Coupling balance            | [color] | `/pair-capability-assess-coupling`         | [not assessed until #263] |

Tier = max(assessed). Cost = highest detected signal. Review value is a **floor** (D17): confirm or raise, never lower.

</details>

## Assessments

Each assessment is a **1-line verdict**; open the `<details>` for the breakdown. An unavailable capability shows **not assessed** (the section is never dropped).

### Security — Input validation

**Verdict:** [green | yellow | red | not assessed] — [one-line]

<details>
<summary>Details</summary>

- Inputs touched by the diff and whether each is validated / sanitized.
- Feeds from `/pair-capability-assess-security` (`$mode: review`).

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

Any **introduced** red finding drives **CHANGES-REQUESTED** (introduced-red-security rule, defined by the security-assessment story #227/AC4 — not an AC of #228). Pre-existing findings are surfaced, not blocking.

</details>

### Cost

**Verdict:** `cost:<class>` — [one-line rationale]

<details>
<summary>Details</summary>

| Signal | Class | Provider | Note |
| ------ | ----- | -------- | ---- |
| [signal] | [color] | [stack] | [note] |

Feeds from `/pair-capability-assess-cost` against the diff. A **red** cost class surfaces a **blocking human sign-off** requirement in the Verdict area. Capability absent → not assessed.

</details>

### Architecture (Coupling)

**Verdict:** [green | yellow | red | not assessed] — [one-line balance verdict]

<details>
<summary>Details</summary>

- Integration strength / socio-technical distance / volatility on the integrations the diff touches.
- Feeds from `/pair-capability-assess-coupling` (`$scope: diff`). Capability absent (until #263) → not assessed.

</details>

## Details

<details>
<summary>Findings by severity</summary>

<!-- Classification criteria: severity is capped by HOW a finding is reached, not just by what
it would do if it happened.

1. Realistic-trigger test: does this fire on a plausible edit/usage, or only on a contrived
   scenario constructed to defeat the code (an unmotivated reorder, wrapping something in a
   construct that does not exist today, an adversarial input to a script nothing untrusted
   feeds)? If the trigger is contrived, the finding is a Question, full stop — never
   Critical/Major/Minor, no matter how bad the consequence would be if it happened.
2. Deliverable vs. test-infrastructure test: a bug in the shipped code/docs/config is
   Critical/Major/Minor per the normal bar below. A robustness gap in a helper that exists only
   to scope a TEST's own assertion (e.g. a string-boundary function) is Minor only if a realistic
   edit to the file it reads would hit it; otherwise it is a Question.

Apply both tests BEFORE assigning severity below, not after — this is what makes "fix every
Critical/Major/Minor, always" (the default per 11-how-to-code-review.md) converge instead of
looping: the bar for entering the Minor bucket at all is the control, not a relaxed exit policy. -->

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

<!-- Feedback bucket, NOT a severity — kept outside "Findings by severity" so the contract-generator's severity extraction (the severity labels under that grouping) stays clean. -->

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

- Items flagged by `/pair-capability-analyze-debt` (surfaced, never blocking on debt grounds alone).

</details>

<details>
<summary>Documentation</summary>

- [ ] Code / API / user / architecture docs updated as applicable.

</details>

<details>
<summary>Performance & deployment</summary>

<!-- Lightweight prompt only — kept collapsed so it does not compete with the verdict for the 30s budget. -->

- [ ] No performance regression on hot paths (added queries / N+1, large allocations, sync work on the request path).
- [ ] Deployment / rollback considered (reversible migrations, feature-flag or staged rollout, a known rollback path).

</details>

---

For review type emphasis: Feature → acceptance criteria and UX; Bug Fix → root cause addressed + regression test; Refactoring → behavior unchanged, coverage maintained; Hotfix → minimal change, rollback ready. Review conduct standards: see [team standards](../team/standards.md) (single source of truth).
