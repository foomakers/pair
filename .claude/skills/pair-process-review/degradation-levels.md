# Phase 3, Step 3.2: Adoption Compliance Levels — Detail

Disclosed from [SKILL.md](SKILL.md) Step 3.2. Run only the procedure matching the level determined in Step 3.1 — the other three never apply on this run.

**Level 1** (/pair-capability-verify-adoption + /pair-capability-assess-stack):

1. Compose `/pair-capability-verify-adoption` with `$scope = all`.
2. For each non-conformity:
   - **Tech-stack**: compose `/pair-capability-assess-stack` (output-only — returns a proposal) → on developer approval, `/pair-process-review` persists the entry via `/pair-capability-record-decision(content, target)` (the sole writer); on rejection → CHANGES-REQUESTED.
   - **Architecture**: report to developer for resolution. Missing ADR → HALT via `/pair-capability-record-decision`.
   - **Other** (security, coding-standards, infrastructure): report findings.
3. Record all results.

**Level 2** (/pair-capability-verify-adoption only):

1. Compose `/pair-capability-verify-adoption` with `$scope = all`.
2. For tech-stack non-conformities: report as findings for manual resolution.
3. For other non-conformities: same as Level 1.
4. Record results.

**Level 3** (/pair-capability-assess-stack only):

1. Inline check: scan PR diff for new dependencies not in [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md).
2. For unlisted dependencies: compose `/pair-capability-assess-stack` (output-only — returns a proposal) → on approval, `/pair-process-review` persists via `/pair-capability-record-decision`; on rejection, flag as CHANGES-REQUESTED.
3. No broader adoption compliance check (security, architecture, etc. — covered partially by Phase 2).
4. Record results.

**Level 4** (neither installed):

1. Warn:

   > `/pair-capability-verify-adoption` and `/pair-capability-assess-stack` are not installed — skipping automated adoption compliance. Please manually verify code against adoption files.

2. Move to Phase 4.
