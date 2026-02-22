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

  // AC-1: overview page
  await expect(page.locator('h1')).toContainText('What is pair?')
  await expect(page).toHaveTitle(/What is pair/)
  await expect(page.locator('main')).toContainText('Knowledge Base')
  await expect(page.locator('main')).toContainText('Skills')
  await expect(page.locator('main')).toContainText('Adoption Files')

  // Navigate to Quickstart via sidebar
  await page
    .locator('a', { hasText: /^Quickstart$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/getting-started/quickstart')

  // AC-2: install + verify + first command steps
  const main = page.locator('main')
  await expect(main).toContainText('Prerequisites')
  await expect(main).toContainText('Node.js 18')
  await expect(main).toContainText('npm install -g @pair/pair-cli')
  await expect(main).toContainText('pnpm add -g @pair/pair-cli')
  await expect(main).toContainText('Verify Installation')
  await expect(main).toContainText('pair-cli --version')
  await expect(main).toContainText('pair-cli install')

  // AC-3: migrated content preserved, no broken .md links
  await expect(main).toContainText('Manual Install')
  await expect(main).toContainText('GitHub Releases')
  const hrefs = await main
    .locator('a')
    .evaluateAll(els => els.map(el => el.getAttribute('href')).filter(Boolean))
  const brokenLinks = hrefs.filter(
    h => h && (h.includes('../how-pair-works.md') || h.includes('./02-cli-workflows.md')),
  )
  expect(brokenLinks).toHaveLength(0)

  // New quickstart: general content (new project, existing project, update, process)
  await expect(main).toContainText('New Project')
  await expect(main).toContainText('Existing Project')
  await expect(main).toContainText('pair-cli update')
  await expect(main).toContainText('Development Process')
  await expect(main).toContainText('Choose Your Setup')
})

test('solo setup journey: quickstart → solo setup with content verification', async ({ page }) => {
  await page.goto('/docs/getting-started/quickstart-solo')

  // Solo setup page renders with expected content
  const main = page.locator('main')
  await expect(page.locator('main h1')).toContainText('Solo Setup')
  await expect(main).toContainText('Solo Workflow')
  await expect(main).toContainText('/pair-next')
  await expect(main).toContainText('pair-cli install --list-targets')

  // Links back to general quickstart
  await expect(main.locator('a[href="/docs/getting-started/quickstart"]').first()).toBeVisible()

  // AC-6 (partial): no cross-audience refs in solo setup
  const contentLinks = await page.locator('article a').evaluateAll(els =>
    els
      .filter(el => !el.classList.toString().includes('bg-fd-card'))
      .map(el => el.getAttribute('href'))
      .filter(Boolean),
  )
  expect(
    contentLinks.filter(h => h && (h.includes('quickstart-team') || h.includes('quickstart-org'))),
  ).toHaveLength(0)
})

test('team journey: overview → team setup with content verification', async ({ page }) => {
  await page.goto('/docs/getting-started')

  // Navigate to Team Setup via sidebar
  await page.locator('a', { hasText: 'Team Setup' }).first().click()
  await expect(page).toHaveURL('/docs/getting-started/quickstart-team')

  // AC-4: shared KB, adoption files, bridge pattern
  const main = page.locator('main')
  await expect(main).toContainText('adoption')
  await expect(main).toContainText('Bridge Pattern')
  await expect(main).toContainText('AGENTS.md')
  await expect(main).toContainText('architecture.md')
  await expect(main).toContainText('tech-stack.md')
  await expect(main).toContainText('way-of-working.md')

  // Links to general quickstart instead of duplicating install
  await expect(main.locator('a[href="/docs/getting-started/quickstart"]').first()).toBeVisible()
})

