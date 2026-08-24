---
name: assess-security
description: "Assesses security posture against resolved rules (KB global + per-service + per-web-app + adoption project rules): `$mode: review` — composed by /review to produce a 1-line verdict + collapsed findings feeding the risk matrix's security dimension (D22), CHANGES-REQUESTED on vulnerabilities the PR introduces; `$mode: audit` — one-shot codebase scan against OWASP Top 10, writes a report to .pair/working/reports/security/ and proposes project rules for /record-decision to persist. Deterministic secret-scanning is a separate CI layer (see /setup-gates) — this skill never scans for committed secrets itself (D24)."
version: 0.2.0
author: Foomakers
---

# /assess-security — Security Assessment

Assess security posture in two modes — `review` (per-PR, composed by `/review`) and `audit` (one-shot, standalone) — against a rule set resolved from the [quality model](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) (§2 Security pillar, §3.1 Security relevance dimension) plus the [security guidelines](../../../.pair/knowledge/guidelines/quality-assurance/security/README.md). The deterministic secret-scanning layer that mechanically blocks a build on a committed secret (R6.5) is CI config provisioned by `/setup-gates` (D24, anti-complexity) — not this skill, and not an LLM judgment call.

## Arguments

| Argument  | Required | Description                                                                                                                                |
| --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `$mode`   | No       | `review` — assess the current PR diff. `audit` — one-shot codebase scan. Auto-detected: called by `/review` → `review`; otherwise → `audit`. |
| `$choice` | No       | Audit mode only. A named control set to adopt directly (e.g. `owasp-top10`), skipping full evaluation — resolution cascade Path A.             |
| `$scope`  | No       | Audit mode only. Area/package to scope the assessment (default: whole codebase).                                                              |
| `$output` | No       | Audit mode only. Directory the report is written to. Default: `.pair/working/reports/security/` (D14 — report path override).                  |
| `$approval` | No     | Approval-round mode: `interactive` (default — every round runs as written) or `auto` (ask nothing; accept as-is and report). Audit mode only — review mode has no approval round. See [approval rounds](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/approval-rounds.md). |

## Rule Set (both modes read this; only audit mode's re-derivation is cascade-gated)

Every rule the skill applies is resolved through the same layered set, most-specific wins on conflict, layers are additive (a project rule never silently deletes a KB default):

1. **Global (KB default)** — [authentication-authorization.md](../../../.pair/knowledge/guidelines/quality-assurance/security/authentication-authorization.md), [vulnerability-prevention.md](../../../.pair/knowledge/guidelines/quality-assurance/security/vulnerability-prevention.md), [compliance.md](../../../.pair/knowledge/guidelines/quality-assurance/security/compliance.md) — plus the Security relevance heuristic in [quality-model.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) §3.1 (what counts green/yellow/red).
2. **Per-service** — [api-security.md](../../../.pair/knowledge/guidelines/quality-assurance/security/api-security.md).
3. **Per-web-app** — [web-app-security.md](../../../.pair/knowledge/guidelines/quality-assurance/security/web-app-security.md).
4. **Project (adoption)** — `adoption/tech/security.md` if it exists — the delta an audit proposed and a human confirmed; absent entirely ⇒ KB defaults (layers 1-3) apply completely (D21).
5. **Package-scoped override** (only if the package-local adoption override from story #237 is active): load the touched packages' local `.pair/adoption/tech/security.md` instead of the root one; assessment and review load only the packages the diff/story touches.

## Algorithm

### Step 0: Detect Mode

1. **Check**: Is `$mode` provided?
2. **Skip**: If provided, use it. Proceed to Step 1.
3. **Act**: Auto-detect: invoked with a PR/diff in context (i.e. by `/review`) → `review`; otherwise → `audit`.
4. **Verify**: Mode is set.

### Step 1: Load Rule Set

1. **Act**: Read the five layers above, in order, skipping any that don't exist (layer 4-5 are commonly absent — that's expected, not a gap, per D21).
2. **Verify**: Effective rule set assembled. Layer 4/5 absence is logged as "KB global rules only" in the output, not treated as an error.

### Step 2: Route by Mode

- `$mode = review` → Step 3.
- `$mode = audit` → Step 5 (resolution cascade first).

## Review Mode (per-PR)

### Step 3: Evaluate the Diff

