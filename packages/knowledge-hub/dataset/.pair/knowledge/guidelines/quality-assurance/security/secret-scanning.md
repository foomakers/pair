# Secret Scanning — Deterministic CI Layer

The one security control that is **not** a skill (D24). Every other security judgment call goes through `/assess-security`; a committed secret goes RED mechanically, with no LLM involved (R6.5) — an `Automation` layer in [quality-model.md](../quality-model.md)'s three-layer principle (§1) sense: it reads a scan result deterministically, zero judgment.

`/setup-gates` provisions this layer (CI gates, §4 of [quality-model.md](../quality-model.md)); it applies at **every** tier, unlike tier-scoped gates (unit tests from 🟡, integration/E2E from 🔴 only) — a secret is a secret regardless of the change's risk tier.

## Scanner Default

**gitleaks** is the KB default (adoption can swap it — see [Swapping the Scanner](#swapping-the-scanner) below). No project-specific rule lives in this document beyond that default; a project overrides it entirely in `tech/way-of-working.md`'s Custom Gate Registry, the same mechanism every other gate override in this KB uses.

## CI Job Template (GitHub Actions)

`/setup-gates` writes a job equivalent to this into the project's CI pipeline (Step 4 of that skill) — required, not tier-scoped:

```yaml
secret-scan:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0 # gitleaks needs history to scan the diff/commit range
    - uses: gitleaks/gitleaks-action@v2
      env:
        GITLEAKS_CONFIG: .gitleaks.toml # optional — omit to use gitleaks' own defaults
```

`gitleaks/gitleaks-action` exits non-zero the moment it finds a leak, which fails the job — the required-check mechanism (already how every other gate blocks a PR) is what makes the build go red; nothing about this step involves a model call or a judgment prompt.

### Fail-Closed Requirement

**Scanner unavailable in CI is a gate failure, not a skip.** If the action can't run (missing config, registry unreachable, runner error) the job must still fail — never silently pass. `/setup-gates` writes the job as `required` in the same way it marks every other blocking gate; a project must not disable failure on this job (e.g. via the `continue-on-error` step option).

## Allowlist Mechanism (Adoption-Controlled)

False positives are handled with a `.gitleaks.toml` at the project root — never by disabling the scan. `/setup-gates` provisions a starting file; a project extends it as false positives are confirmed:

```toml
title = "project secret-scanning allowlist"

[extend]
useDefault = true # keep gitleaks' built-in detection rules

[allowlist]
description = "Project-specific false-positive exceptions"
regexes = [
  '''EXAMPLE_KEY_[A-Z0-9]{10,}''', # documented placeholder pattern, not a real credential
]
paths = [
  '''\.gitleaks\.toml''', # this file itself contains example patterns
]
```

Adding an entry is an adoption change (the file lives at the project root, reviewed like any other PR) — never a per-run flag passed to silence a specific finding. A full example is at [gitleaks-example.toml](../../../assets/gitleaks-example.toml).

## Swapping the Scanner

A project can adopt a different scanner (trufflehog, ggshield, a vendor SAST suite's secret-detection module, ...) by recording the override in `tech/way-of-working.md`'s Custom Gate Registry — `/setup-gates` reads that override before provisioning gitleaks (same resolution order as every other gate: **Argument > Adoption > KB default**). The fail-closed and required-check requirements above apply to whichever scanner is adopted, not to gitleaks specifically.

## Verification (reproducible)

The mechanism above was verified directly — reproducible with any gitleaks 8.x install. `--log-opts="-1"` scopes the scan to the single commit under test, the same way `gitleaks/gitleaks-action` scopes to the commits a PR introduces — a bare `gitleaks detect --source .` scans the **entire** git history, so a leak committed once would keep failing every later scan regardless of an allowlist added afterwards; that is not what the CI job is testing here:

```bash
git init repo && cd repo
cp .gitleaks.toml .   # the allowlist above
git add -A && git commit -m "add allowlist"

echo 'AWS_SECRET_ACCESS_KEY=AKIAABCDEFGHIJKLMNOP' > secret.txt
git add -A && git commit -m "oops"
gitleaks detect --source . --no-banner --redact --log-opts="-1"; echo "exit: $?"
# → leaks found: 1 · exit: 1  (red build, no LLM)

echo 'AWS_SECRET_ACCESS_KEY=EXAMPLE_KEY_0000000000' > example.txt
git add -A && git commit -m "docs example"
gitleaks detect --source . --no-banner --redact --log-opts="-1"; echo "exit: $?"
# → no leaks found · exit: 0  (allowlisted pattern, green)
```

## Relationship to `/assess-security`

`/assess-security` never scans for secrets (its own Notes section states this explicitly) — it evaluates authn/authz, injection, and the rest of the OWASP surface via the KB/adoption rule cascade, a judgment call. Secret detection stays fully deterministic and fully separate, so the "no LLM involved" guarantee in R6.5 is never diluted by composing it with a skill that could, in principle, miss a pattern a human didn't anticipate.

## Cross-References

- [quality-model.md](../quality-model.md) §2 (Security pillar), §4 (per-tier gate requirements) — this layer sits in the "Gate checks" row at every tier.
- `/setup-gates` — provisions the job + allowlist file.
- `/assess-security` — the judgment-call counterpart; never overlaps with this layer.
