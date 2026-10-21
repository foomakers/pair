# @pair/website

## 0.5.1

### Patch Changes

- [`87b2d5b`](https://github.com/foomakers/pair/commit/87b2d5bb7adf043a8330c6b6b7e107a5aadd09e2) - `/pair-assistant` is now also pair's configuration guide ([#552](https://github.com/foomakers/pair/issues/552)):
  - Capability menu, `kb-cache` and `tokens` rows, and a Configure step that routes each configuration area (autonomy, cycle hooks, blocking severities, workflow profiles, `skipRegistries`, adoption files) to its owner, shows the diff, validates with the installed cycle scripts and writes through record-decision.
  - Docs: new pages `reference/pair-assistant`, `reference/adoption-settings`, `concepts/delivery-workflow`, `developer-journey/lifecycle-modes`; optional marketplace quickstart; "With the CLI / With `/pair-assistant`" pairs; five new diagrams; `docs:staleness` now checks the "Via" line per command and every internal `#anchor`.

- [`87b2d5b`](https://github.com/foomakers/pair/commit/87b2d5bb7adf043a8330c6b6b7e107a5aadd09e2) - Docs information architecture, per the clean-context IA review ([#552](https://github.com/foomakers/pair/issues/552)):
  - Process Lifecycle moves to the `process-lifecycle` slug as a five-part spine: overview, `phases/` (induction, strategic planning, iteration, execution), analysis and refinement workflow, delivery workflow with the delivery cycle in depth beneath it, lifecycle modes with a mode-by-assistant matrix, skill layers, tag-driven automation. Every spine and concept page ends with a Next link.
  - Three labels everywhere a step names its path: "In your assistant" (skills), "With pair-cli" (real commands), "With `/pair-assistant` (optional, Claude Code)".
  - The five stapled guides are recipes again; their tails are `reference/cli/install-sources`, `reference/cli/update-link`, `tutorials/release-testing`, `tutorials/share-ai-artifacts` and `getting-started/verify`.
  - Customization is dissolved into Guides (`customize-for-your-team`, `customize-templates`, `monorepo-rules`, one `external-kb` guide with `scaffold-kb` plus the generated release script as the default channel), Reference (`templates-catalog`) and Concepts (`package-local-adoption`). The three role quickstarts merge into `getting-started/choose-your-path`; the quickstart is install and first run only.
  - New `concepts/glossary`; `concepts/index` lists every page in groups; `reference/cli/workflows` merges into `cli/examples`; the batch engine page moves to Contributing as "Batch engine internals".
  - Contradictions fixed: fresh-card stage order, `Ready` instead of `Refined`, `## Autonomy` as the canonical automation vocabulary with `## Eligibility` and `## Auto-Advance` documented as legacy, Windows support stated once (WSL2 or Git Bash).
  - Captions say what to notice; the lifecycle diagram opens the hub and Getting Started. Redirects for every moved page; `lib/docs-ia.test.ts` guards the structure.

- [`87b2d5b`](https://github.com/foomakers/pair/commit/87b2d5bb7adf043a8330c6b6b7e107a5aadd09e2) - Guides, What's new, text cleanup ([#552](https://github.com/foomakers/pair/issues/552), increment 5b):
  - New top-level `guides` section (20 task guides plus index) after Tutorials; new `whats-new` page after Welcome.
  - Absorbed pages moved with redirects: `reference/cli/update-link`, `customization/install-from-url`, `tutorials/managing-ai-artifacts`, `tutorials/release-testing`, `getting-started/checklist`.
  - No em dash in docs content (`docs:staleness` fails on U+2014); text walls split; diagrams captioned.

- [`87b2d5b`](https://github.com/foomakers/pair/commit/87b2d5bb7adf043a8330c6b6b7e107a5aadd09e2) - Process Lifecycle docs ([#552](https://github.com/foomakers/pair/issues/552), increment 5a):
  - Nav: Process Lifecycle after Getting Started, new overview and `lifecycle-overview.svg`.
  - New pages: `developer-journey/refinement-workflow`, `developer-journey/skill-layers`, `tutorials/brainstorming`, `tutorials/refinement`, `pm-tools/custom`.
  - Moved with redirects: `concepts/delivery-workflow` to `developer-journey/delivery-workflow`; `tutorials/unattended-delivery` to `tutorials/automated-development`.
  - Lifecycle modes cover both workflows; quickstart and Getting Started put the CLI/plugin install choice first; v0.4 to v0.5 migration audited.

- [`aa2b884`](https://github.com/foomakers/pair/commit/aa2b88418ec1355bda7e5121b02cf578bc84f4b1) Thanks [@rucka](https://github.com/rucka)! - Release validation CP1-CP12 listed in `contributing/release-process` (pair repo docs; `tutorials/release-testing` stays framework-level). `docs-staleness-check` memoizes the MDX compile and heading parse per page content, so repeated `runAllChecks` calls in one vitest worker no longer re-parse the whole docs tree (cold ~1.4 s, warm ~0.2 s): fixes the `[vitest-worker]: Timeout calling "onTaskUpdate"` caused by multi-second synchronous blocks.

- [`f664ffa`](https://github.com/foomakers/pair/commit/f664ffa3a6bd4b8354c3465ddea1b58936881d75) Thanks [@rucka](https://github.com/rucka)! - Landing page restructured for v0.5: hero sub-head on the lifecycle and the three modes with the install command inline, What's new banner, pain points reworded around process ownership and independent verification, Works with lists pi and opencode with the two-tier harness line, How it works replaced by the process lifecycle (four phases, `lifecycle-overview.svg`), new Three modes, Delivery workflow and Risk tiers sections, audience tracks rerouted to Quickstart, Team path and External KB, demo poster re-cut from a terminal frame, no em dashes in copy or metadata. README first install command aligned to `npm install -g @foomakers/pair-cli`.

- [#567](https://github.com/foomakers/pair/pull/567) [`539f8a1`](https://github.com/foomakers/pair/commit/539f8a1b90b906f39011bc384d73c57f39020a68) Thanks [@rucka](https://github.com/rucka)! - Release references set to v0.5.1: landing banner, `docs/whats-new`, `docs/index`, CP1 MT-CP114 ([#562](https://github.com/foomakers/pair/issues/562)).

- Updated dependencies []:
  - @pair/brand@0.5.1

## 0.4.3

### Patch Changes

- @pair/brand@0.4.3

## 0.4.2

### Patch Changes

- @pair/brand@0.4.2

## 0.4.1

### Patch Changes

- c53b8cf: Release v0.4.1 — Website, Docs & Brand Identity

  ### Website
  - **Landing page** with brand identity, demo video, and accessible design
  - **Full-text search** powered by Orama (client-side, zero external deps)
  - **Vercel hosting** with automatic preview deploys on PRs

  ### Documentation
  - **Getting Started** guides for solo devs, teams, and organizations
  - **4 tutorials**: first project, existing project, team setup, enterprise adoption
  - **6 how-to guides**: CLI workflows, install from URL, customize KB, adopter checklist, troubleshooting, update links
  - **Reference**: CLI commands, 31 skills catalog, KB structure, configuration
  - **Customization**: how to adopt pair, customize templates, scale to teams and orgs
  - **Developer Journey**: step-by-step from induction to execution
  - **Integrations**: Claude Code, Codex, Cursor, GitHub Copilot, Windsurf
  - **PM Tools**: Filesystem, GitHub Projects, Linear
  - **Contributing**: dev setup, architecture, skills authoring, KB guidelines, release process
  - **FAQ**: 22 answers across 6 categories

  ### CLI
  - **llms.txt support**: auto-generates `.pair/llms.txt` on install/update; website serves `/llms.txt` and `/llms-full.txt` for LLM-friendly discovery
  - **New branding**: pair logo and tagline shown on every CLI command

  ### Fixes
  - Search now works correctly on all docs pages
  - Navigation no longer loops on section index pages

- Updated dependencies [c53b8cf]
  - @pair/brand@0.4.1
