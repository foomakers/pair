# Docs Website — Information Architecture Assessment

**Scope:** `apps/website/content/docs/**` (69 `.mdx` pages, 12 sections + root), navigation (`meta.json` files), cross-links, entry points, and drift risk vs. the knowledge base.
**Framework:** Fumadocs (`fumadocs-core`/`fumadocs-mdx`/`fumadocs-ui`) on Next.js — nav is folder-based, ordered by per-folder `meta.json`; a folder without an `index.mdx` is sidebar-only (its direct URL 404s).
**Status:** Proposal only. Recommendation: **Option A** (targeted consolidation, see below).

---

## 1. Current-state inventory

```text
content/docs/
├── index.mdx                     1 page   "Welcome" — thin (15 lines), no outbound links
├── getting-started/              5 pages  What is pair?, Quickstart, + solo/team/org variants
├── developer-journey/            5 pages  The 4-level process lifecycle (induction → execution)
├── concepts/                     7 pages  SDLC, KB, skills, adoption files, canonical states,
│                                          agent integration, llms.txt — NO index.mdx
├── customization/                5 pages  Adopt → customize (team) → publish (org) → templates
├── integrations/                 6 pages  One page per AI agent (Claude Code, Codex, Cursor, …)
├── pm-tools/                     4 pages  One page per PM backend (filesystem, GH Projects, Linear)
├── guides/                       7 pages  Grab-bag: cli-workflows, install-from-url, customize-kb,
│                                          adopter-checklist, packaging, troubleshooting,
│                                          update-link — NO index.mdx
├── migrations/                   2 pages  Version-jump prompts (v0.4→v0.5)
├── tutorials/                    7 pages  End-to-end walkthroughs (first-project, team-setup, …)
├── reference/                   10 pages  cli/ (commands, examples), specs/ (2), catalogs (2),
│                                          kb-structure, configuration, quality-model,
│                                          skill-management — NO index.mdx (nor cli/, specs/)
├── support/                      3 pages  index, general-faq ("FAQ"), faq ("Installation FAQ")
└── contributing/                 7 pages  Dev setup, architecture, writing skills/guidelines/
                                           migration pages, release process
```

Total: **69 pages**. Root `meta.json` orders 13 sidebar entries in two groups (learn: getting-started → pm-tools; use/reference: guides → contributing) separated by `---`.

Entry points: the marketing landing page links to `/docs` (root Welcome), `/docs/customization/team`, `/docs/customization/organization` (`app/(landing)/`). `llms.txt` / `llms-full.txt` are generated from the source loader (`lib/get-llm-text.ts`) so they follow the tree automatically.

Staleness gate (`apps/website/lib/docs-staleness-check.ts`) covers exactly: skill count + skill rows in `reference/skills-catalog.mdx`, command anchors in `reference/cli/commands.mdx`, and `pair-cli <cmd>` references in `tutorials/*.mdx`. Nothing else.

### Audience-journey read

- **First-run user:** `getting-started/` is solid (overview + quickstart + 3 variants), but the actual `/docs` entry (Welcome) is a dead end — the good hub is one level down at `getting-started/index.mdx`.
- **Adopting team:** the journey is split across four sections with no principled boundary — `customization/` (adopt/team/org/templates), `guides/` (customize-kb, install-from-url, packaging, adopter-checklist), `pm-tools/`, `integrations/`. Half the KB-lifecycle tasks live in `customization/`, the other half in `guides/`, with pairwise duplication (see F4, F7, F8).
- **Contributor/maintainer:** `contributing/` + `reference/specs/` + `migrations/` serve this well; the weak spot is `reference/` mixing catalogs, config reference, and long-form explanation (`skill-management.mdx`).

---

## 2. Findings

