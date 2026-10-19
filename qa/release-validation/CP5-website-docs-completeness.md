# CP5 — Website Docs Completeness

**Priority**: P1
**Scope**: All doc pages return HTTP 200, version references are consistent, internal links work
**Channels**: final only — pre/rc deploy no website (`release.yml`). Run against a PR preview `$BASE_URL` (Vercel preview) when validating a pre/rc, otherwise mark SKIP (final-only).
**Preconditions**: Website deployed at `$BASE_URL`

---

## MT-CP501: All doc pages return 200

**Priority**: P1
**Preconditions**: None
**Category**: Website

### Steps

1. For each URL below, issue an HTTP request and check status code

**Docs Root** (2 pages):

- `$BASE_URL/docs`
- `$BASE_URL/docs/whats-new`

**Getting Started** (5 pages):

- `$BASE_URL/docs/getting-started`
- `$BASE_URL/docs/getting-started/bootstrap-quick-mode`
- `$BASE_URL/docs/getting-started/choose-your-path`
- `$BASE_URL/docs/getting-started/quickstart`
- `$BASE_URL/docs/getting-started/verify`

**Concepts** (15 pages):

- `$BASE_URL/docs/concepts`
- `$BASE_URL/docs/concepts/adoption-files`
- `$BASE_URL/docs/concepts/agent-integration`
- `$BASE_URL/docs/concepts/ai-assisted-sdlc`
- `$BASE_URL/docs/concepts/canonical-states`
- `$BASE_URL/docs/concepts/code-host`
- `$BASE_URL/docs/concepts/definition-of-ready-and-done`
- `$BASE_URL/docs/concepts/glossary`
- `$BASE_URL/docs/concepts/knowledge-base`
- `$BASE_URL/docs/concepts/llms-txt`
- `$BASE_URL/docs/concepts/package-local-adoption`
- `$BASE_URL/docs/concepts/pr-state-flow`
- `$BASE_URL/docs/concepts/review-identity`
- `$BASE_URL/docs/concepts/skills`
- `$BASE_URL/docs/concepts/tag-driven-gates`

**Process Lifecycle** (12 pages):

- `$BASE_URL/docs/process-lifecycle`
- `$BASE_URL/docs/process-lifecycle/delivery-cycle`
- `$BASE_URL/docs/process-lifecycle/delivery-workflow`
- `$BASE_URL/docs/process-lifecycle/lifecycle-modes`
- `$BASE_URL/docs/process-lifecycle/phases`
- `$BASE_URL/docs/process-lifecycle/phases/execution`
- `$BASE_URL/docs/process-lifecycle/phases/induction`
- `$BASE_URL/docs/process-lifecycle/phases/iteration`
- `$BASE_URL/docs/process-lifecycle/phases/strategic-planning`
- `$BASE_URL/docs/process-lifecycle/refinement-workflow`
- `$BASE_URL/docs/process-lifecycle/skill-layers`
- `$BASE_URL/docs/process-lifecycle/tag-driven-automation`

**Integrations** (10 pages):

- `$BASE_URL/docs/integrations`
- `$BASE_URL/docs/integrations/adding-a-harness`
- `$BASE_URL/docs/integrations/claude-code`
- `$BASE_URL/docs/integrations/codex`
- `$BASE_URL/docs/integrations/cursor`
- `$BASE_URL/docs/integrations/github-copilot`
- `$BASE_URL/docs/integrations/opencode`
- `$BASE_URL/docs/integrations/pi`
- `$BASE_URL/docs/integrations/web-cloud-environments`
- `$BASE_URL/docs/integrations/windsurf`

**PM Tools** (6 pages):

- `$BASE_URL/docs/pm-tools`
- `$BASE_URL/docs/pm-tools/azure-devops`
- `$BASE_URL/docs/pm-tools/custom`
- `$BASE_URL/docs/pm-tools/filesystem`
- `$BASE_URL/docs/pm-tools/github-projects`
- `$BASE_URL/docs/pm-tools/linear`

**Reference** (19 pages):

