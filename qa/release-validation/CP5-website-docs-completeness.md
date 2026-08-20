# CP5 — Website Docs Completeness

**Priority**: P1
**Scope**: All doc pages return HTTP 200, version references are consistent, internal links work
**Preconditions**: Website deployed at `$BASE_URL`

---

## MT-CP501: All doc pages return 200

**Priority**: P1
**Preconditions**: None
**Category**: Website

### Steps

1. For each URL below, issue an HTTP request and check status code

**Docs Root** (1 page):
- `$BASE_URL/docs`

**Getting Started** (7 pages):
- `$BASE_URL/docs/getting-started`
- `$BASE_URL/docs/getting-started/quickstart`
- `$BASE_URL/docs/getting-started/quickstart-solo`
- `$BASE_URL/docs/getting-started/quickstart-team`
- `$BASE_URL/docs/getting-started/quickstart-org`
- `$BASE_URL/docs/getting-started/bootstrap-quick-mode`
- `$BASE_URL/docs/getting-started/checklist`

**Concepts** (12 pages):
- `$BASE_URL/docs/concepts`
- `$BASE_URL/docs/concepts/ai-assisted-sdlc`
- `$BASE_URL/docs/concepts/knowledge-base`
- `$BASE_URL/docs/concepts/skills`
- `$BASE_URL/docs/concepts/adoption-files`
- `$BASE_URL/docs/concepts/agent-integration`
- `$BASE_URL/docs/concepts/llms-txt`
- `$BASE_URL/docs/concepts/canonical-states`
- `$BASE_URL/docs/concepts/code-host`
- `$BASE_URL/docs/concepts/definition-of-ready-and-done`
- `$BASE_URL/docs/concepts/pr-state-flow`
- `$BASE_URL/docs/concepts/tag-driven-gates`

**Process Lifecycle** (5 pages):
- `$BASE_URL/docs/developer-journey`
- `$BASE_URL/docs/developer-journey/induction`
- `$BASE_URL/docs/developer-journey/strategic-planning`
- `$BASE_URL/docs/developer-journey/iteration`
- `$BASE_URL/docs/developer-journey/execution`

**Customization** (7 pages):
- `$BASE_URL/docs/customization`
- `$BASE_URL/docs/customization/adopt`
- `$BASE_URL/docs/customization/install-from-url`
- `$BASE_URL/docs/customization/team`
- `$BASE_URL/docs/customization/templates`
- `$BASE_URL/docs/customization/organization`
- `$BASE_URL/docs/customization/external-kb`

**Integrations** (7 pages):
- `$BASE_URL/docs/integrations`
- `$BASE_URL/docs/integrations/claude-code`
- `$BASE_URL/docs/integrations/cursor`
- `$BASE_URL/docs/integrations/github-copilot`
- `$BASE_URL/docs/integrations/windsurf`
- `$BASE_URL/docs/integrations/codex`
- `$BASE_URL/docs/integrations/web-cloud-environments`

**PM Tools** (5 pages):
- `$BASE_URL/docs/pm-tools`
- `$BASE_URL/docs/pm-tools/github-projects`
- `$BASE_URL/docs/pm-tools/filesystem`
- `$BASE_URL/docs/pm-tools/linear`
- `$BASE_URL/docs/pm-tools/azure-devops`

**Reference** (17 pages):
- `$BASE_URL/docs/reference`
- `$BASE_URL/docs/reference/cli/commands`
- `$BASE_URL/docs/reference/cli/examples`
- `$BASE_URL/docs/reference/cli/workflows`
- `$BASE_URL/docs/reference/cli/update-link`
- `$BASE_URL/docs/reference/specs/cli-contracts`
- `$BASE_URL/docs/reference/specs/kb-source-resolution`
- `$BASE_URL/docs/reference/skills-catalog`
- `$BASE_URL/docs/reference/guidelines-catalog`
- `$BASE_URL/docs/reference/skill-management`
- `$BASE_URL/docs/reference/kb-structure`
- `$BASE_URL/docs/reference/configuration`
- `$BASE_URL/docs/reference/batch-engine`
- `$BASE_URL/docs/reference/coupling-model`
- `$BASE_URL/docs/reference/quality-model`
- `$BASE_URL/docs/reference/quality-gates-configuration`
- `$BASE_URL/docs/reference/pair-next`

**Migrations** (2 pages):
- `$BASE_URL/docs/migrations`
- `$BASE_URL/docs/migrations/v0.4-to-v0.5`

**Support** (3 pages):
- `$BASE_URL/docs/support`
- `$BASE_URL/docs/support/general-faq`
- `$BASE_URL/docs/support/troubleshooting`

**Tutorials** (7 pages):
- `$BASE_URL/docs/tutorials`
- `$BASE_URL/docs/tutorials/first-project`
- `$BASE_URL/docs/tutorials/existing-project`
- `$BASE_URL/docs/tutorials/team-setup`
- `$BASE_URL/docs/tutorials/enterprise-adoption`
- `$BASE_URL/docs/tutorials/managing-ai-artifacts`
- `$BASE_URL/docs/tutorials/release-testing`

**Contributing** (7 pages):
- `$BASE_URL/docs/contributing`
- `$BASE_URL/docs/contributing/development-setup`
- `$BASE_URL/docs/contributing/architecture`
- `$BASE_URL/docs/contributing/writing-skills`
- `$BASE_URL/docs/contributing/writing-guidelines`
- `$BASE_URL/docs/contributing/release-process`
- `$BASE_URL/docs/contributing/writing-migration-pages`

### Expected Result

- All 80 URLs return HTTP 200
- Log any non-200 as FAIL with status code

### Notes

- Use batch `curl -sI` or WebFetch for efficiency
- Total: 80 pages

---

## MT-CP502: Version consistency in docs

**Priority**: P1
**Preconditions**: None
**Category**: Website

### Steps

1. Navigate to `$BASE_URL/docs/getting-started/quickstart`
2. Search for any version string pattern (e.g. `0.x.y`, `v0.x.y`)
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
- #225 (review): MT-CP501 page count 62 → 80 — backfilled the 18 live pages the sweep had drifted past (`/docs`, 5 Concepts, `contributing/writing-migration-pages`, `customization/external-kb`, 2 Migrations, `pm-tools/azure-devops`, 5 Reference, 2 Tutorials). The list is now asserted against the filesystem by `packages/knowledge-hub/src/conformance/web-cloud-environment.test.ts`, so a new page that is not listed here fails CI rather than silently escaping the sweep.
