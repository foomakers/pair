# ADR: Deterministic Secret Scanning as a CI Layer, Not a Skill (D24)

## Status

Accepted

## Date

2026-07-16

## Context

- Story #227 (epic #208) introduces `/pair-capability-assess-security` — a review-invoked +
  one-shot-audit skill that evaluates security posture against the KB/adoption rule cascade
  (authn/authz, injection, OWASP Top 10, ...). This is inherently a judgment call: an LLM reads the
  diff/codebase and classifies findings against guideline text.
- The same story also carries R6.5: a diff containing a committed secret/key must mechanically block
  the build, with **no LLM involved**. This is a categorically different kind of check — deterministic
  pattern/entropy matching, not judgment.
- Folding secret detection into `assess-security` as one more finding category was the obvious,
  simplest-looking option (one skill, one composition point for `/pair-process-review`), but it would
  quietly reintroduce a model into a control whose entire stated value is that it has none.
- This is the same anti-complexity thread as ADR-012 (`map-subdomains`/`map-contexts` reclassified from
  process skill to capability): D24 is the project's running decision to **not** create a skill/process
  step for something a mechanical mechanism already does correctly and more cheaply.
- Verified directly with gitleaks 8.x (`brew install gitleaks`, v8.30.1) before writing this ADR: a bare
  `gitleaks detect --source .` scans the **entire** git history — a leak committed once keeps failing
  every later scan regardless of an allowlist added afterwards. The CI-equivalent invocation scopes the
  scan to the commit range under test (`--log-opts`), matching what `gitleaks/gitleaks-action` does
  internally for a pull request. This reproducible verification (both the leak-found and
  allowlisted-pass cases, with real exit codes) lives in
  `packages/knowledge-hub/dataset/.pair/knowledge/guidelines/quality-assurance/security/secret-scanning.md`
  (§ Verification) — the original draft of that section used the un-scoped invocation and its second
  assertion ("no leaks found · exit: 0") did not actually hold; it was corrected as part of this story.

## Options Considered

### Option 1: Fold secret detection into `/pair-capability-assess-security`

- **Description**: `assess-security`'s review mode scans the diff for secret-shaped strings as one
  more OWASP-style finding category (severity, file:location, introduced/pre-existing), alongside
  authn/authz and injection findings.
- **Pros**: One skill, one composition point for `/pair-process-review`; no separate CI layer to
  provision or keep in sync.
- **Cons**: Reintroduces an LLM judgment call into a control whose entire value (R6.5) is that it has
  none — a model can plausibly miss a pattern, get truncated context on a large diff, or simply be
  unavailable, in a way a deterministic regex+entropy scanner structurally cannot; duplicates a solved
  problem (gitleaks, trufflehog, ggshield, ...) inside prose-driven skill logic that has no mechanism to
  mechanically block a build the way a required CI check does; `assess-security` has no merge
  authority of its own (by design, per its Notes) — it can only report a finding to the caller, so even
  a correct detection would not, on its own, satisfy "the build goes RED mechanically."

### Option 2: Deterministic CI layer, provisioned by `/pair-capability-setup-gates` (chosen)

- **Description**: Secret detection is CI config (gitleaks by default), written as a required,
  fail-closed job by `/pair-capability-setup-gates` — unconditional at every risk tier, unlike the
  tier-scoped gates around it (unit tests from 🟡, integration/E2E from 🔴 only). A project can swap
  the scanner via `way-of-working.md`'s Custom Gate Registry, same resolution order as every other
  gate (Argument > Adoption > KB default). False positives are resolved via a project-root
  `.gitleaks.toml` allowlist, reviewed like any other PR change — never a per-run flag.
- **Pros**: R6.5's "no LLM involved" guarantee is structurally real, not just documented; reuses a
  mature, purpose-built scanner instead of reimplementing detection; consistent with the D24
  anti-complexity thread (ADR-012); the required-check mechanism that already blocks a PR on any other
  failing gate is the same mechanism that makes this one block — no new merge-gating logic needed.