- `$BASE_URL/docs/reference`
- `$BASE_URL/docs/reference/adoption-settings`
- `$BASE_URL/docs/reference/cli/commands`
- `$BASE_URL/docs/reference/cli/examples`
- `$BASE_URL/docs/reference/cli/install-sources`
- `$BASE_URL/docs/reference/cli/update-link`
- `$BASE_URL/docs/reference/configuration`
- `$BASE_URL/docs/reference/coupling-model`
- `$BASE_URL/docs/reference/guidelines-catalog`
- `$BASE_URL/docs/reference/kb-structure`
- `$BASE_URL/docs/reference/pair-assistant`
- `$BASE_URL/docs/reference/pair-next`
- `$BASE_URL/docs/reference/quality-gates-configuration`
- `$BASE_URL/docs/reference/quality-model`
- `$BASE_URL/docs/reference/skill-management`
- `$BASE_URL/docs/reference/skills-catalog`
- `$BASE_URL/docs/reference/specs/cli-contracts`
- `$BASE_URL/docs/reference/specs/kb-source-resolution`
- `$BASE_URL/docs/reference/templates-catalog`

**Migrations** (2 pages):

- `$BASE_URL/docs/migrations`
- `$BASE_URL/docs/migrations/v0.4-to-v0.5`

**Support** (3 pages):

- `$BASE_URL/docs/support`
- `$BASE_URL/docs/support/general-faq`
- `$BASE_URL/docs/support/troubleshooting`

**Guides** (21 pages):

- `$BASE_URL/docs/guides`
- `$BASE_URL/docs/guides/adopt-existing-repo`
- `$BASE_URL/docs/guides/assess-security-cost-coupling`
- `$BASE_URL/docs/guides/autonomy-and-profiles`
- `$BASE_URL/docs/guides/card-states`
- `$BASE_URL/docs/guides/classify-risk`
- `$BASE_URL/docs/guides/configure-harness`
- `$BASE_URL/docs/guides/customize-for-your-team`
- `$BASE_URL/docs/guides/customize-templates`
- `$BASE_URL/docs/guides/deliver-a-card`
- `$BASE_URL/docs/guides/deliver-many-cards`
- `$BASE_URL/docs/guides/delivery-metrics`
- `$BASE_URL/docs/guides/external-kb`
- `$BASE_URL/docs/guides/hooks-and-severities`
- `$BASE_URL/docs/guides/install-via-marketplace`
- `$BASE_URL/docs/guides/join-a-pair-project`
- `$BASE_URL/docs/guides/monorepo-rules`
- `$BASE_URL/docs/guides/quality-gates`
- `$BASE_URL/docs/guides/review-identity`
- `$BASE_URL/docs/guides/tag-automation`
- `$BASE_URL/docs/guides/update-kb`

**Tutorials** (10 pages):

- `$BASE_URL/docs/tutorials`
- `$BASE_URL/docs/tutorials/automated-development`
- `$BASE_URL/docs/tutorials/brainstorming`
- `$BASE_URL/docs/tutorials/enterprise-adoption`
- `$BASE_URL/docs/tutorials/existing-project`
- `$BASE_URL/docs/tutorials/first-project`
- `$BASE_URL/docs/tutorials/refinement`
- `$BASE_URL/docs/tutorials/release-testing`
- `$BASE_URL/docs/tutorials/share-ai-artifacts`
- `$BASE_URL/docs/tutorials/team-setup`

**Contributing** (8 pages):

- `$BASE_URL/docs/contributing`
- `$BASE_URL/docs/contributing/architecture`
- `$BASE_URL/docs/contributing/batch-engine-internals`
- `$BASE_URL/docs/contributing/development-setup`
- `$BASE_URL/docs/contributing/release-process`
- `$BASE_URL/docs/contributing/writing-guidelines`
- `$BASE_URL/docs/contributing/writing-migration-pages`
- `$BASE_URL/docs/contributing/writing-skills`

### Expected Result

- All 113 URLs return HTTP 200
- Log any non-200 as FAIL with status code

### Notes