1. **Act**: For each file touched by the diff, classify against the rule set's Security relevance heuristic (quality-model.md §3.1): no security-sensitive surface (green) / security-adjacent — new external dependency, input validation on a non-critical path (yellow) / authn-authz, secrets-credentials, cryptography, PII, untrusted-input parsing (red).
2. **Act**: For each finding, tag it **introduced** (new code/change in this diff) or **pre-existing** (surfaced, not a reason to block on its own — the block signal only fires on introduced vulnerabilities).
3. **Verify**: Every touched security-sensitive surface has a classification and a provenance tag (introduced/pre-existing).

### Step 4: Emit Review Verdict

1. **Act**: Compute the overall verdict = highest severity among introduced findings (pre-existing findings are reported but don't raise the verdict past what introduced findings justify, consistent with the review floor in quality-model.md §3.2: this review pass may only raise the tier's Security relevance dimension, never lower a value the story's own refinement-time assessment already set).
2. **Act**: Render the 1-line verdict + collapsed findings list (severity, rule/category, file:location) per Output Format below — output-only, no files written; this is embedded by the caller into the review body's five Security sections (D22 — verdict in ~1 line, details in `<details>`).
3. **Verify**: Verdict emitted. If any **introduced** finding is red → flag explicitly for the caller: this is the signal that drives `/review`'s CHANGES-REQUESTED decision (the decision itself stays `/review`'s, per its own Step 5.2 table — this skill only reports the finding).

## Audit Mode (one-shot)

### Step 5: Resolution Cascade

See [resolution cascade](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/resolution-cascade.md) for the generic Path A/B/C mechanics, and [approval rounds](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/approval-rounds.md) for the `$approval` signal both rounds below carry.

- **Path A** ($choice provided): adopt the named control set (e.g. `owasp-top10`) directly — render the `tech/security.md` proposal referencing it, skip full evaluation, confirm with the developer (`$approval: interactive`; under `auto` the named set is accepted as passed and any conflict with existing adoption is reported). Proceed to Step 8.
- **Path B** (adoption check): `adoption/tech/security.md` exists with a populated project-rules section. Confirm it's still current with the developer (`$approval: interactive`; under `auto` the existing rules are **kept** and reported, the conservative branch — re-auditing would propose replacing a recorded decision nobody was asked about); if its backing decision record is missing, report the gap (this skill still writes nothing to adoption — the caller backfills via `/record-decision`). No audit report is generated for an unchanged, confirmed ruleset ("no re-assessment", per the resolution cascade addendum). Exit.
- **Path C** (no override, no populated adoption): proceed to Step 6 — full OWASP Top 10 assessment.

### Step 6: Evaluate Against OWASP Top 10

1. **Act**: For each area in `$scope` (default: whole codebase), evaluate exposure to each OWASP Top 10 category (A01–A10), assigning severity P0 (critical) through P3 (low) per finding.
2. **Act**: For each finding, cross-reference the matching KB guideline (e.g. A03 Injection → [vulnerability-prevention.md](../../../.pair/knowledge/guidelines/quality-assurance/security/vulnerability-prevention.md), A07 Auth Failures → [authentication-authorization.md](../../../.pair/knowledge/guidelines/quality-assurance/security/authentication-authorization.md)) instead of duplicating guideline content in the report.
3. **Verify**: Every in-scope area has been evaluated against all 10 categories (even if the result is "not applicable" for that area) — no silent skips.

### Step 7: Write Audit Report

1. **Act**: Render the report — findings grouped by OWASP category, each with severity, location, and a link to the matching guideline.
2. **Act**: Create `$output` (default `.pair/working/reports/security/`) if it doesn't exist. Write the report to `$output/<YYYY-MM-DD>-audit.md`. This is a direct write (reports are excluded from the KB registry per D14 — they are not knowledge, and this skill, unlike the adoption-writing `assess-*` family, is the one authorized to write them itself, the same way `/design-manual-tests` writes its own suite files directly).
3. **Verify**: Report file exists at the resolved path.

### Step 8: Render Project-Rules Proposal

1. **Act**: Render the `tech/security.md` content: global project security principles distilled from the audit findings (never duplicating KB or per-service/per-web-app guideline content — only the project-specific delta).
2. **Act**: Assemble the persistence tuple per [record-decision invocation contract](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/record-decision-contract.md):
   - `content`: the rendered `tech/security.md` body.
   - `target`: `adoption/tech/security.md`.
   - `decision-metadata`: `$type: non-architectural`, `$topic: security-strategy-initial` (first audit) or `security-strategy-update` (subsequent), `$summary: "Project security rules adopted from audit: [key rules]"`.
