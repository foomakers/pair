# Decision: Docs IA, Process Lifecycle Spine, Three Path Labels, Customization Dissolved

## Date

2026-10-18

## Status

Active

## Category

Process Decision

## Context

A clean-context IA review of the docs site (112 pages, 14 sections) found the v0.5 pages added next to the v0.4 structure: the same install and publish story told in four to six places, five pages stapled from a recipe plus an old page, a two-label CLI / `/pair-assistant` pattern misapplied to about forty skills, explanation filed under Reference, two automation vocabularies with no page relating them, and a lifecycle section whose nav hid the reading order the maintainer wants (#552, increment 6).

## Decision

- Slug `developer-journey` becomes `process-lifecycle`, a five-part spine: overview, `phases/` folder (induction, strategic planning, iteration, execution), analysis and refinement workflow, delivery workflow with `delivery-cycle` (the former `reference/delivery-cycle`) directly beneath it as the in-depth page, lifecycle modes with a mode x assistant matrix, skill layers, tag-driven automation. Every spine and concept page ends with one `**Next:**` link.
- Three path labels, defined once in `guides/index` and reused verbatim: **In your assistant** (any skill; the default path after install), **With pair-cli** (real CLI commands only), **With `/pair-assistant` (optional, Claude Code)** (only where asking that skill is the step). No skill is ever listed under a CLI label; `/pair-workflow-cycle`, `/pair-loop` and the batch skills are never listed under `/pair-assistant`.
- Canonical automation vocabulary is `## Autonomy` (`filter`, `until`, `prepare`, `merge`). `## Eligibility` and `## Auto-Advance` are documented only as legacy sections translated by `autonomy-policy.mjs`; the `pair-cli run` flag reference and the v0.4 to v0.5 migration page are the two places allowed to name them without the legacy qualifier.
- Customization is dissolved: team customization, template overrides, monorepo rules and the organization KB become Guides (Knowledge Base group); the templates list and the install-source forms become Reference; the package-local model becomes a Concept. The three role quickstarts merge into `getting-started/choose-your-path`.
- The organization KB has one guide and one default channel: `pair-cli scaffold-kb` plus the generated `scripts/release.sh`; npm and a GitHub Release ZIP or mirror are listed as alternatives.
- `reference/batch-engine` moves to Contributing as "Batch engine internals", story ids scrubbed. What's new stays right after Welcome for the v0.5 launch.
- Windows is stated once: supported through WSL2 or Git Bash; symlinks fall back to copies.
- Every moved or removed page gets a permanent redirect whose destination is a live page (no chains); `apps/website/lib/docs-ia.test.ts` asserts the structure, the labels, the recipe shape of every guide, the vocabulary, the captions and the redirects.

## Alternatives Considered

- Keep Customization as a top-level "Knowledge Base" section: rejected, it kept four pages telling the install story and three recommending different distribution channels.
- Move `reference/delivery-cycle` to Concepts (the review's proposal): rejected by the maintainer in favour of the lifecycle section, where the reader meets it right after the delivery workflow.
- Keep `batch-engine` in Reference, renamed: its headings carried story ids and its audience is contributors.
- A `<Paths>` MDX component for the three labels: deferred; the test enforces the convention mechanically without one.

## Consequences

- 113 pages, 11 top-level sections. CP5 and the e2e page list regenerated from the filesystem; `LIST_TARGETS_PAGES` in the staleness check shrinks to `reference/cli/examples.mdx`, the one remaining `--list-targets` transcript.
- Old URLs in release notes, issues and bookmarks follow one redirect hop.

## Related

`.pair/working/runs/story-552/552/docs-ia-review-2026-10-18.md` (the review), decision `2026-07-12-docs-website-ia-restructuring-assessment`, ADR-027 (autonomy as one owner), decision `2026-10-13-legacy-eligibility-is-unattended-only`.
