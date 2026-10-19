import { test, expect } from '@playwright/test'

// ============================================================
// E2E: Docs — User journey tests for Getting Started + Concepts
// Verifies ACs by navigating through docs as a real user would.
// ============================================================

test('quickstart journey: overview → quickstart with content verification', async ({ page }) => {
  // AC-12: sidebar shows both sections
  await page.goto('/docs/getting-started')
  await expect(page.locator('body')).toContainText('Getting Started')
  await expect(page.locator('body')).toContainText('Concepts')

  // AC-1: overview page: the three components, then the lifecycle diagram, before any install step
  await expect(page.locator('h1')).toContainText('What is pair?')
  await expect(page).toHaveTitle(/What is pair/)
  await expect(page.locator('main')).toContainText('Knowledge Base')
  await expect(page.locator('main')).toContainText('Skills')
  await expect(page.locator('main')).toContainText('Adoption files')
  await expect(page.locator('main img[src*="lifecycle-overview"]')).toHaveCount(1)

  // Navigate to Quickstart via sidebar
  await page
    .locator('a', { hasText: /^Quickstart$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/getting-started/quickstart')

  // AC-2: install + verify + first command steps (#552 increment 6: install and first run only)
  const main = page.locator('main')
  await expect(main).toContainText('Prerequisites')
  await expect(main).toContainText('Node.js 18')
  await expect(main).toContainText('npm install -g @foomakers/pair-cli')
  await expect(main).toContainText('pnpm add -g @foomakers/pair-cli')
  await expect(main).toContainText('pair-cli --version')
  await expect(main).toContainText('pair-cli install')
  await expect(main).toContainText('GitHub Releases')
  await expect(main).toContainText('Run your first skill')
  await expect(main).toContainText('/pair-next')
  await expect(main).toContainText('pair-cli update')
  // US-552: optional marketplace path, CLI stays default
  await expect(main).toContainText('With the Claude Code plugin (optional)')
  await expect(main).toContainText('/pair-assistant')
  await expect(main).toContainText('--skip-registries agents')

  // AC-3: no broken .md links
  const hrefs = await main
    .locator('a')
    .evaluateAll(els => els.map(el => el.getAttribute('href')).filter(Boolean))
  expect(hrefs.filter(h => h && h.endsWith('.md'))).toHaveLength(0)
})

test('choose-your-path and verify: one page per audience, one checklist (#552)', async ({
  page,
}) => {
  await page.goto('/docs/getting-started/choose-your-path')
  const main = page.locator('main')
  await expect(page.locator('main h1')).toContainText('Solo, team or organization')
  await expect(main).toContainText('Solo')
  await expect(main).toContainText('Team')
  await expect(main).toContainText('Organization')
  await expect(main.locator('a[href="/docs/guides/customize-for-your-team"]').first()).toBeVisible()
  await expect(main.locator('a[href="/docs/guides/external-kb"]').first()).toBeVisible()
  await expect(main.locator('a[href="/docs/getting-started/quickstart"]').first()).toBeVisible()

  await page.goto('/docs/getting-started/verify')
  await expect(page.locator('main h1')).toContainText('Verify your setup')
  await expect(main).toContainText('pair-cli --version')
  await expect(main).toContainText('pair-cli kb-validate')
  await expect(main).not.toContainText('verify.sh')
})

test('concepts journey: navigate through concept pages via sidebar', async ({ page }) => {
  // AC-7: concepts section accessible — start at first concept
  await page.goto('/docs/concepts/ai-assisted-sdlc')
  await expect(page.locator('main h1')).toContainText('AI-Assisted SDLC')

  // Navigate to Knowledge Base via sidebar
  await page.locator('a', { hasText: 'Knowledge Base' }).first().click()
  await expect(page).toHaveURL('/docs/concepts/knowledge-base')

  // AC-8: KB structure explained
  const main = page.locator('main')
  await expect(main).toContainText('knowledge/')
  await expect(main).toContainText('adoption/')
  await expect(main).toContainText('Knowledge vs. Adoption')
  await expect(main).toContainText('.pair/')

  // Navigate to Skills via sidebar
  await page
    .locator('a', { hasText: /^Skills$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/concepts/skills')

  // AC-9: Agent Skills standard, categories, composition
  await expect(main).toContainText('Agent Skills')
  await expect(main.locator('a[href="https://agentskills.io"]').first()).toBeVisible()
  await expect(main).toContainText('Process Skills')
  await expect(main).toContainText('Capability Skills')
  await expect(main).toContainText('Composition')

  // Navigate to Agent Integration via sidebar
  await page.locator('a', { hasText: 'Agent Integration' }).first().click()
  await expect(page).toHaveURL('/docs/concepts/agent-integration')
  await expect(page.locator('main h1')).toContainText('Agent Integration')
})

test('smoke: all docs pages return 200 with correct titles', async ({ page }) => {
  // AC-7 + AC-11 + frontmatter
  const pages = [
    { url: '/docs/getting-started', title: 'What is pair?' },
    { url: '/docs/getting-started/quickstart', title: 'Quickstart' },
    { url: '/docs/getting-started/bootstrap-quick-mode', title: 'Bootstrap: guided or quick' },
    { url: '/docs/getting-started/choose-your-path', title: 'Solo, team or organization' },
    { url: '/docs/getting-started/verify', title: 'Verify your setup' },
    { url: '/docs/concepts/ai-assisted-sdlc', title: 'AI-Assisted SDLC' },
    { url: '/docs/concepts/knowledge-base', title: 'Knowledge Base' },
    { url: '/docs/concepts/skills', title: 'Skills' },
    { url: '/docs/concepts/adoption-files', title: 'Adoption Files' },
    { url: '/docs/concepts/agent-integration', title: 'Agent Integration' },
  ]
  for (const { url, title } of pages) {
    const response = await page.goto(url)
    expect(response?.status(), `${url} should return 200`).toBe(200)
    await expect(page.locator('main h1')).toBeVisible()
    await expect(page).toHaveTitle(new RegExp(title))
  }
})

// ============================================================
// E2E: Docs — Guides, Reference, and Support sections (#124)
// ============================================================

test('moved pages: render at their new locations', async ({ page }) => {
  const main = page.locator('main')

  await page.goto('/docs/reference/cli/install-sources')
  await expect(page.locator('main h1')).toContainText('Install sources')
  await expect(main).toContainText('--offline')

  await page.goto('/docs/reference/cli/update-link')
  await expect(page.locator('main h1')).toContainText('update-link')
  await expect(main).toContainText('--dry-run')

  await page.goto('/docs/guides/external-kb')
  await expect(page.locator('main h1')).toContainText('Own and publish a Knowledge Base')
  await expect(main).toContainText('scaffold-kb')

  await page.goto('/docs/guides/update-kb')
  await expect(page.locator('main h1')).toContainText('Update the Knowledge Base')

  await page.goto('/docs/process-lifecycle/delivery-cycle')
  await expect(page.locator('main h1')).toContainText('The delivery cycle in depth')

  await page.goto('/docs/contributing/batch-engine-internals')
  await expect(page.locator('main h1')).toContainText('Batch engine internals')
})

test('redirects: old FAQ/troubleshooting URLs land on support/troubleshooting', async ({
  page,
}) => {
  await page.goto('/docs/support/faq')
  await expect(page).toHaveURL('/docs/support/troubleshooting')
  await expect(page.locator('main h1')).toContainText('Troubleshooting')

  await page.goto('/docs/guides/troubleshooting')
  await expect(page).toHaveURL('/docs/support/troubleshooting')
  await expect(page.locator('main h1')).toContainText('Troubleshooting')
})

test('redirects: moved and dissolved URLs land on live pages, one hop', async ({ page }) => {
  const redirects = [
    { from: '/docs/guides/adopter-checklist', to: '/docs/getting-started/verify' },
    { from: '/docs/guides/cli-workflows', to: '/docs/reference/cli/examples' },
    { from: '/docs/guides/customize-kb', to: '/docs/guides/customize-for-your-team' },
    { from: '/docs/guides/install-from-url', to: '/docs/reference/cli/install-sources' },
    { from: '/docs/guides/packaging', to: '/docs/guides/external-kb' },
    { from: '/docs/guides/update-link', to: '/docs/reference/cli/update-link' },
    { from: '/docs/customization/install-from-url', to: '/docs/reference/cli/install-sources' },
    { from: '/docs/tutorials/managing-ai-artifacts', to: '/docs/tutorials/share-ai-artifacts' },
    { from: '/docs/getting-started/checklist', to: '/docs/getting-started/verify' },
    // #552 increment 6
    { from: '/docs/developer-journey', to: '/docs/process-lifecycle' },
    { from: '/docs/developer-journey/iteration', to: '/docs/process-lifecycle/phases/iteration' },
    {
      from: '/docs/developer-journey/lifecycle-modes',
      to: '/docs/process-lifecycle/lifecycle-modes',
    },
    { from: '/docs/reference/delivery-cycle', to: '/docs/process-lifecycle/delivery-cycle' },
    { from: '/docs/reference/batch-engine', to: '/docs/contributing/batch-engine-internals' },
    { from: '/docs/reference/cli/workflows', to: '/docs/reference/cli/examples' },
    { from: '/docs/customization', to: '/docs/guides' },
    { from: '/docs/customization/adopt', to: '/docs/getting-started/quickstart' },
    { from: '/docs/customization/team', to: '/docs/guides/customize-for-your-team' },
    { from: '/docs/customization/templates', to: '/docs/guides/customize-templates' },
    { from: '/docs/customization/organization', to: '/docs/guides/external-kb' },
    { from: '/docs/customization/external-kb', to: '/docs/guides/external-kb' },
    {
      from: '/docs/customization/package-local-adoption',
      to: '/docs/concepts/package-local-adoption',
    },
    { from: '/docs/getting-started/quickstart-solo', to: '/docs/getting-started/choose-your-path' },
    { from: '/docs/getting-started/quickstart-team', to: '/docs/getting-started/choose-your-path' },
    { from: '/docs/getting-started/quickstart-org', to: '/docs/getting-started/choose-your-path' },
    { from: '/docs/guides/adoption-checklist', to: '/docs/getting-started/verify' },
    { from: '/docs/guides/release-tests', to: '/docs/tutorials/release-testing' },
  ]
  for (const { from, to } of redirects) {
    await page.goto(from)
    await expect(page, `${from} should redirect to ${to}`).toHaveURL(to)
    await expect(page.locator('main h1')).toBeVisible()
  }
})

test('reference section: navigate CLI, specs, and top-level pages', async ({ page }) => {
  // CLI commands page
  await page.goto('/docs/reference/cli/commands')
  const main = page.locator('main')
  await expect(page.locator('main h1')).toContainText('CLI Commands')
  await expect(main).toContainText('install')
  await expect(main).toContainText('update')
  await expect(main).toContainText('package')

  // Navigate to examples via sidebar
  await page
    .locator('a', { hasText: /^CLI Help Examples$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/reference/cli/examples')
  await expect(main).toContainText('Installation Workflows')

  // Skills catalog page
  await page.goto('/docs/reference/skills-catalog')
  await expect(page.locator('main h1')).toContainText('Skills Catalog')
  await expect(main).toContainText('Process Skills')
  await expect(main).toContainText('Capability Skills')
  await expect(main).toContainText('/pair-process-implement')

  // KB structure page
  await page.goto('/docs/reference/kb-structure')
  await expect(page.locator('main h1')).toContainText('KB Structure')
  await expect(main).toContainText('knowledge/')
  await expect(main).toContainText('adoption/')

  // Configuration page
  await page.goto('/docs/reference/configuration')
  await expect(page.locator('main h1')).toContainText('Configuration')
  await expect(main).toContainText('config.json')
  await expect(main).toContainText('mirror')

  // Skill management page
  await page.goto('/docs/reference/skill-management')
  await expect(page.locator('main h1')).toContainText('Skill Management')
  await expect(main).toContainText('Skill Resolution')
  await expect(main).toContainText('Transformation Pipeline')
  await expect(main).toContainText('Renaming Conventions')
})

test('support section: navigate and verify content', async ({ page }) => {
  await page.goto('/docs/support')
  const main = page.locator('main')

  // Support index page
  await expect(page.locator('main h1')).toContainText('Support')
  await expect(main).toContainText('Support Scope')
  await expect(main).toContainText('GitHub Issues')

  // Navigate to general FAQ via sidebar
  await page.locator('a', { hasText: /^FAQ$/ }).first().click()
  await expect(page).toHaveURL('/docs/support/general-faq')
  await expect(page.locator('main h1')).toContainText('FAQ')
  await expect(main).toContainText('Getting Started')
  await expect(main).toContainText('Process & Skills')
  await expect(main).toContainText('Languages & Tech Stack')
  await expect(main).toContainText('Project Management')
  await expect(main).toContainText('Customization')

  // Navigate to Troubleshooting via sidebar (merged Installation FAQ + guides troubleshooting)
  await page.locator('a', { hasText: 'Troubleshooting' }).first().click()
  await expect(page).toHaveURL('/docs/support/troubleshooting')
  await expect(page.locator('main h1')).toContainText('Troubleshooting')
  await expect(main).toContainText('Permission Issues')
  await expect(main).toContainText('Node Version Issues')
})

test('smoke: all guides/reference/support pages return 200', async ({ page }) => {
  const pages = [
    { url: '/docs/reference/cli/install-sources', title: 'Install sources' },
    { url: '/docs/reference/cli/update-link', title: 'update-link' },
    { url: '/docs/guides/external-kb', title: 'Own and publish a Knowledge Base' },
    { url: '/docs/guides/update-kb', title: 'Update the Knowledge Base' },
    { url: '/docs/reference/cli/commands', title: 'CLI Commands' },
    { url: '/docs/reference/cli/examples', title: 'CLI Help Examples' },
    { url: '/docs/reference/specs/cli-contracts', title: 'CLI Contracts' },
    { url: '/docs/reference/specs/kb-source-resolution', title: 'KB Source Resolution' },
    { url: '/docs/reference/skills-catalog', title: 'Skills Catalog' },
    { url: '/docs/reference/guidelines-catalog', title: 'Guidelines' },
    { url: '/docs/reference/skill-management', title: 'Skill Management' },
    { url: '/docs/reference/kb-structure', title: 'KB Structure' },
    { url: '/docs/reference/configuration', title: 'Configuration' },
    { url: '/docs/support', title: 'Support' },
    { url: '/docs/support/general-faq', title: 'FAQ' },
    { url: '/docs/support/troubleshooting', title: 'Troubleshooting' },
  ]
  for (const { url, title } of pages) {
    const response = await page.goto(url)
    expect(response?.status(), `${url} should return 200`).toBe(200)
    await expect(page.locator('main h1')).toBeVisible()
    await expect(page).toHaveTitle(new RegExp(title))
  }
})

test('no broken .md links in guides/reference/support sections', async ({ page }) => {
  const sections = [
    '/docs/reference/cli/examples',
    '/docs/reference/cli/commands',
    '/docs/reference/skills-catalog',
    '/docs/support',
  ]
  for (const url of sections) {
    await page.goto(url)
    const hrefs = await page
      .locator('main a')
      .evaluateAll(els => els.map(el => el.getAttribute('href')).filter(Boolean))
    const brokenMdLinks = hrefs.filter(h => h && h.endsWith('.md'))
    expect(brokenMdLinks, `${url} should have no .md links`).toHaveLength(0)
  }
})

// ============================================================
// E2E: Docs — Developer Journey section + Guidelines Catalog (#125)
// ============================================================

test('process lifecycle: overview → induction → execution', async ({ page }) => {
  // Overview: the four parts, /pair-next, where to start, one next table
  await page.goto('/docs/process-lifecycle')
  const main = page.locator('main')
  await expect(page.locator('main h1')).toContainText('Process Lifecycle')
  await expect(main).toContainText('/pair-next')
  await expect(main).toContainText('The four parts')
  await expect(main).toContainText('Where to start')
  await expect(main).toContainText('What to read next')
  await expect(main.locator('img[src*="lifecycle-overview"]')).toHaveCount(1)

  // Sidebar shows Process Lifecycle section
  await expect(page.locator('body')).toContainText('Process Lifecycle')

  // Induction, reached from the overview's own table
  await main.locator('a[href="/docs/process-lifecycle/phases/induction"]').first().click()
  await expect(page).toHaveURL('/docs/process-lifecycle/phases/induction')
  await expect(main).toContainText('/pair-process-specify-prd')
  await expect(main).toContainText('/pair-process-bootstrap')
  await expect(main).toContainText('/pair-process-plan-initiatives')

  // Execution
  await page.goto('/docs/process-lifecycle/phases/execution')
  await expect(main).toContainText('/pair-process-implement')
  await expect(main).toContainText('/pair-process-review')
  await expect(main).toContainText('TDD Discipline')

  // Links to reference catalogs
  await expect(main.locator('a[href="/docs/reference/skills-catalog"]').first()).toBeVisible()
  await expect(main.locator('a[href="/docs/reference/guidelines-catalog"]').first()).toBeVisible()
})

test('smoke: all developer journey pages return 200', async ({ page }) => {
  const pages = [
    { url: '/docs/process-lifecycle', title: 'Process Lifecycle' },
    { url: '/docs/process-lifecycle/phases/induction', title: 'Induction' },
    { url: '/docs/process-lifecycle/phases/strategic-planning', title: 'Strategic Planning' },
    { url: '/docs/process-lifecycle/phases/iteration', title: 'Iteration' },
    { url: '/docs/process-lifecycle/phases/execution', title: 'Execution' },
    { url: '/docs/process-lifecycle/phases', title: 'Phases' },
    { url: '/docs/process-lifecycle/delivery-cycle', title: 'The delivery cycle in depth' },
    { url: '/docs/process-lifecycle/lifecycle-modes', title: 'Lifecycle modes' },
    { url: '/docs/process-lifecycle/tag-driven-automation', title: 'Tag-driven automation' },
  ]
  for (const { url, title } of pages) {
    const response = await page.goto(url)
    expect(response?.status(), `${url} should return 200`).toBe(200)
    await expect(page.locator('main h1')).toBeVisible()
    await expect(page).toHaveTitle(new RegExp(title))
  }
})

test('guidelines catalog: categories and how-to listing', async ({ page }) => {
  await page.goto('/docs/reference/guidelines-catalog')
  const main = page.locator('main')

  // Page renders with expected structure
  await expect(page.locator('main h1')).toContainText('Guidelines')
  await expect(main).toContainText('How-To Guides')
  await expect(main).toContainText('Guideline Categories')

  // 9 guideline categories present
  await expect(main).toContainText('Architecture')
  await expect(main).toContainText('Code Design')
  await expect(main).toContainText('Collaboration')
  await expect(main).toContainText('Infrastructure')
  await expect(main).toContainText('Observability')
  await expect(main).toContainText('Quality Assurance')
  await expect(main).toContainText('Technical Standards')
  await expect(main).toContainText('Testing')
  await expect(main).toContainText('User Experience')

  // How-to guides listed with skill references
  await expect(main).toContainText('Create a PRD')
  await expect(main).toContainText('/pair-process-specify-prd')
  await expect(main).toContainText('Code Review')
  await expect(main).toContainText('/pair-process-review')
})

// ============================================================
// E2E: Docs — Guides section, Knowledge Base group (#125, #552)
// ============================================================

test('guides journey: index defines the three paths → team KB guide → org KB guide', async ({
  page,
}) => {
  await page.goto('/docs/guides')
  const main = page.locator('main')
  await expect(page.locator('main h1')).toContainText('Guides')
  await expect(main).toContainText('In your assistant')
  await expect(main).toContainText('With pair-cli')
  await expect(main).toContainText('/pair-assistant')

  await main.locator('a[href="/docs/guides/customize-for-your-team"]').first().click()
  await expect(page).toHaveURL('/docs/guides/customize-for-your-team')
  await expect(page.locator('main h1')).toContainText('Customize the Knowledge Base for your team')
  await expect(main).toContainText('Adoption always wins')
  await expect(main).toContainText('pair-cli update')

  await page.goto('/docs/guides/external-kb')
  await expect(page.locator('main h1')).toContainText('Own and publish a Knowledge Base')
  await expect(main).toContainText('scripts/release.sh')
  await expect(main).toContainText('npm')
})

test('smoke: knowledge-base guides and their reference and concept pages return 200 with correct titles', async ({
  page,
}) => {
  const pages = [
    {
      url: '/docs/guides/customize-for-your-team',
      title: 'Customize the Knowledge Base for your team',
    },
    { url: '/docs/guides/customize-templates', title: 'Customize templates' },
    { url: '/docs/guides/monorepo-rules', title: 'Package-local rules in a monorepo' },
    { url: '/docs/guides/join-a-pair-project', title: 'Join a project that already uses pair' },
    { url: '/docs/reference/templates-catalog', title: 'Templates catalog' },
    { url: '/docs/concepts/package-local-adoption', title: 'Package-local adoption' },
    { url: '/docs/concepts/glossary', title: 'Glossary' },
  ]
  for (const { url, title } of pages) {
    const response = await page.goto(url)
    expect(response?.status(), `${url} should return 200`).toBe(200)
    await expect(page.locator('main h1')).toBeVisible()
    await expect(page).toHaveTitle(new RegExp(title))
  }
})

// ============================================================
// ============================================================
// E2E: Docs — Integrations + PM Tools sections (#126)
// ============================================================

test('integrations journey: index → Claude Code → Copilot with content verification', async ({
  page,
}) => {
  // Integrations index page
  await page.goto('/docs/integrations')
  const main = page.locator('main')
  await expect(page.locator('main h1')).toContainText('AI Coding Tools')
  await expect(main).toContainText('Bridge Pattern')
  await expect(main).toContainText('Agent Skills')
  await expect(main.locator('a[href="https://agentskills.io"]').first()).toBeVisible()

  // All 5 tools listed
  await expect(main).toContainText('Claude Code')
  await expect(main).toContainText('Cursor')
  await expect(main).toContainText('GitHub Copilot')
  await expect(main).toContainText('Windsurf')
  await expect(main).toContainText('Codex')

  // Sidebar shows Integrations section
  await expect(page.locator('body')).toContainText('Integrations')

  // Navigate to Claude Code guide
  await page
    .locator('a', { hasText: /^Claude Code$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/integrations/claude-code')

  // 5-section template verified
  await expect(main).toContainText('Prerequisites')
  await expect(main).toContainText('Configure Agent File')
  await expect(main).toContainText('Use Skills')
  await expect(main).toContainText('Workflow Tips')
  await expect(main).toContainText('Verify It Works')
  await expect(main).toContainText('AGENTS.md')
  await expect(main).toContainText('CLAUDE.md')
  await expect(main).toContainText('/pair-next')

  // Navigate to GitHub Copilot guide via sidebar
  await page
    .locator('a', { hasText: /^GitHub Copilot$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/integrations/github-copilot')
  await expect(main).toContainText('Prerequisites')
  await expect(main).toContainText('.github/agents/')
  await expect(main).toContainText('product-manager')
  await expect(main).toContainText('staff-engineer')
  await expect(main).toContainText('product-engineer')
})

test('pm tools journey: index → GitHub Projects → Filesystem with content verification', async ({
  page,
}) => {
  // PM Tools index page
  await page.goto('/docs/pm-tools')
  const main = page.locator('main')
  await expect(page.locator('main h1')).toContainText('Project Management Tools')
  await expect(main).toContainText('way-of-working.md')
  await expect(main).toContainText('Mapping Model')

  // All 4 options listed
  await expect(main).toContainText('Filesystem')
  await expect(main).toContainText('GitHub Projects')
  await expect(main).toContainText('Linear')
  await expect(main).toContainText('Azure DevOps')

  // Sidebar shows PM Tools section
  await expect(page.locator('body')).toContainText('PM Tools')

  // Navigate to GitHub Projects guide
  await page
    .locator('a', { hasText: /^GitHub Projects$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/pm-tools/github-projects')

  // 3-section template verified
  await expect(main).toContainText('Configuration')
  await expect(main).toContainText('Mapping Model')
  await expect(main).toContainText('First-Run Example')
  await expect(main).toContainText('way-of-working.md')
  await expect(main).toContainText('initiative')
  await expect(main).toContainText('user story')

  // Navigate to Filesystem guide via sidebar
  await page
    .locator('a', { hasText: /^Filesystem$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/pm-tools/filesystem')
  await expect(main).toContainText('Configuration')
  await expect(main).toContainText('zero-PM-dependency')
  await expect(main).toContainText('backlog/')
})

// ============================================================
// E2E: llms.txt routes (#127)
// ============================================================

test('llms.txt returns text/plain with llmstxt.org format', async ({ page }) => {
  const response = await page.request.get('/llms.txt')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/plain')

  const body = await response.text()
  expect(body).toMatch(/^# pair\n/)
  expect(body).toContain('> AI-assisted software development')
  // Contains at least one section with links
  expect(body).toMatch(/## .+\n\n- \[.+\]\(https:\/\/pair\.foomakers\.com\/docs\//)
})

test('llms-full.txt returns text/plain with full content', async ({ page }) => {
  const response = await page.request.get('/llms-full.txt')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/plain')

  const body = await response.text()
  expect(body).toMatch(/^# pair\n/)
  expect(body).toContain('> AI-assisted software development')
  // Full version contains page content (not just links)
  expect(body).toContain('Source: https://pair.foomakers.com/docs/')
  expect(body).toContain('---')
  // Full version should be larger than index
  const indexResponse = await page.request.get('/llms.txt')
  const indexBody = await indexResponse.text()
  expect(body.length).toBeGreaterThan(indexBody.length)
})

test('smoke: all integrations + pm-tools pages return 200', async ({ page }) => {
  const pages = [
    { url: '/docs/integrations', title: 'AI Coding Tools' },
    { url: '/docs/integrations/claude-code', title: 'Claude Code' },
    { url: '/docs/integrations/codex', title: 'Codex' },
    { url: '/docs/integrations/cursor', title: 'Cursor' },
    { url: '/docs/integrations/github-copilot', title: 'GitHub Copilot' },
    { url: '/docs/integrations/opencode', title: 'opencode' },
    { url: '/docs/integrations/pi', title: 'pi' },
    { url: '/docs/integrations/adding-a-harness', title: 'Adding a Harness' },
    { url: '/docs/integrations/web-cloud-environments', title: 'Web and Cloud Environments' },
    { url: '/docs/integrations/windsurf', title: 'Windsurf' },
    { url: '/docs/pm-tools', title: 'Project Management Tools' },
    { url: '/docs/pm-tools/azure-devops', title: 'Azure DevOps' },
    { url: '/docs/pm-tools/filesystem', title: 'Filesystem' },
    { url: '/docs/pm-tools/github-projects', title: 'GitHub Projects' },
    { url: '/docs/pm-tools/linear', title: 'Linear' },
  ]
  for (const { url, title } of pages) {
    const response = await page.goto(url)
    expect(response?.status(), `${url} should return 200`).toBe(200)
    await expect(page.locator('main h1')).toBeVisible()
    await expect(page).toHaveTitle(new RegExp(title))
  }
})

// ============================================================
// E2E: Docs — Contributing section (#129)
// ============================================================

test('contributing journey: index → development-setup → architecture → writing-skills → writing-guidelines → release-process', async ({
  page,
}) => {
  // Contributing index page
  await page.goto('/docs/contributing')
  const main = page.locator('main')
  await expect(page.locator('main h1')).toContainText('How to Contribute')
  await expect(main).toContainText('Ways to contribute')
  await expect(main).toContainText('Pull request process')
  await expect(main).toContainText('Expectations')

  // Sidebar shows Contributing section
  await expect(page.locator('body')).toContainText('Contributing')

  // Navigate to Development Setup via sidebar
  await page
    .locator('a', { hasText: /^Development Setup$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/contributing/development-setup')
  await expect(page.locator('main h1')).toContainText('Development Setup')
  await expect(main).toContainText('Prerequisites')
  await expect(main).toContainText('pnpm install')
  await expect(main).toContainText('pnpm quality-gate')
  await expect(main).toContainText('Husky')

  // Navigate to Architecture via sidebar
  await page
    .locator('a', { hasText: /^Architecture$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/contributing/architecture')
  await expect(page.locator('main h1')).toContainText('Architecture')
  await expect(main).toContainText('Monorepo layout')
  await expect(main).toContainText('@pair/pair-cli')
  await expect(main).toContainText('@pair/knowledge-hub')
  await expect(main).toContainText('Data flow')

  // Navigate to Writing Skills via sidebar
  await page
    .locator('a', { hasText: /^Writing Skills$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/contributing/writing-skills')
  await expect(page.locator('main h1')).toContainText('Writing Skills')
  await expect(main).toContainText('Agent Skills')
  await expect(main).toContainText('SKILL.md anatomy')
  await expect(main).toContainText('Composition model')
  await expect(main.locator('a[href="https://agentskills.io"]').first()).toBeVisible()

  // Navigate to Writing Guidelines via sidebar
  await page
    .locator('a', { hasText: /^Writing Guidelines$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/contributing/writing-guidelines')
  await expect(page.locator('main h1')).toContainText('Writing Guidelines')
  await expect(main).toContainText('KB structure overview')
  await expect(main).toContainText('Guideline categories')
  await expect(main).toContainText('Cross-referencing conventions')

  // Navigate to Release Process via sidebar
  await page
    .locator('a', { hasText: /^Release Process$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/contributing/release-process')
  await expect(page.locator('main h1')).toContainText('Release Process')
  await expect(main).toContainText('Changesets')
  await expect(main).toContainText('version.yml')
  await expect(main).toContainText('Release artifacts')
})

test('smoke: all contributing pages return 200 with correct titles', async ({ page }) => {
  const pages = [
    { url: '/docs/contributing', title: 'How to Contribute' },
    { url: '/docs/contributing/development-setup', title: 'Development Setup' },
    { url: '/docs/contributing/architecture', title: 'Architecture' },
    { url: '/docs/contributing/writing-skills', title: 'Writing Skills' },
    { url: '/docs/contributing/writing-guidelines', title: 'Writing Guidelines' },
    { url: '/docs/contributing/release-process', title: 'Release Process' },
    { url: '/docs/contributing/batch-engine-internals', title: 'Batch engine internals' },
  ]
  for (const { url, title } of pages) {
    const response = await page.goto(url)
    expect(response?.status(), `${url} should return 200`).toBe(200)
    await expect(page.locator('main h1')).toBeVisible()
    await expect(page).toHaveTitle(new RegExp(title))
  }
})

// ============================================================
// E2E: Docs — Tutorials section (#130)
// ============================================================

test('tutorials journey: index → first-project → existing-project via sidebar', async ({
  page,
}) => {
  // Tutorials index page
  await page.goto('/docs/tutorials')
  const main = page.locator('main')
  await expect(page.locator('main h1')).toContainText('Tutorials')
  await expect(main).toContainText('Pick your tutorial')
  await expect(main).toContainText('Your First Project')
  await expect(main).toContainText('Existing Project')
  await expect(main).toContainText('Team Setup')
  await expect(main).toContainText('Enterprise Adoption')
  await expect(main).toContainText('How tutorials differ from other docs')

  // Sidebar shows Tutorials section
  await expect(page.locator('body')).toContainText('Tutorials')

  // Navigate to First Project via sidebar
  await page
    .locator('a', { hasText: /^Your First Project$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/tutorials/first-project')
  await expect(page.locator('main h1')).toContainText('Your First Project')
  await expect(main).toContainText('Prerequisites')
  await expect(main).toContainText('pair-cli install')
  await expect(main).toContainText('/pair-next')
  await expect(main).toContainText('/pair-process-specify-prd')
  await expect(main).toContainText('/pair-process-bootstrap')

  // Navigate to Existing Project via sidebar
  await page
    .locator('a', { hasText: /Existing Project/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/tutorials/existing-project')
  await expect(page.locator('main h1')).toContainText('Adopting pair on an Existing Project')
  await expect(main).toContainText('Reverse-engineer')
  await expect(main).toContainText('Phase 1: Codebase Analysis')
  await expect(main).toContainText('Phase 2: Present findings')
  await expect(main).toContainText('Phase 3: Ask me to confirm')
})

test('smoke: all tutorials pages return 200 with correct titles', async ({ page }) => {
  const pages = [
    { url: '/docs/tutorials', title: 'Tutorials' },
    { url: '/docs/tutorials/first-project', title: 'Your First Project' },
    { url: '/docs/tutorials/existing-project', title: 'Adopting pair on an Existing Project' },
    { url: '/docs/tutorials/team-setup', title: 'Team Setup' },
    { url: '/docs/tutorials/enterprise-adoption', title: 'Enterprise Adoption' },
    { url: '/docs/tutorials/automated-development', title: 'Automated development' },
    { url: '/docs/tutorials/brainstorming', title: 'Brainstorming' },
    { url: '/docs/tutorials/refinement', title: 'Refinement' },
    { url: '/docs/tutorials/release-testing', title: 'Release testing' },
    { url: '/docs/tutorials/share-ai-artifacts', title: 'Share AI artifacts' },
  ]
  for (const { url, title } of pages) {
    const response = await page.goto(url)
    expect(response?.status(), `${url} should return 200`).toBe(200)
    await expect(page.locator('main h1')).toBeVisible()
    await expect(page).toHaveTitle(new RegExp(title))
  }
})

// ============================================================
// E2E: Docs — Hub + section indexes (#312)
// ============================================================

test('smoke: docs hub returns 200 with journey links and top tasks', async ({ page }) => {
  const response = await page.goto('/docs')
  expect(response?.status(), '/docs should return 200').toBe(200)
  await expect(page).toHaveTitle(/Welcome/)
  await expect(page.locator('main h1')).toContainText('Welcome')

  const main = page.locator('main')
  await expect(main).toContainText('Pick your journey')
  await expect(main.locator('a[href="/docs/getting-started"]').first()).toBeVisible()
  await expect(main.locator('a[href="/docs/tutorials"]').first()).toBeVisible()
  await expect(main.locator('a[href="/docs/reference"]').first()).toBeVisible()
  await expect(main).toContainText('Top tasks')
})

test('smoke: concepts and reference section indexes return 200 with headings', async ({ page }) => {
  const pages = [
    { url: '/docs/concepts', title: 'Concepts' },
    { url: '/docs/reference', title: 'Reference' },
  ]
  for (const { url, title } of pages) {
    const response = await page.goto(url)
    expect(response?.status(), `${url} should return 200`).toBe(200)
    await expect(page.locator('main h1')).toContainText(title)
    await expect(page).toHaveTitle(new RegExp(title))
  }
})

// ============================================================
// E2E: Search — Orama client-side search
// ============================================================

/**
 * `goto` resolves at `load`, but React attaches the global shortcut listener only AFTER hydration; a shortcut sent in
 * between is lost and the dialog never opens (the one-off 30s timeout). Wait for the app's own readiness signal.
 */
async function openSearch(page: import('@playwright/test').Page) {
  await page.goto('/docs')
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await page.keyboard.press('Meta+k')
}

test('search: open dialog, type query, verify results appear', async ({ page }) => {
  // Open search dialog via keyboard shortcut (once the app is hydrated)
  await openSearch(page)
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()

  // Type a search query
  const searchInput = dialog.locator('input')
  await searchInput.fill('quickstart')

  // Wait for results to appear — results are <button> elements in a scrollable container
  const results = dialog.locator('.border-t > button')
  await expect(results.first()).toBeVisible({ timeout: 10000 })

  // Verify multiple results returned
  const count = await results.count()
  expect(count).toBeGreaterThan(0)
})

test('search: on a slow CPU the shortcut still opens the dialog (root cause of the one-off 30s timeout: sent before hydration attached the listener)', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 })
  await openSearch(page)
  await expect(page.locator('[role="dialog"] input')).toBeVisible({ timeout: 5000 })
})

test('search: results update when query changes', async ({ page }) => {
  // Open search dialog
  await openSearch(page)
  const dialog = page.locator('[role="dialog"]')
  const searchInput = dialog.locator('input')

  // Search for "tutorial"
  await searchInput.fill('tutorial')
  const results = dialog.locator('.border-t > button')
  await expect(results.first()).toBeVisible({ timeout: 10000 })

  // Verify tutorial-related results
  const allText = await dialog.innerText()
  expect(allText.toLowerCase()).toContain('tutorial')
})

test('search: empty query shows no results', async ({ page }) => {
  // Open search dialog (once hydrated — see openSearch)
  await openSearch(page)
  const dialog = page.locator('[role="dialog"]')
  const searchInput = dialog.locator('input')

  // Verify input is empty and no result buttons
  await expect(searchInput).toHaveValue('')
  const resultButtons = dialog.locator('.border-t > button')
  await expect(resultButtons).toHaveCount(0)
})

// ============================================================
// E2E: Navigation integrity — no circular prev/next links
// ============================================================

test('no circular prev/next footer links on any docs page', async ({ page }) => {
  const allPages = [
    // Every routable page on disk; `docs-page-coverage.test.ts` asserts this list equals the
    // filesystem, so a page added without a line here fails red there.
    '/docs',
    '/docs/concepts',
    '/docs/concepts/adoption-files',
    '/docs/concepts/agent-integration',
    '/docs/concepts/ai-assisted-sdlc',
    '/docs/concepts/canonical-states',
    '/docs/concepts/code-host',
    '/docs/concepts/definition-of-ready-and-done',
    '/docs/concepts/glossary',
    '/docs/concepts/knowledge-base',
    '/docs/concepts/llms-txt',
    '/docs/concepts/package-local-adoption',
    '/docs/concepts/pr-state-flow',
    '/docs/concepts/review-identity',
    '/docs/concepts/skills',
    '/docs/concepts/tag-driven-gates',
    '/docs/contributing',
    '/docs/contributing/architecture',
    '/docs/contributing/batch-engine-internals',
    '/docs/contributing/development-setup',
    '/docs/contributing/release-process',
    '/docs/contributing/writing-guidelines',
    '/docs/contributing/writing-migration-pages',
    '/docs/contributing/writing-skills',
    '/docs/getting-started',
    '/docs/getting-started/bootstrap-quick-mode',
    '/docs/getting-started/choose-your-path',
    '/docs/getting-started/quickstart',
    '/docs/getting-started/verify',
    '/docs/guides',
    '/docs/guides/adopt-existing-repo',
    '/docs/guides/assess-security-cost-coupling',
    '/docs/guides/autonomy-and-profiles',
    '/docs/guides/card-states',
    '/docs/guides/classify-risk',
    '/docs/guides/configure-harness',
    '/docs/guides/customize-for-your-team',
    '/docs/guides/customize-templates',
    '/docs/guides/deliver-a-card',
    '/docs/guides/deliver-many-cards',
    '/docs/guides/delivery-metrics',
    '/docs/guides/external-kb',
    '/docs/guides/hooks-and-severities',
    '/docs/guides/install-via-marketplace',
    '/docs/guides/join-a-pair-project',
    '/docs/guides/monorepo-rules',
    '/docs/guides/quality-gates',
    '/docs/guides/review-identity',
    '/docs/guides/tag-automation',
    '/docs/guides/update-kb',
    '/docs/integrations',
    '/docs/integrations/adding-a-harness',
    '/docs/integrations/claude-code',
    '/docs/integrations/codex',
    '/docs/integrations/cursor',
    '/docs/integrations/github-copilot',
    '/docs/integrations/opencode',
    '/docs/integrations/pi',
    '/docs/integrations/web-cloud-environments',
    '/docs/integrations/windsurf',
    '/docs/migrations',
    '/docs/migrations/v0.4-to-v0.5',
    '/docs/pm-tools',
    '/docs/pm-tools/azure-devops',
    '/docs/pm-tools/custom',
    '/docs/pm-tools/filesystem',
    '/docs/pm-tools/github-projects',
    '/docs/pm-tools/linear',
    '/docs/process-lifecycle',
    '/docs/process-lifecycle/delivery-cycle',
    '/docs/process-lifecycle/delivery-workflow',
    '/docs/process-lifecycle/lifecycle-modes',
    '/docs/process-lifecycle/phases',
    '/docs/process-lifecycle/phases/execution',
    '/docs/process-lifecycle/phases/induction',
    '/docs/process-lifecycle/phases/iteration',
    '/docs/process-lifecycle/phases/strategic-planning',
    '/docs/process-lifecycle/refinement-workflow',
    '/docs/process-lifecycle/skill-layers',
    '/docs/process-lifecycle/tag-driven-automation',
    '/docs/reference',
    '/docs/reference/adoption-settings',
    '/docs/reference/cli/commands',
    '/docs/reference/cli/examples',
    '/docs/reference/cli/install-sources',
    '/docs/reference/cli/update-link',
    '/docs/reference/configuration',
    '/docs/reference/coupling-model',
    '/docs/reference/guidelines-catalog',
    '/docs/reference/kb-structure',
    '/docs/reference/pair-assistant',
    '/docs/reference/pair-next',
    '/docs/reference/quality-gates-configuration',
    '/docs/reference/quality-model',
    '/docs/reference/skill-management',
    '/docs/reference/skills-catalog',
    '/docs/reference/specs/cli-contracts',
    '/docs/reference/specs/kb-source-resolution',
    '/docs/reference/templates-catalog',
    '/docs/support',
    '/docs/support/general-faq',
    '/docs/support/troubleshooting',
    '/docs/tutorials',
    '/docs/tutorials/automated-development',
    '/docs/tutorials/brainstorming',
    '/docs/tutorials/enterprise-adoption',
    '/docs/tutorials/existing-project',
    '/docs/tutorials/first-project',
    '/docs/tutorials/refinement',
    '/docs/tutorials/release-testing',
    '/docs/tutorials/share-ai-artifacts',
    '/docs/tutorials/team-setup',
    '/docs/whats-new',
  ]

  const circular: string[] = []
  let footerLinksSeen = 0

  for (const url of allPages) {
    await page.goto(url)

    // Scoped to the actual footer nav cards (`bg-fd-card`), never to a bare text match.
    // `a:has-text("Next")` — substring, case-insensitive — also matches the sidebar entry for
    // ANY page whose slug contains "next" (e.g. "pair-next Arguments"), which is present on
    // every page in this section and sits earlier in the DOM than the real footer link. `.first()`
    // then silently returns the SIDEBAR href instead of the footer's, on every page in the
    // section — not just this one. It only ever surfaced as a visible failure on
    // `/docs/reference/pair-next` itself, where the wrong (sidebar) href happens to equal the
    // page's own URL; every other page in this section was a false negative this check never
    // caught. Discovered when this backfill first swept `/docs/reference/pair-next` — MT-CP1006
    // territory, but on the test harness itself, not the site.

    // `bg-fd-card` alone is not unique to the footer: fumadocs' in-article <Card> component
    // (dist/components/card.js) renders the SAME class in the article body, before the footer in
    // DOM order — `/docs/tutorials` and `/docs/contributing` both use <Cards> and are in
    // `allPages`, so `.first()` without excluding `[data-card]` silently resolves to a content
    // card instead of the real nav link on those two pages. fumadocs marks its own Card
    // `data-card`; the footer nav links carry no such attribute.

    // Check "Next" footer link
    const nextLink = page.locator('a.bg-fd-card.text-end:not([data-card])').first()
    if ((await nextLink.count()) > 0) {
      footerLinksSeen++
      const href = await nextLink.getAttribute('href')
      if (href && new URL(href, 'http://localhost').pathname === url) {
        circular.push(`${url} → next points to itself`)
      }
    }

    // Check "Previous" footer link
    const prevLink = page.locator('a.bg-fd-card:not(.text-end):not([data-card])').first()
    if ((await prevLink.count()) > 0) {
      footerLinksSeen++
      const href = await prevLink.getAttribute('href')
      if (href && new URL(href, 'http://localhost').pathname === url) {
        circular.push(`${url} → prev points to itself`)
      }
    }
  }

  // A selector that stops matching (a fumadocs class rename) makes both loops above no-ops —
  // `circular` stays empty and this test passes for the wrong reason, silently, forever. Most
  // pages carry BOTH a "Previous" and a "Next" (only the very first and very last page in the
  // whole nav tree have just one side, and a page absent from the nav tree — Footer's `idx === -1`
  // branch — contributes neither), so the real count is close to 2x `allPages.length`, not 1x.
  // The floor below is set at `allPages.length` deliberately slack, not as the tight expected
  // value: it is the presence guard the original bare-count checks never had, not a precise count.
  expect(footerLinksSeen).toBeGreaterThan(allPages.length)

  expect(circular, `Circular navigation links found:\n${circular.join('\n')}`).toHaveLength(0)
})

test('US-552 5b: guides index, what is new, absorbed page redirect', async ({ page }) => {
  await page.goto('/docs/guides')
  await expect(page.locator('main h1')).toContainText('Guides')
  await expect(page.locator('main a[href="/docs/guides/deliver-a-card"]').first()).toBeVisible()

  await page.goto('/docs/whats-new')
  await expect(page.locator('main h1')).toContainText("What's new")
  await expect(page.locator('main a[href="/docs/migrations/v0.4-to-v0.5"]').first()).toBeVisible()

  await page.goto('/docs/getting-started/checklist')
  await expect(page).toHaveURL('/docs/getting-started/verify')
})
