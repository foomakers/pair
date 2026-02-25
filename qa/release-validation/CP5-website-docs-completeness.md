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

**Getting Started** (5 pages):
- `$BASE_URL/docs/getting-started`
- `$BASE_URL/docs/getting-started/quickstart`
- `$BASE_URL/docs/getting-started/quickstart-solo`
- `$BASE_URL/docs/getting-started/quickstart-team`
- `$BASE_URL/docs/getting-started/quickstart-org`

**Concepts** (6 pages):
- `$BASE_URL/docs/concepts/ai-assisted-sdlc`
- `$BASE_URL/docs/concepts/knowledge-base`
- `$BASE_URL/docs/concepts/skills`
- `$BASE_URL/docs/concepts/adoption-files`
- `$BASE_URL/docs/concepts/agent-integration`
- `$BASE_URL/docs/concepts/llms-txt`

**Developer Journey** (5 pages):
- `$BASE_URL/docs/developer-journey`
- `$BASE_URL/docs/developer-journey/induction`
- `$BASE_URL/docs/developer-journey/strategic-planning`
- `$BASE_URL/docs/developer-journey/iteration`
- `$BASE_URL/docs/developer-journey/execution`

**Customization** (5 pages):
- `$BASE_URL/docs/customization`
- `$BASE_URL/docs/customization/adopt`
- `$BASE_URL/docs/customization/team`
- `$BASE_URL/docs/customization/templates`
- `$BASE_URL/docs/customization/organization`

**Integrations** (6 pages):
- `$BASE_URL/docs/integrations`
- `$BASE_URL/docs/integrations/claude-code`
- `$BASE_URL/docs/integrations/cursor`
- `$BASE_URL/docs/integrations/github-copilot`
- `$BASE_URL/docs/integrations/windsurf`
- `$BASE_URL/docs/integrations/codex`

**PM Tools** (4 pages):
- `$BASE_URL/docs/pm-tools`
- `$BASE_URL/docs/pm-tools/github-projects`
- `$BASE_URL/docs/pm-tools/filesystem`
- `$BASE_URL/docs/pm-tools/linear`

**Guides** (6 pages):
- `$BASE_URL/docs/guides/cli-workflows`
- `$BASE_URL/docs/guides/install-from-url`
- `$BASE_URL/docs/guides/customize-kb`
- `$BASE_URL/docs/guides/adopter-checklist`
- `$BASE_URL/docs/guides/troubleshooting`
- `$BASE_URL/docs/guides/update-link`

**Reference** (9 pages):
- `$BASE_URL/docs/reference/cli/commands`
- `$BASE_URL/docs/reference/cli/examples`
- `$BASE_URL/docs/reference/specs/cli-contracts`
- `$BASE_URL/docs/reference/specs/kb-source-resolution`
- `$BASE_URL/docs/reference/skills-catalog`
- `$BASE_URL/docs/reference/guidelines-catalog`
- `$BASE_URL/docs/reference/skill-management`
- `$BASE_URL/docs/reference/kb-structure`
- `$BASE_URL/docs/reference/configuration`

**Support** (3 pages):
- `$BASE_URL/docs/support`
- `$BASE_URL/docs/support/general-faq`
- `$BASE_URL/docs/support/faq`

**Tutorials** (5 pages):
- `$BASE_URL/docs/tutorials`
- `$BASE_URL/docs/tutorials/first-project`
- `$BASE_URL/docs/tutorials/existing-project`
- `$BASE_URL/docs/tutorials/team-setup`
- `$BASE_URL/docs/tutorials/enterprise-adoption`

**Contributing** (6 pages):
- `$BASE_URL/docs/contributing`
- `$BASE_URL/docs/contributing/development-setup`
- `$BASE_URL/docs/contributing/architecture`
- `$BASE_URL/docs/contributing/writing-skills`
- `$BASE_URL/docs/contributing/writing-guidelines`
- `$BASE_URL/docs/contributing/release-process`

### Expected Result

- All 60 URLs return HTTP 200
- Log any non-200 as FAIL with status code

### Notes

- Use batch `curl -sI` or WebFetch for efficiency
- Total: 60 pages

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