- Use batch `curl -sI` or WebFetch for efficiency
- Total: 113 pages

---

## MT-CP502: Version consistency in docs

**Priority**: P1
**Preconditions**: None
**Category**: Website

### Steps

1. Navigate to `$BASE_URL/docs/getting-started/quickstart`
2. Search for **install/version snippets only** (`npm i @foomakers/pair-cli@x.y.z`, `pair-cli --version` sample output, install URLs) — not changelog or migration history, which legitimately name older versions
3. Repeat on `$BASE_URL/docs/reference/cli/commands`

### Expected Result

- Any version references match `$VERSION`
- No stale/old version numbers visible

---

## MT-CP503: Docs entry page content

**Priority**: P1
**Preconditions**: None
**Category**: Website

### Steps

1. Navigate to `$BASE_URL/docs`
2. Inspect content

### Expected Result

- Title contains "Welcome" or equivalent
- Has navigation or links to major doc sections

---

## Changelog

- #278 (bootstrap quick mode): MT-CP501 page count 60 → 61, Getting Started 6 → 7 — added `/docs/getting-started/bootstrap-quick-mode`.
- #225 (web/cloud environments): MT-CP501 page count 61 → 62, Integrations 6 → 7 — added `/docs/integrations/web-cloud-environments`.
- #225 (review): MT-CP501 page count 62 → 80 — backfilled the 18 live pages the sweep had drifted past (`/docs`, 5 Concepts, `contributing/writing-migration-pages`, `customization/external-kb`, 2 Migrations, `pm-tools/azure-devops`, 5 Reference, 2 Tutorials). The list is now asserted against the filesystem by `packages/knowledge-hub/src/conformance/docs-page-coverage.test.ts`, so a new page that is not listed here fails CI rather than silently escaping the sweep.
- #451 (pair-cli execution adapter): MT-CP501 page count 80 → 83, Integrations 7 → 10 — added `/docs/integrations/pi`, `/docs/integrations/opencode` and `/docs/integrations/adding-a-harness` (the harness-execution layer the #450 coordination note left for this story).
- #464 (approval signal threaded into composed skills): MT-CP501 page count 83 → 84, Tutorials 7 → 8 — added `/docs/tutorials/automated-development` (configuring `tech/automation.md` and daemonizing `pair-cli run` on a dedicated box).
- #493 (consolidated delivery-cycle page): MT-CP501 page count 85 → 86, Reference 17 → 18 — added `/docs/reference/delivery-cycle`.
- #353 (operational docs): MT-CP501 page count 86 → 87, Process Lifecycle 5 → 6 — added `/docs/developer-journey/tag-driven-automation`.
- #237 (package-local adoption override): MT-CP501 page count 87 → 88, Customization 7 → 8 — added `/docs/customization/package-local-adoption`.
- #552 (increment 5a): added `developer-journey/skill-layers`, `refinement-workflow` and `delivery-workflow` (moved from Concepts), `tutorials/brainstorming` and `refinement`, `pm-tools/custom`; Concepts 14 → 13, Process Lifecycle +3, Tutorials +2, PM Tools 5 → 6.
- #543: channel note (final-only / PR preview); MT-CP502 scoped to install/version snippets.
- #552 (increment 6): MT-CP501 page count 114 → 113. Slug `developer-journey` → `process-lifecycle` with a `phases/` folder (+1 folder page, +`delivery-cycle` moved from Reference); Customization (7) dissolved into Guides (+5: `customize-for-your-team`, `join-a-pair-project`; `external-kb` merged), Reference (+3: `templates-catalog`, `cli/install-sources`, `cli/update-link`; `cli/workflows`, `delivery-cycle`, `batch-engine` removed) and Concepts (+2: `package-local-adoption`, `glossary`); Getting Started 6 → 5 (`quickstart-solo/team/org` → `choose-your-path`, +`verify`); Guides 21 → 21 (`adoption-checklist`, `release-tests` removed); Tutorials 8 → 10 (+`release-testing`, `share-ai-artifacts`); Contributing 7 → 8 (+`batch-engine-internals`).
