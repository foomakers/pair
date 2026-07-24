# Code Review Template

> **Verdict-first (D22, R6.6).** This is the **native GitHub review body** submitted with the review action (Approve / Request Changes / Comment) — it is **not a separate PR comment** (decision Q5). The top of the body — classification tags, tier, cost class and the 1-line verdict — reads in **~30 seconds**; every assessment is a 1-line verdict with the breakdown collapsed in `<details>`. A reader scanning the top understands verdict, tier and cost class inside the 30-second reading budget without opening a single `<details>`.
>
> **Not assessed is explicit.** When the backing capability is missing or failed (`/assess-security`, `/assess-cost`, `/assess-coupling`), the section verdict reads **not assessed** — never silently omitted.

## Verdict

`risk:<tier>` · `cost:<class>` — **<APPROVED | CHANGES-REQUESTED | TECH-DEBT>** — <one-line reason>

<!-- Unassessed-chip fallback: the chip is NEVER dropped — the verdict line always carries both `risk:` and `cost:` prefixes and stays scannable. `cost:n/a` renders when `/assess-cost` is absent (cost is a single-source dimension). `risk:n/a` renders ONLY when `/classify` is entirely absent (no matrix at all, per skill Step 1.5) — a single unassessed dimension (Security relevance, or Coupling until #263) is EXCLUDED from `max(assessed)` (§3.1 / D21), NOT propagated to the tier, so the risk chip still shows the max of the other assessed dimensions. `n/a` is a rendering placeholder, not a tag value (no `cost:not assessed` / `risk:not assessed` tag is ever emitted). This keeps the top-line degradation consistent with the section degradation, whose collapsed body reads "not assessed". -->

<!-- Classification-changed drift note: include ONLY when the review-time tier/cost differs from the story's refinement-time classification. Raise-only per quality-model §3.2 / D17 — a drift note fires upward, never records a silent downgrade. Omit the line entirely when unchanged. -->
> **Classification changed:** `risk:yellow` → `risk:red` — <one-line reason>

**PR:** [#XXX] · **Author:** [name] · **Reviewer:** [name] · **Date:** [YYYY-MM-DD] · **Story:** [US-XXX] · **Type:** [feature | bug | refactor | docs | config]

<details>
<summary>Classification matrix — per dimension</summary>

| Dimension                   | Tier    | Source                     | Note              |
| --------------------------- | ------- | -------------------------- | ----------------- |
| Service/domain criticality  | [color] | [KB default / table]       | [note]            |
| Change/diff risk            | [color] | [diff footprint]           | [note]            |
| Business impact             | [color] | [subdomain class]          | [note]            |
| Security relevance          | [color] | `/assess-security`         | [raise-only, D17] |
| Coupling balance            | [color] | `/assess-coupling`         | [not assessed until #263] |

Tier = max(assessed). Cost = highest detected signal. Review value is a **floor** (D17): confirm or raise, never lower.

</details>

## Assessments

Each assessment is a **1-line verdict**; open the `<details>` for the breakdown. An unavailable capability shows **not assessed** (the section is never dropped).

### Security — Input validation

**Verdict:** [green | yellow | red | not assessed] — <one-line>

<details>
<summary>Details</summary>

- Inputs touched by the diff and whether each is validated / sanitized.
- Feeds from `/assess-security` (`$mode: review`).

</details>

### Security — Output handling

**Verdict:** [green | yellow | red | not assessed] — <one-line>

<details>
<summary>Details</summary>

- Output encoding / escaping on the touched surfaces (XSS, injection).

</details>

### Security — Authentication

**Verdict:** [green | yellow | red | not assessed] — <one-line>

<details>
<summary>Details</summary>

- Authentication mechanisms on the changed paths.

</details>

### Security — Authorization

**Verdict:** [green | yellow | red | not assessed] — <one-line>

<details>
<summary>Details</summary>

- Access-control enforcement on the changed paths.

</details>

### Security — Introduced vulnerabilities

**Verdict:** [green | yellow | red | not assessed] — <N introduced, N pre-existing>

<details>
<summary>Details</summary>

| Severity | Category | File:location | Introduced / pre-existing | Recommendation |
| -------- | -------- | ------------- | ------------------------- | -------------- |
| [P0/P1]  | [OWASP]  | [file:line]   | [introduced]              | [fix]          |

Any **introduced** red finding drives **CHANGES-REQUESTED** (introduced-red-security rule, defined by the security-assessment story #226/AC4 — not an AC of #228). Pre-existing findings are surfaced, not blocking.

</details>

### Cost

**Verdict:** `cost:<class>` — <one-line rationale>

<details>
<summary>Details</summary>

| Signal | Class | Provider | Note |
| ------ | ----- | -------- | ---- |
| [signal] | [color] | [stack] | [note] |

Feeds from `/assess-cost` against the diff. A **red** cost class surfaces a **blocking human sign-off** requirement in the Verdict area. Capability absent → not assessed.

</details>

### Architecture (Coupling)

**Verdict:** [green | yellow | red | not assessed] — <one-line balance verdict>

<details>
<summary>Details</summary>

- Integration strength / socio-technical distance / volatility on the integrations the diff touches.
- Feeds from `/assess-coupling` (`$scope: diff`). Capability absent (until #263) → not assessed.

</details>

## Details

<details>
<summary>Findings by severity</summary>

**Critical (must fix before merge)**

- [ ] **[File:Line]** — [issue + impact]

**Major (should fix before merge)**

- [ ] **[File:Line]** — [issue + suggested fix]

**Minor (consider)**

- [ ] **[File:Line]** — [suggestion]

**Questions**

- [ ] **[File:Line]** — [clarification]

**Positive**

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

---

For review type emphasis: Feature → acceptance criteria and UX; Bug Fix → root cause addressed + regression test; Refactoring → behavior unchanged, coverage maintained; Hotfix → minimal change, rollback ready. Review conduct standards: see [team standards](../team/standards.md) (single source of truth).