3. **Verify**: Proposal assembled. Persistence is performed by the caller via `/record-decision`, never by this skill (the report file from Step 7 is the one exception this skill writes directly — adoption content is never self-written).

## Output Format

### Review Mode

```text
SECURITY REVIEW (composed by /review — no files written):
├── Mode:       Review
├── Verdict:    [green | yellow | red] — [1-line summary]
├── Findings:   [N total — N introduced, N pre-existing]
├── Rule Set:   [KB global | + per-service | + per-web-app | + adoption tech/security.md]
└── Feeds:      Security relevance dimension (quality-model.md §3.1) — a floor, never lowers the tier

<details>
<summary>N findings</summary>

1. [severity] [category] — [file:location] — [introduced | pre-existing] — [recommendation]
...

</details>
```

### Audit Mode

```text
SECURITY AUDIT COMPLETE:
├── Mode:      Audit
├── Scope:     [whole codebase | $scope]
├── Path:      [Argument Override | Adoption Exists (confirmed, no re-assessment) | Full OWASP Assessment]
├── Findings:  [N — P0: x, P1: x, P2: x, P3: x | N/A — Path B]
├── Report:    [.pair/working/reports/security/<file> — written | N/A — Path B]
├── Proposal:  [content rendered for tech/security.md | N/A — Path B, already current]
├── Target:    adoption/tech/security.md
├── Persist:   [caller composes /record-decision(content, target) → ADL | N/A]
└── Status:    [Report written | Confirmed existing | Proposal ready]
```

## Composition Interface

When composed by `/review` (Phase 2):

- **Input**: `/review` invokes `/assess-security` with `$mode: review` against the PR diff.
- **Output**: Returns the verdict + collapsed findings (Review Mode output above). `/review` embeds it verbatim into the review body's five Security sections and, if any introduced finding is red, factors it into its own CHANGES-REQUESTED decision (Step 5.2).
- **Persistence**: None — review mode writes nothing.

When invoked **independently** in audit mode:

- Full one-shot flow. The developer (or agent) reviews the report and, if a proposal was rendered (Path A/C), persists it by composing `/record-decision`, then commits.

## Edge Cases

- **No adoption rules yet** (`tech/security.md` absent): KB global rules only, in both modes; audit mode's Path C evaluation is exactly the mechanism that proposes the initial project set.
- **Introduced vulnerability found in review mode**: reported as a red, `introduced` finding — the caller (`/review`) turns this into CHANGES-REQUESTED; this skill never blocks anything itself (it has no merge authority).
- **Scanner/secret-in-diff concerns**: out of this skill's scope entirely — see the deterministic CI layer in [secret-scanning.md](../../../.pair/knowledge/guidelines/quality-assurance/security/secret-scanning.md) and `/setup-gates`. This skill never re-implements secret detection (D24).

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (guideline missing → minimal assessment, ask directly; adoption file missing → skill still runs against KB defaults; PM tool unreachable → n/a, this skill doesn't read the PM tool) for the standard scenarios. Additional cases:

- **Package-scoped override (#237) not active**: load only the root `adoption/tech/security.md` (layer 4) — the package-scoped layer 5 is skipped entirely, not an error.
- **`/map-contexts` not available** (for per-service/per-web-app boundary detection in review mode): fall back to inferring service/web-app boundaries from package structure (framework markers, `package.json` fields) rather than HALTing.
- **`/record-decision` not installed** (audit mode): the report (Step 7) is still written — it's this skill's own direct write, unaffected. Only the `tech/security.md` proposal (Step 8) stands as a report with no persistence path; note this explicitly in the output.

## Notes

- **Writes exactly one kind of file itself**: the audit report under `.pair/working/reports/security/` (Step 7) — the one exception to the `assess-*` family's usual output-only convention, justified the same way `/design-manual-tests` writes its own suite files: reports are operational artifacts (D14), not adoption content. Adoption content (`tech/security.md`) is never self-written — that always goes through the caller's `/record-decision` composition (Step 8).
- **Idempotent** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md). Audit mode's check: Path B (populated `tech/security.md` + backing decision record) confirms rather than re-running the full OWASP assessment. Review mode is not idempotent in that sense — a fresh verdict is computed every review, against the current diff, by design (findings can change commit to commit).
- **Never scans for secrets**: committed-secret detection is a deterministic, LLM-free CI layer (R6.5) provisioned by `/setup-gates`, not an assessment this skill performs — keeping the "no LLM involved" guarantee real (D24).
- **D22** (1-line verdict + collapsed findings, never a table inline): a project-level decision record, not part of this portable dataset.
