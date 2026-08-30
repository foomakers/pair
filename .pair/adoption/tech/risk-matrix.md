# `tech/risk-matrix.md`

Pair's classification adoption delta. Schema and resolution rules live in the [quality model](../../knowledge/guidelines/quality-assurance/quality-model.md), §5–§6. Sections omitted here fall back to KB defaults (D21): no `## Criticality Table` and no `## Overrides` means change-risk and service-criticality resolve entirely from the KB defaults.

## Tag Projection

Active: risk

Projects only the `risk:green|yellow|red` tag family (the KB default). The full classification matrix is still computed and written to every card/PR body; `cost` (via `assess-cost`) is computed but **not** projected as a tag for now — add `cost` to the `Active:` list to start emitting `cost:*`.

## Criticality Table

| Service/Domain | Criticality |
| --- | --- |
| apps/pair-cli | Low |
| apps/website | Low |
| packages/content-ops | Low |
| packages/dev-tools | Low |
| packages/knowledge-hub | Low |
| packages/brand | Low |

Every deployable in this monorepo, explicitly. None handles money, credentials or PII, and none is a live service whose outage is visible to every user (`pair-cli` is installed and run locally; `apps/website` is a docs/marketing site, not a production app) — per quality-model §3.1's "Choosing a value" criterion, that's Low across the board. Listing every deployable also removes the file-absent Medium default and the unlisted-service conservative-High default for this repo entirely: every touched path is explicitly `Low` on this dimension, not defaulted.

## Overrides

- change-risk.dataset-mirror-pairs: a change confined to a `packages/knowledge-hub/dataset/**` source file and its guarded, mechanically-derived mirror counterpart (`.claude/skills/**`, `.claude/workflows/**`, `.claude/agents/**`, root `AGENTS.md`/`CLAUDE.md`, `.pair/knowledge/**`) counts as touching **one** module for this dimension, not two — the pair is one authored change expressed in two guarded locations (`mirror-guard`/`workflow-mirror` tests assert they stay in lockstep), not independent shared code reached by unrelated consumers. "Touches multiple modules or shared code" (quality-model §3.1) is about a change reaching genuinely independent consumers; this repo's own dataset→mirror distribution mechanism is not that.
- business-impact.trivial-diff: green — a change that is **trivial** per quality-model §6 (either every changed file is `.md`/`.mdx`, mirrors included, or every changed hunk in every changed file is comment-only, whitespace-only or formatter-output-only) resolves the **Business impact** dimension to `green` whatever subdomain the touched files belong to; one non-trivial file or hunk and the key does not apply at all, and the dimension falls back to the subdomain class. Rationale: this repo is docs-as-product, so almost every path maps to a Supporting or Core subdomain and a typo fix in a guideline inherits that subdomain's yellow/red floor purely from **where** it lives, telling us nothing about **what** it does — the same coarse-default artifact the Criticality Table and the tier-resolution downgrade were added to remove, on the one dimension neither of them reaches. The safety net is that nothing else moves: a normative KB rule edit is mechanically `.md`-only and therefore trivial by this definition, but it still reads yellow on Change/diff risk (a shared rule surface every skill resolves from), and tier is still `max()` — so the deliberately mechanical definition never buys a normative change a green tier on its own.
- tier-resolution.default-artifact-downgrade: a diff with **zero red** dimensions resolves overall tier to **green**, overriding the plain max rule (quality-model §3.2), **if and only if every yellow dimension present is Service/domain criticality and/or Business impact — never Change/diff risk, Security relevance, or Coupling balance**. Rationale: on this repo, Service-criticality and Business-impact yellows are frequently an artifact of the KB's own coarse defaults/subdomain mapping rather than a judgment about *this* diff (the reason the Criticality Table and the `Development Tooling Standards` Generic subdomain exist at all); Change-risk, Security-relevance and Coupling-balance yellows, by contrast, reflect something actually observed in the diff (shared code touched, a new external dependency, an unbalanced integration) and stay pure weakest-link, undiluted by how many other dimensions are green. A single red on ANY dimension still forces the overall tier to red/yellow as before (§3.2) — this override only ever raises a would-be-yellow toward green, never lowers a red.
