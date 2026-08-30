# Analysis Log: Docs-site journey-first audit — which sections lead with the problem, which lead with the config table

## Date

2026-08-30

## Status

Active

## Category

Analysis

## Context

Story [#434](https://github.com/foomakers/pair/issues/434) asks for the docs site to present a capability through the journey and use case that motivated it, rather than as a flat feature/config listing. Before rewriting anything, AC-1 requires an audit pass over `apps/website/content/docs/**` that classifies every section and ranks the offenders, so the rewrite target is chosen from evidence instead of intuition — and so the sections deliberately *left alone* are on record as deliberate rather than missed.

Two questions had to be answered by the audit and not by the rewrite: which single section this pass rewrites (the story scopes one bounded section, explicitly "not the entire docs site in one pass"), and whether reference-style material is in scope at all.

Prior art: [2026-07-12-docs-website-ia-restructuring-assessment.md](./2026-07-12-docs-website-ia-restructuring-assessment.md) settled the site's **information architecture** (#312). This audit is orthogonal — it judges the *opening move of a page*, never its placement in the tree, and reopens none of that assessment's conclusions.

## Analysis / Findings

**Method.** For each of the 11 top-level sections under `apps/website/content/docs/`, read the section `index.mdx` (and a representative leaf page) and apply AC-1's heuristic verbatim: *does the page open with a supported-options/config table or a numbered mechanism list, before stating the problem it solves?* Then grep `.pair/adoption/tech/adr/**` and `.pair/adoption/decision-log/**` for a record carrying that section's originating rationale — a section can only be rewritten journey-first if a real journey is on file.

**Ranked offender list** (worst first; ✅ = journey-first already, ❌ = feature/config-first):

| Rank | Section | Pages | Verdict | Opening move today | Sourced record for the journey |
| ---- | ------- | ----- | ------- | ------------------ | ------------------------------ |
| 1 | `pm-tools/` | 5 | ❌ feature/config-first | `index.mdx` opens on a 4-step numbered "How It Works" mechanism list, then a "Supported Options" comparison table; **three of the four provider pages open directly on `## Configuration`** (`filesystem`, `github-projects`, `azure-devops`), and the fourth (`linear`) carries a single bolded line of "why" before it. The PM/code-host split — the reason the table has a "Hosts your code?" column at all — is stated *after* the table | **Strong** — [ADR-018](../tech/adr/adr-018-code-host-optional-wow-override.md) (PM-tool/code-host conflation; a backlog tool hosting no repositories breaks it) + [2026-07-31-pm-adapter-visibility-contract.md](./2026-07-31-pm-adapter-visibility-contract.md) (why board-membership/assignee mechanics differ per adapter) |
| 2 | `integrations/` | 10 | ❌ feature/config-first | `index.mdx` states the problem in one line, then goes straight to "The Bridge Pattern" file-path block; leaf pages (e.g. `claude-code.mdx`) open on `## Prerequisites` / `## Install Channels` | Partial — the bridge pattern is explained in `concepts/agent-integration`, no ADR isolates the originating problem |
| 3 | `customization/` | 7 | ⚠️ partially journey-first | `index.mdx` *does* open with the motivating tension ("pair's KB ships with opinionated defaults. You don't have to accept all of them") and frames three stages by audience; leaf pages (e.g. `adopt.mdx`) still open on `## Prerequisites` | Weak — no single originating record; rationale is spread across install/KB decisions |
| 4 | `support/` | 3 | ⚠️ list-first, low value | opens on a Quick Links list — but it is a router page, and a journey framing would add words without adding understanding | n/a |
| — | `concepts/` | 12 | ✅ | explanation-type by construction; `index.mdx` gives a reading order, `code-host.mdx` opens on the two-tools problem before the field | n/a |
| — | `developer-journey/` | 5 | ✅ | opens on what the lifecycle is and why you don't have to memorise it — **this is the style template the rewrite follows** | n/a |
| — | `getting-started/` | 7 | ✅ | opens "Code is the easy part" — problem, then the three components | n/a |
| — | `tutorials/` | 8 | ✅ | learning-oriented by type; opens on what a tutorial is for and how it differs from a quickstart | n/a |
| — | `migrations/` | 2 | ✅ | opens on why the section exists (no skill contains migration logic) before the per-version pages | n/a |
| — | `contributing/` | 7 | ✅ | opens on ways to contribute, audience-framed | n/a |
| — | `reference/` | 11 | **excluded by design** | opens "Look-up material: complete, factual, no narrative" — see below | n/a |

**`reference/` is excluded, not ranked.** Its own index page declares its Diátaxis type in its first line, and a reference page is *supposed* to be lookup-first: a reader arrives knowing what they need. Rewriting it as a journey would make the site worse, not better. This is AC-1's explicit exclusion, recorded here with that rationale so a later pass does not "fix" it.

**No section was found where a journey had to be invented.** Rank 1 is the only offender with a first-class recorded origin, which is exactly why it is rank 1: AC-3 forbids citing a record that does not exist, so the section with the strongest sourcing is the one that can be rewritten with real citations rather than reconstructed prose. Ranks 2–3 would require reconstructing rationale from code/PR history and flagging it as such — real work, but not this pass's.

## Recommendation

1. **Rewrite `pm-tools/**` this pass** (5 pages), leading each page with the sourced problem — ADR-018 for the site-wide split on `index.mdx`, and per provider the specific quirk that follows from it (`filesystem`/`linear` host no code and must declare a `code-host`; `github-projects`/`azure-devops` need no declaration at all). Every existing table, config block and prerequisite list is preserved and moved beneath the narrative, never deleted (story Business Rules).
2. **Do not rewrite `integrations/` or `customization/`** now. They are the next-pass candidates; each needs its rationale reconstructed and flagged as reconstructed, which is a separate unit of work.
3. **Never rewrite `reference/**`** — record the exclusion rather than re-litigating it each pass.
4. **No IA change.** `meta.json`, page URLs and navigation stay byte-identical; this is a prose-only concern, and #312's conclusions are not reopened.

This analysis concludes in content changes only — no ADR/ADL is warranted, because nothing about the system's structure or a project convention changes. The scope call it records (one section per pass, `reference/` permanently out) is what a future pass reads back.

## Consequences

- The docs site now has a stated, evidence-backed criterion for "this page opens badly": the AC-1 heuristic, applied and recorded per section, rather than a per-reviewer opinion.
- `integrations/` and `customization/` are on record as known offenders with no owner yet — a future story picks them up from this table instead of re-running the audit.
- The rewrite is bounded to citations that exist: any future journey-first pass on a section with no recorded origin must state the problem in its own words and flag it as reconstructed, never manufacture an ADR reference.
- `reference/**` is protected from a well-meaning future rewrite by a written rationale.

## Adoption Impact

No adoption file holds a current-state summary for docs-site page rhetoric — the pages under `apps/website/content/docs/**` *are* the current state, and the KB's writing guidance covers KB files, not the marketing/docs site. Nothing under `.pair/adoption/tech/` is pertinent, so this record is the durable artifact and the rewritten pages carry the outcome. This mirrors the placement of the earlier [docs-website IA assessment](./2026-07-12-docs-website-ia-restructuring-assessment.md), which is likewise a `decision-log/` record with no adoption-file summary.