- **Cons**: Two artifacts to keep in sync (the KB guideline + `setup-gates`' provisioning logic, +
  `assess-security`'s own explicit "never scans for secrets" disclaimer) instead of one skill owning
  the whole surface; a project must actually run `/pair-capability-setup-gates` (or configure CI
  manually) to get the protection — `assess-security`'s audit mode cannot retroactively enable it, it
  can only surface the gap as a finding.

## Decision

Adopt Option 2. Secret detection is CI config, not a skill and not an LLM judgment call. `gitleaks` is
the KB default; `/pair-capability-setup-gates` provisions the job (required, fail-closed, no
`continue-on-error`) plus a starting `.gitleaks.toml` as part of its normal CI-gate provisioning (same
step that already writes lint/type-check/test/build jobs). `/pair-capability-assess-security`'s own
Notes section states explicitly that it never scans for secrets and never overlaps with this layer —
the two are composed by different callers (`/pair-process-review` Phase 2 for `assess-security`;
`/pair-process-bootstrap` or a direct invocation of `setup-gates` for the CI layer) and neither
skill re-implements the other's surface.

## Consequences

### Benefits

- R6.5's "no LLM involved" guarantee is structurally true, not just claimed in prose — the scanner
  runs deterministically and the required-check mechanism blocks the build on any nonzero exit, with
  no model in that path.
- No duplicated secret-detection logic between a skill and a CI tool — one mechanism, one place
  (`secret-scanning.md`) documenting it.
- The allowlist mechanism (`.gitleaks.toml`) is the single, auditable place false positives get
  resolved — reviewed like any other PR change, never a silent per-run flag that could mask a real
  leak.
- Consistent with the existing D24 anti-complexity precedent (ADR-012): a mechanical check does not
  become a skill/process step just because a nearby skill exists that could plausibly absorb it.

### Trade-offs and Limitations

- `/pair-capability-assess-security` and `/pair-capability-setup-gates` must each independently
  document the boundary (each does, in its own Notes/Edge-Cases section) — nothing mechanically
  enforces the two skills stay in sync beyond the conformance test added in this story
  (`packages/knowledge-hub/src/conformance/assess-security.test.ts`), which checks both files'
  cross-references by name (`secret-scanning.md`, `R6.5`, `D24`) but cannot verify runtime behavior.
- The protection is opt-in per project: a project that never runs `/pair-capability-setup-gates` (or
  wires the job manually) has no secret-scanning gate at all — `assess-security`'s audit mode can only
  report this gap, not close it.
- This repository's own CI (`.github/workflows/ci.yml`) is not wired to the gitleaks job as part of
  this story: the KB guideline's own worked example
  (`AWS_SECRET_ACCESS_KEY=AKIAABCDEFGHIJKLMNOP`) is itself a secret-shaped string that a bare gitleaks
  scan over this repo's full history would flag, and resolving that safely (allowlisting the exact
  guideline line, or rewording the example) is deliberately left to a follow-up rather than risked in
  this story's own PR.

## Adoption Impact

- `.claude/skills/pair-capability-assess-security/` (new) + dataset mirror
  `packages/knowledge-hub/dataset/.skills/capability/assess-security/` — the judgment-call skill; Notes
  section states the "never scans for secrets" boundary this ADR records.
- `.claude/skills/pair-capability-setup-gates/SKILL.md` + dataset mirror — Step 2 (reads
  `secret-scanning.md`), Step 3 (proposes the required CI gate), Step 4 (writes the job +
  `.gitleaks.toml`), Notes (documents the D24 boundary).
- `.claude/skills/pair-process-review/SKILL.md` + dataset mirror — new Step 2.4 composing
  `assess-security` with `$mode: review`; unrelated to this ADR's own boundary but the caller that
  makes `assess-security`'s judgment-call findings visible per PR.
- `packages/knowledge-hub/dataset/.pair/knowledge/guidelines/quality-assurance/security/secret-scanning.md`
  (new) — the CI job template, allowlist mechanism, fail-closed requirement, and the corrected,
  reproducible verification this ADR's Context section cites.
- No change required to `adoption/tech/tech-stack.md` or `adoption/tech/way-of-working.md` — this is a
  KB-level skill/CI-layer boundary decision, not a fact about this project's own current tool choice;
  a project that runs `/pair-capability-setup-gates` records its own gitleaks-or-override choice there
  at that time, per that skill's existing Step 6.
