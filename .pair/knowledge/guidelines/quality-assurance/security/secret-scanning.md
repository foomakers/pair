# Secret Scanning — Deterministic CI Layer

The one security control that is **not** a skill (D24). Every other security judgment call goes through `/assess-security`; a committed secret goes RED mechanically, with no LLM involved (R6.5) — an `Automation` layer in [quality-model.md](../quality-model.md)'s three-layer principle (§1) sense: it reads a scan result deterministically, zero judgment.

`/setup-gates` provisions this layer (CI gates, §4 of [quality-model.md](../quality-model.md)); it applies at **every** tier, unlike tier-scoped gates (unit tests from 🟡, integration/E2E from 🔴 only) — a secret is a secret regardless of the change's risk tier.

## Scanner Default

**gitleaks** is the KB default (adoption can swap it — see [Swapping the Scanner](#swapping-the-scanner) below). No project-specific rule lives in this document beyond that default; a project overrides it entirely in `tech/way-of-working.md`'s Custom Gate Registry, the same mechanism every other gate override in this KB uses.

## CI Job Template (GitHub Actions)

`/setup-gates` writes a job equivalent to this into the project's CI pipeline (Step 4 of that skill) — required, not tier-scoped. Two forms below — same fail-closed guarantee (a committed secret fails the build), differing only in scan scope (the Action scans the event's commit range; the binary form here scans full history); pick per the project's GitHub ownership:

**Option A — `gitleaks-action@v2`** (matches [github-actions-implementation.md](../../infrastructure/cicd-strategy/github-actions-implementation.md)). **Requires a `GITLEAKS_LICENSE` for org-owned repos** — the Action gates on it and fails before scanning if absent, regardless of public/private. A free OSS key is available at gitleaks.io; store it as a repo/org secret. Individual-owned repos don't need it.

```yaml
secret-scan:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0 # gitleaks needs history to scan the diff/commit range
    - uses: gitleaks/gitleaks-action@v2
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }} # required for org-owned repos (free OSS key at gitleaks.io)
        GITLEAKS_CONFIG: .gitleaks.toml # optional — omit to use gitleaks' own defaults
```

**Option B — the gitleaks binary directly** (no Action, no license gate — the MIT-licensed binary has no org requirement). Preferred when you can't provision a `GITLEAKS_LICENSE` secret:

```yaml
secret-scan:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0
    - name: Secret scan (gitleaks)
      run: |
        set -euo pipefail
        GITLEAKS_VERSION=8.30.1
        GITLEAKS_SHA256=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb  # from the release checksums.txt for this version/arch
        curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" -o gitleaks.tar.gz
        echo "${GITLEAKS_SHA256}  gitleaks.tar.gz" | sha256sum -c -
        tar -xzf gitleaks.tar.gz -C /usr/local/bin gitleaks
        gitleaks detect --source . --config .gitleaks.toml --no-banner --redact --exit-code 1
```

Either form exits non-zero the moment it finds a leak, which fails the job — the required-check mechanism (already how every other gate blocks a PR) is what makes the build go red; nothing about this step involves a model call or a judgment prompt.

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

The mechanism above was verified directly — reproducible with any gitleaks 8.x install. The reproduction below uses `--log-opts="-1"` to scope each check to the single commit under test, isolating the demonstration. The CI job itself scans **full history** (`gitleaks detect --source .`) against the `.gitleaks.toml` allowlist — the allowlist is exactly what keeps a known example-secret from re-failing every scan, which is what makes full-history scanning safe there:

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

This is a documented, manually-reproduced verification, not a committed automated fixture test — a
deliberate choice recorded in ADR-015's Trade-offs, not a gap: automating it would shell out to the
external `gitleaks` binary from inside this repo's own test suite, a dependency this repo does not
otherwise carry.

## Relationship to `/assess-security`

`/assess-security` never scans for secrets (its own Notes section states this explicitly) — it evaluates authn/authz, injection, and the rest of the OWASP surface via the KB/adoption rule cascade, a judgment call. Secret detection stays fully deterministic and fully separate, so the "no LLM involved" guarantee in R6.5 is never diluted by composing it with a skill that could, in principle, miss a pattern a human didn't anticipate.

## Cross-References

- [quality-model.md](../quality-model.md) §2 (Security pillar), §4 (per-tier gate requirements) — this layer sits in the "Gate checks" row at every tier.
- `/setup-gates` — provisions the job + allowlist file.
- `/assess-security` — the judgment-call counterpart; never overlaps with this layer.