| # | Severity | Lens | Finding |
|---|----------|------|---------|
| F1 | Major | Findability | **`/docs` root is a dead end.** `content/docs/index.mdx` is 15 lines with zero links; the landing page's docs CTA points here. Every journey starts with a sidebar hunt. The real overview already exists at `getting-started/index.mdx` ("What is pair?"). |
| F2 | Major | Findability | **8 broken internal links to index-less section URLs.** `concepts/`, `guides/`, `reference/` have no `index.mdx`, so their URLs 404 under Fumadocs, yet pages link to them: `/docs/concepts` ← `tutorials/index.mdx`, `tutorials/first-project.mdx`, `tutorials/existing-project.mdx`; `/docs/guides` ← `tutorials/index.mdx`, `tutorials/first-project.mdx`, `tutorials/team-setup.mdx`, `tutorials/enterprise-adoption.mdx`; `/docs/reference` ← `tutorials/index.mdx`. |
| F3 | Major | Consistency / Audience fit | **`guides/` is a grab-bag.** Seven unrelated pages spanning three audiences: adopter recipes (`customize-kb`, `adopter-checklist`), KB-publisher ops (`packaging`, `install-from-url`, `update-link`), CLI usage (`cli-workflows`), and support content (`troubleshooting`). No index page, no shared theme, no principled rule for what lands here vs. `customization/` or `reference/`. |
| F4 | Major | Redundancy | **Two overlapping troubleshooting/FAQ pages.** `support/faq.mdx` ("Installation FAQ", 361 lines) and `guides/troubleshooting.mdx` (236 lines) both cover permission errors, Node version issues, PATH/command-not-found — with different fixes recommended (e.g. npm-permissions vs. nvm). They cross-link each other. Guaranteed drift. |
| F5 | Major | Redundancy / Staleness | **Hardcoded skill counts have already drifted, and the gate doesn't see them.** Actual count: 35. Docs say **30** (`getting-started/index.mdx:18`), **32** (`developer-journey/index.mdx:43,120`, `developer-journey/execution.mdx:123`, `reference/kb-structure.mdx:124`), **34** (`reference/guidelines-catalog.mdx:160`). The gate then only checked `reference/skills-catalog.mdx`. |
| F6 | Major | Findability / Consistency | **Duplicate sidebar titles and undifferentiated parallel tracks.** "Team Setup" appears twice (`getting-started/quickstart-team.mdx` and `tutorials/team-setup.mdx`). The quickstart triad (solo/team/org) and the tutorial triad (first-project/team-setup/enterprise-adoption) are intentionally parallel (quick vs. deep) but their titles don't signal which is which. |
| F7 | Major | Redundancy | **KB packaging documented twice.** `guides/packaging.mdx` (125 lines) and the "Package for Distribution" / "Verify Your Package" sections of `customization/organization.mdx` (221 lines) describe the same `pair-cli package` procedure and layout modes. |
| F8 | Minor | Redundancy | **`guides/customize-kb.mdx`** (63-line recipe) restates the core of `customization/team.mdx` (identify → override → verify) and links to it. Fine as a recipe, wrong as a sibling section. |
| F9 | Minor | Consistency | **Inverted FAQ file naming.** `support/faq.mdx` is titled "Installation FAQ"; `support/general-faq.mdx` is titled "FAQ". Filename and content are swapped relative to reader expectation. |
| F10 | Minor | Consistency | **Section label vs. page title mismatch.** Sidebar says "Developer Journey"; its index page is titled "Process Lifecycle". Pick one. |
| F11 | Minor | Consistency | **Inconsistent section index coverage.** 8 sections have an index page; `concepts/`, `guides/`, `reference/` (and `reference/cli/`, `reference/specs/`) don't. This is the root cause of F2. |
| F12 | Minor | Findability | **`concepts/llms-txt.mdx` has zero inbound cross-links** — reachable only via sidebar. |
| F13 | Minor | Consistency / Growth | **CLI documentation is split across sections.** `guides/cli-workflows.mdx` (305 lines) and `guides/update-link.mdx` (338 lines, single-command deep dive) are CLI docs stranded outside `reference/cli/`; `reference/skill-management.mdx` (272 lines) is half explanation, half reference. |
| F14 | Minor | Growth | **New content has no principled home.** Integrations, PM tools, migrations scale cleanly (one page per item). But any new task-oriented page defaults to `guides/`, reinforcing the grab-bag. 13 top-level nav entries is already at the upper bound of scannable. |

What is genuinely **fine** and should not be touched: `integrations/`, `pm-tools/`, `migrations/` (clean one-page-per-item patterns), `contributing/` (coherent, complete), `tutorials/` (well differentiated internally), `developer-journey/` content, and the two-group sidebar split.

---

## 3. Proposed target structure (Option A — recommended)

**Principle:** keep the 11 sections that work; dissolve `guides/` into the sections its pages actually belong to; make every section URL resolvable; fix the two duplication hotspots by merging.

