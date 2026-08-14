# Decision: `tech/risk-matrix.md` gets a Criticality Table + a change-risk override — the KB defaults were producing zero `risk:green` in a month+ of real history

## Date

2026-08-14

## Status

Active

## Category

Adoption Delta

## Context

An analysis of every classified issue/PR in this repo (403 items, issues+PRs, all history) found **zero** `risk:green` — 75% yellow, 25% red among the 73 classified items. Tier resolves as `max` of 5 dimensions (quality-model §3.2), and two of the KB defaults compound against this repo specifically:

1. **Service/domain criticality** (§3.1) had no `## Criticality Table` at all, so every diff resolved to the file-absent default (**Medium**), never Low.
2. **Change/diff risk** (§3.1) triggers "touches multiple modules or shared code" (yellow) on nearly every skill change, because this repo mirrors every KB skill/guideline into TWO trees by construction (`packages/knowledge-hub/dataset/**` → `.claude/skills/**` / `.claude/workflows/**` / `.claude/agents/**` / root `AGENTS.md`/`CLAUDE.md`), guarded byte-equal by `mirror-guard`/`workflow-mirror` tests. A change to one skill mechanically touches its mirror too, so this dimension reads "shared code" for what is actually one authored change in one feature.

This repo's own `way-of-working.md` states **"High risk tolerance: quick rollbacks and fast recovery from errors"** — a stance the zero-green pattern directly contradicts. The dimensions themselves and the `max`-of-dimensions rule are correct in general (KB default, unchanged); the gap is this project's own adoption delta never having been filled in.

## Decision

1. **`## Criticality Table` added**, listing every deployable in this monorepo (`apps/pair-cli`, `apps/website`, `packages/content-ops`, `packages/dev-tools`, `packages/knowledge-hub`, `packages/brand`) at **Low** — none handles money/credentials/PII, none is a live service whose outage is visible to every user, per the "Choosing a value" criterion (quality-model §3.1). This also removes the file-absent Medium default and the unlisted-conservative-High default for this repo entirely: every touched path is now explicitly Low, never defaulted.
2. **`## Overrides` gains `change-risk.dataset-mirror-pairs`**: a change confined to a dataset source file and its guarded mirror counterpart counts as **one** module for the change-risk dimension, not two. `classify` resolves this qualitatively (it is an LLM-applied rule, not a deterministic script), so the override is worded as a rule for the classifying agent to apply, not a config key read by code.

## Alternatives Considered

- **Override the file-absent/unlisted-service KB defaults directly (e.g. "absent ⇒ Low")**: rejected — no such override key exists in the documented Overrides schema (only `change-risk.shared-paths`-style path lists and per-tier reviewer/SLA are documented); filling in the Criticality Table achieves the same outcome through an already-supported mechanism instead of inventing an unsupported one.
- **Change the KB default itself (quality-model.md)**: rejected — the KB default is a reasonable baseline for a project that hasn't stated otherwise; this repo's adoption file is exactly where a project-specific delta belongs (D21).
- **Do nothing (accept zero green as correct)**: rejected — it contradicts this repo's own declared risk tolerance and degrades the signal specifically because of this repo's own dual-tree distribution mechanism, not because of genuinely elevated risk.

## Consequences

- Future refinement/review classifications on this repo will see the service/domain-criticality dimension resolve to Low by default (previously Medium), and a dataset-only-plus-mirror change will no longer automatically read as "shared code" on the change-risk dimension.
- `risk:green` becomes reachable again for genuinely small, isolated, non-security-relevant, non-core-subdomain changes — the ceiling was never removed, only the artificial floor.
- Business impact, security relevance and coupling-balance dimensions are untouched by this change; a change that is genuinely core/security-relevant/unbalanced still resolves yellow/red on those dimensions regardless of this delta.

## Adoption Impact

- `.pair/adoption/tech/risk-matrix.md`: `## Criticality Table` and `## Overrides` sections added (previously only `## Tag Projection` existed).
- No KB/dataset change — this is a project-local adoption delta only (D21), consistent with "Adoption files override KB defaults, not the other way around."