test('org journey: overview → org setup with content verification', async ({ page }) => {
  await page.goto('/docs/getting-started')

  // Navigate to Org Setup via sidebar
  await page.locator('a', { hasText: 'Organization Setup' }).first().click()
  await expect(page).toHaveURL('/docs/getting-started/quickstart-org')

  // AC-5: KB packaging, distribution, compliance
  const main = page.locator('main')
  await expect(main).toContainText('pair-cli package')
  await expect(main).toContainText('pair-cli install --source')
  await expect(main).toContainText('pair-cli update')
  await expect(main).toContainText('Distribute via GitHub Releases')
  await expect(main).toContainText('Compliance')
  await expect(main).toContainText('Asset Registries')

  // Links to general quickstart instead of duplicating install
  await expect(main.locator('a[href="/docs/getting-started/quickstart"]').first()).toBeVisible()
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
    { url: '/docs/getting-started/quickstart-solo', title: 'Solo Setup' },
    { url: '/docs/getting-started/quickstart-team', title: 'Team Setup' },
    { url: '/docs/getting-started/quickstart-org', title: 'Organization Setup' },
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

test('guides section: navigate and verify content', async ({ page }) => {
  await page.goto('/docs/guides/cli-workflows')
  const main = page.locator('main')

  // Guides page renders with expected content
  await expect(page.locator('main h1')).toContainText('CLI Workflows')
  await expect(main).toContainText('Common Workflows')
  await expect(main).toContainText('pair-cli install')

  // Sidebar shows Guides section
  await expect(page.locator('body')).toContainText('Guides')

  // Navigate to another guide via sidebar
  await page.locator('a', { hasText: 'Troubleshooting' }).first().click()
  await expect(page).toHaveURL('/docs/guides/troubleshooting')
  await expect(page.locator('main h1')).toContainText('Troubleshooting')
  await expect(main).toContainText('Installation Issues')
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

  // Navigate to Installation FAQ via sidebar
  await page.locator('a', { hasText: 'Installation FAQ' }).first().click()
  await expect(page).toHaveURL('/docs/support/faq')
  await expect(page.locator('main h1')).toContainText('Installation FAQ')
  await expect(main).toContainText('Permission Issues')
  await expect(main).toContainText('Node Version Issues')
})

test('smoke: all guides/reference/support pages return 200', async ({ page }) => {
  const pages = [
    { url: '/docs/guides/cli-workflows', title: 'CLI Workflows' },
    { url: '/docs/guides/install-from-url', title: 'Install from URL' },
    { url: '/docs/guides/customize-kb', title: 'Customize the Knowledge Base' },
    { url: '/docs/guides/adopter-checklist', title: 'Adopter Checklist' },
    { url: '/docs/guides/troubleshooting', title: 'Troubleshooting' },
    { url: '/docs/guides/update-link', title: 'Link Update' },
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
    { url: '/docs/support/faq', title: 'Installation FAQ' },
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
    '/docs/guides/cli-workflows',
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

test('developer journey: navigate through section pages', async ({ page }) => {
  // Index page (Process Lifecycle, moved from concepts)
  await page.goto('/docs/developer-journey')
  const main = page.locator('main')
  await expect(page.locator('main h1')).toContainText('Process Lifecycle')
  await expect(main).toContainText('/pair-next')
  await expect(main).toContainText('Process Skills (recommended)')
  await expect(main).toContainText('How-to Guides')
  await expect(main).toContainText('The Four Levels')
  await expect(main).toContainText('Entry Points')

  // Sidebar shows Developer Journey section
  await expect(page.locator('body')).toContainText('Developer Journey')

  // Navigate to Induction
  await page
    .locator('a', { hasText: /^Induction: Project Setup$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/developer-journey/induction')
  await expect(main).toContainText('/pair-process-specify-prd')
  await expect(main).toContainText('/pair-process-bootstrap')
  await expect(main).toContainText('/pair-process-plan-initiatives')

  // Navigate to Execution
  await page
    .locator('a', { hasText: /^Execution/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/developer-journey/execution')
  await expect(main).toContainText('/pair-process-implement')
  await expect(main).toContainText('/pair-process-review')
  await expect(main).toContainText('TDD Discipline')

  // Links to reference catalogs
  await expect(main.locator('a[href="/docs/reference/skills-catalog"]').first()).toBeVisible()
  await expect(main.locator('a[href="/docs/reference/guidelines-catalog"]').first()).toBeVisible()
})

test('smoke: all developer journey pages return 200', async ({ page }) => {
  const pages = [
    { url: '/docs/developer-journey', title: 'Process Lifecycle' },
    { url: '/docs/developer-journey/induction', title: 'Induction' },
    { url: '/docs/developer-journey/strategic-planning', title: 'Strategic Planning' },
    { url: '/docs/developer-journey/iteration', title: 'Iteration' },
    { url: '/docs/developer-journey/execution', title: 'Execution' },
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
// E2E: Docs — Customization section (#125)
// ============================================================

test('customization journey: index → adopt → team → organization', async ({ page }) => {
  // AC-1: index page with adopt→customize→publish progression
  await page.goto('/docs/customization')
  const main = page.locator('main')
  await expect(page.locator('main h1')).toContainText('Adapt pair to Your Context')
  await expect(main).toContainText('Adopt')
  await expect(main).toContainText('Customize')
  await expect(main).toContainText('Publish')

  // AC-5: sidebar shows customization section with correct ordering
  await expect(page.locator('body')).toContainText('Customization')

  // Navigate to Adopt via content link
  await main.locator('a[href="/docs/customization/adopt"]').first().click()
  await expect(page).toHaveURL('/docs/customization/adopt')

  // AC-2: adopt page — solo dev consumer guide
  await expect(page.locator('main h1')).toContainText('Adopt a Knowledge Base')
  await expect(main).toContainText('Browse Available Knowledge Bases')
  await expect(main).toContainText('pair-cli install')
  await expect(main).toContainText('Verify the Installation')
  await expect(main).toContainText('What You Get')

  // Navigate to Team via sidebar
  await page
    .locator('a', { hasText: /^Customize for Your Team$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/customization/team')

  // AC-3: team page — team lead adapter guide
  await expect(page.locator('main h1')).toContainText('Customize for Your Team')
  await expect(main).toContainText('Layered Architecture')
  await expect(main).toContainText('Override the Tech Stack')
  await expect(main).toContainText('Stay Updated')
  await expect(main).toContainText('pair-cli update')

  // Navigate to Organization via sidebar
  await page
    .locator('a', { hasText: /^Publish a Knowledge Base$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/customization/organization')

  // AC-4: organization page — org architect producer guide
  await expect(page.locator('main h1')).toContainText('Publish a Knowledge Base')
  await expect(main).toContainText('Create the KB Structure')
  await expect(main).toContainText('pair-cli package')
  await expect(main).toContainText('Distribute')
  await expect(main).toContainText('Version and Maintain')
})

test('smoke: all customization pages return 200 with correct titles', async ({ page }) => {
  const pages = [
    { url: '/docs/customization', title: 'Adapt pair to Your Context' },
    { url: '/docs/customization/adopt', title: 'Adopt a Knowledge Base' },
    { url: '/docs/customization/team', title: 'Customize for Your Team' },
    { url: '/docs/customization/templates', title: 'Customize Templates' },
    { url: '/docs/customization/organization', title: 'Publish a Knowledge Base' },
  ]
  for (const { url, title } of pages) {
    const response = await page.goto(url)
    expect(response?.status(), `${url} should return 200`).toBe(200)
    await expect(page.locator('main h1')).toBeVisible()
    await expect(page).toHaveTitle(new RegExp(title))
  }
})

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

  // All 3 options listed
  await expect(main).toContainText('Filesystem')
  await expect(main).toContainText('GitHub Projects')
  await expect(main).toContainText('Linear')

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
  await expect(main).toContainText('zero-dependency')
  await expect(main).toContainText('backlog/')
})

test('smoke: all integrations + pm-tools pages return 200', async ({ page }) => {
  const pages = [
    { url: '/docs/integrations', title: 'AI Coding Tools' },
    { url: '/docs/integrations/claude-code', title: 'Claude Code' },
    { url: '/docs/integrations/codex', title: 'Codex' },
    { url: '/docs/integrations/cursor', title: 'Cursor' },
    { url: '/docs/integrations/github-copilot', title: 'GitHub Copilot' },
    { url: '/docs/integrations/windsurf', title: 'Windsurf' },
    { url: '/docs/pm-tools', title: 'Project Management Tools' },
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