```text
content/docs/
├── index.mdx                     REWRITE: real hub — cards to the 4 journeys + top tasks
├── getting-started/
│   ├── index.mdx                 keep ("What is pair?")
│   ├── quickstart.mdx            keep
│   ├── quickstart-solo.mdx       keep — retitle "Quickstart: Solo"
│   ├── quickstart-team.mdx       keep — retitle "Quickstart: Team"      (fixes F6)
│   ├── quickstart-org.mdx        keep — retitle "Quickstart: Organization"
│   └── checklist.mdx             ← guides/adopter-checklist (post-setup verification)
├── tutorials/                    unchanged (7 pages)
├── concepts/
│   ├── index.mdx                 NEW: one-paragraph map of the 7 concepts   (fixes F2/F11)
│   └── …                         7 existing pages unchanged
├── developer-journey/            unchanged — align title: "Process Lifecycle" everywhere (F10)
├── customization/                becomes the single home of the KB lifecycle
│   ├── index.mdx                 keep (adopt → customize → publish narrative)
│   ├── adopt.mdx                 keep
│   ├── install-from-url.mdx      ← guides/install-from-url (advanced install sources)
│   ├── team.mdx                  keep — absorbs guides/customize-kb as "Quick recipe" section
│   ├── organization.mdx          keep — absorbs guides/packaging (dedupe, keep layout-modes
│   │                             detail as a subsection)                    (fixes F7/F8)
│   └── templates.mdx             keep
├── integrations/                 unchanged (6 pages)
├── pm-tools/                     unchanged (4 pages)
├── ─── (separator)
├── reference/
│   ├── index.mdx                 NEW: what's in reference, links to catalogs/specs (F2/F11)
│   ├── cli/
│   │   ├── commands.mdx          keep (staleness-gate anchor — do not move)
│   │   ├── examples.mdx          keep
│   │   ├── workflows.mdx         ← guides/cli-workflows                     (fixes F13)
│   │   └── update-link.mdx       ← guides/update-link
│   ├── specs/                    unchanged (2 pages)
│   └── …                         6 existing pages unchanged
├── migrations/                   unchanged (2 pages)
├── support/
│   ├── index.mdx                 keep (update quick links)
│   ├── general-faq.mdx           keep URL — remains the general "FAQ"
│   └── troubleshooting.mdx       NEW: merge of guides/troubleshooting + support/faq
│                                 (single install/setup problem-solving page) (fixes F4/F9)
└── contributing/                 unchanged (7 pages)
```

`guides/` is **deleted** as a section. Top-level nav: 13 → 12 entries. Proposed root `meta.json` order: `index, getting-started, tutorials, concepts, developer-journey, customization, integrations, pm-tools, ---, reference, migrations, support, contributing` (tutorials promoted next to getting-started — they are the learn path, not an appendix).

### Page-by-page mapping (all 69 pages)

| Current path (`content/docs/…`) | Disposition |
|---|---|
| `index.mdx` | keep — **rewrite** as hub with links (F1) |
| `getting-started/index.mdx` | keep |
| `getting-started/quickstart.mdx` | keep |
| `getting-started/quickstart-solo.mdx` | keep — retitle "Quickstart: Solo" |
| `getting-started/quickstart-team.mdx` | keep — retitle "Quickstart: Team" |
| `getting-started/quickstart-org.mdx` | keep — retitle "Quickstart: Organization" |
| `developer-journey/index.mdx` | keep — unify title with sidebar label |
| `developer-journey/induction.mdx` | keep |
| `developer-journey/strategic-planning.mdx` | keep |
| `developer-journey/iteration.mdx` | keep |
| `developer-journey/execution.mdx` | keep — fix skill count |
| `concepts/ai-assisted-sdlc.mdx` | keep |
| `concepts/knowledge-base.mdx` | keep |
| `concepts/skills.mdx` | keep |
| `concepts/adoption-files.mdx` | keep |
| `concepts/canonical-states.mdx` | keep |
| `concepts/agent-integration.mdx` | keep |
| `concepts/llms-txt.mdx` | keep — add inbound links (from concepts index + kb-structure) |
| *(new)* `concepts/index.mdx` | **new page** |
| `customization/index.mdx` | keep |
| `customization/adopt.mdx` | keep |
| `customization/team.mdx` | keep — absorbs customize-kb recipe |
| `customization/organization.mdx` | keep — absorbs packaging content |
| `customization/templates.mdx` | keep |
| `guides/adopter-checklist.mdx` | **move** → `getting-started/checklist.mdx` |
| `guides/cli-workflows.mdx` | **move** → `reference/cli/workflows.mdx` |
| `guides/customize-kb.mdx` | **merge-into** `customization/team.mdx` |
| `guides/install-from-url.mdx` | **move** → `customization/install-from-url.mdx` |
| `guides/packaging.mdx` | **merge-into** `customization/organization.mdx` |
| `guides/troubleshooting.mdx` | **merge-into** `support/troubleshooting.mdx` (new) |
| `guides/update-link.mdx` | **move** → `reference/cli/update-link.mdx` |
| `integrations/index.mdx` | keep |
| `integrations/claude-code.mdx` | keep |
| `integrations/codex.mdx` | keep |
| `integrations/cursor.mdx` | keep |
| `integrations/github-copilot.mdx` | keep |
| `integrations/windsurf.mdx` | keep |
| `pm-tools/index.mdx` | keep |
| `pm-tools/filesystem.mdx` | keep |
| `pm-tools/github-projects.mdx` | keep |
| `pm-tools/linear.mdx` | keep |
| `migrations/index.mdx` | keep |
| `migrations/v0.4-to-v0.5.mdx` | keep |
| `tutorials/index.mdx` | keep — fix `/docs/guides`, `/docs/concepts`, `/docs/reference` links |
| `tutorials/first-project.mdx` | keep — fix section links |
| `tutorials/existing-project.mdx` | keep — fix section links |
| `tutorials/team-setup.mdx` | keep — fix `/docs/guides` link |
| `tutorials/enterprise-adoption.mdx` | keep — fix `/docs/guides` link |
| `tutorials/managing-ai-artifacts.mdx` | keep |
| `tutorials/release-testing.mdx` | keep |
| `reference/cli/commands.mdx` | keep (gate anchor — path frozen) |
| `reference/cli/examples.mdx` | keep |
| `reference/specs/cli-contracts.mdx` | keep |
| `reference/specs/kb-source-resolution.mdx` | keep |
| `reference/configuration.mdx` | keep |
| `reference/guidelines-catalog.mdx` | keep — fix skill count |
| `reference/kb-structure.mdx` | keep — fix skill count |
| `reference/quality-model.mdx` | keep |
| `reference/skill-management.mdx` | keep (splitting explanation vs. reference: deferred, low value) |
| `reference/skills-catalog.mdx` | keep (gate anchor — path frozen) |
| *(new)* `reference/index.mdx` | **new page** |
| `support/index.mdx` | keep — update quick links |
| `support/general-faq.mdx` | keep — remains "FAQ" (URL kept; rename to `faq` deferred, F9 accepted as cosmetic) |
| `support/faq.mdx` | **merge-into** `support/troubleshooting.mdx` (new) |
| `contributing/index.mdx` | keep |
| `contributing/development-setup.mdx` | keep |
| `contributing/architecture.mdx` | keep |
| `contributing/writing-skills.mdx` | keep |
| `contributing/writing-guidelines.mdx` | keep |
| `contributing/writing-migration-pages.mdx` | keep |
| `contributing/release-process.mdx` | keep |

Nothing is deleted outright: 7 moves/merges, 3 new pages (root rewrite counts as rewrite), 60 keeps. Every current URL that changes gets a redirect (below).

---

## 4. Alternatives considered

### Option B — hygiene only (lighter touch)

Fix F1, F2, F5, F6, F10, F11, F12 without moving any page: rewrite the root hub, add `concepts/index.mdx`, `guides/index.mdx`, `reference/index.mdx`, fix counts + extend the gate, retitle the quickstart variants. Merge only the FAQ/troubleshooting pair (F4) since that is active drift.

- **Pro:** no redirects except one, ~1 day total, zero URL churn.
- **Con:** `guides/` grab-bag and the packaging/customize-kb duplication (F3, F7, F8, F13) remain; a `guides/index.mdx` would legitimize the grab-bag and new pages will keep accreting there.

### Option C — full Diátaxis re-org (heavier)

Top-level = Tutorials / How-to / Explanation / Reference; every section re-parented.

- **Pro:** textbook IA.
- **Con:** every URL changes (69-entry redirect map), landing page + e2e tests + external links + `llms.txt` consumers all churn; the current sections *already* map ~1:1 onto Diátaxis (tutorials=tutorials, concepts=explanation, reference=reference) — the only real offender is `guides/`, which Option A fixes surgically. Cost far exceeds benefit.

**Recommendation: Option A.** It removes every Major finding, changes only 7 URLs, and leaves the healthy 70% of the tree untouched. If you want to defer, Option B batch 1 below is a strict subset of Option A — no wasted work.

---

## 5. Migration notes

**Redirects** — add a `redirects()` block to `apps/website/next.config.mjs` (none exists today), permanent:

| From | To |
|---|---|
| `/docs/guides/adopter-checklist` | `/docs/getting-started/checklist` |
| `/docs/guides/cli-workflows` | `/docs/reference/cli/workflows` |
| `/docs/guides/customize-kb` | `/docs/customization/team` |
| `/docs/guides/install-from-url` | `/docs/customization/install-from-url` |
| `/docs/guides/packaging` | `/docs/customization/organization` |
| `/docs/guides/troubleshooting` | `/docs/support/troubleshooting` |
| `/docs/guides/update-link` | `/docs/reference/cli/update-link` |
| `/docs/support/faq` | `/docs/support/troubleshooting` |
| `/docs/guides` | `/docs` (section removed) |

**Cross-link updates** — inbound links into moved pages (from the link audit): `guides/install-from-url` ← 4 links (`tutorials/managing-ai-artifacts` ×2, `customization/adopt`, `customization/organization`); `guides/customize-kb` ← 5; `guides/troubleshooting` ← 4; `guides/cli-workflows` ← 3; `guides/update-link` ← 2; `guides/adopter-checklist` ← 1; `guides/packaging` ← 0; `support/faq` ← 5. Plus the 8 broken section links (F2). A repo-wide grep for `/docs/guides` and `/docs/support/faq` catches all of it.

**Docs-staleness gate** (`apps/website/lib/docs-staleness-check.ts`):

- Unaffected by Option A moves: its anchors (`reference/skills-catalog.mdx`, `reference/cli/commands.mdx`, `tutorials/`) keep their paths — this is why `commands.mdx` and `skills-catalog.mdx` are frozen in the mapping.
- **Extend it** (batch 1): run the `(\d+)\s+(?:pair\s+)?skills` count check across *all* of `content/docs/**/*.mdx`, not just the catalog — that turns F5 from recurring drift into a CI failure. Optionally add a dead-internal-link check (resolve `](/docs/...)` targets against the source loader), which would have caught F2.

**Other touchpoints:** `llms.txt`/`llms-full.txt` regenerate from the source loader — no action. `e2e/docs.e2e.test.ts` hardcodes `getting-started/*` URLs (unchanged) but asserts sidebar titles "Solo Setup"/"Team Setup"/"Organization Setup" — update assertions when retitling (batch 1). Landing page links (`/docs`, `/docs/customization/team`, `/docs/customization/organization`) all survive unchanged.

### Suggested batching (small PRs, each independently shippable)

| Batch | Content | Effort |
|---|---|---|
| 1. Hygiene (no URL changes) | Rewrite root hub; add `concepts/index.mdx` + `reference/index.mdx`; fix 8 broken section links; fix 6 stale skill counts; extend staleness gate; retitle quickstart variants + align developer-journey title; update e2e title assertions; add llms-txt inbound links | ~0.5 day |
| 2. Support consolidation | Merge `support/faq.mdx` + `guides/troubleshooting.mdx` → `support/troubleshooting.mdx`; redirects; update 9 inbound links; update `support/index.mdx` | ~0.5 day |
| 3. Dissolve `guides/` | 4 moves + 2 content merges (`customize-kb`→team, `packaging`→organization); delete `guides/meta.json`; redirects; update ~15 inbound links; update root `meta.json` (drop guides, promote tutorials) | ~1 day |
| 4. (Optional, deferred) | Split `reference/skill-management.mdx` explanation/reference; rename `support/general-faq.mdx` → `faq.mdx` | ~0.5 day — recommend skipping unless it itches |

Total for Option A: **~2 days** across 3 PRs. Batch 1 alone = Option B and is worth doing regardless of the go/no-go on batches 2–3.
