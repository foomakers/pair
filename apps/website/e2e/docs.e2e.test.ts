import { test, expect } from '@playwright/test'

// ============================================================
// E2E: Docs — User journey tests for Getting Started + Concepts
// Verifies ACs by navigating through docs as a real user would.
// ============================================================

test('solo dev journey: overview → quickstart with content verification', async ({ page }) => {
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

  // Navigate to Solo Quickstart via sidebar
  await page.locator('a', { hasText: 'Solo Developer Quickstart' }).first().click()
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
  await expect(main).toContainText('pair-cli install --list-targets')
  await expect(main).toContainText('GitHub Releases')
  const hrefs = await main
    .locator('a')
    .evaluateAll(els => els.map(el => el.getAttribute('href')).filter(Boolean))
  const brokenLinks = hrefs.filter(
    h => h && (h.includes('../how-pair-works.md') || h.includes('./02-cli-workflows.md')),
  )
  expect(brokenLinks).toHaveLength(0)

  // AC-6 (partial): no cross-audience refs in solo quickstart
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

test('team journey: overview → team quickstart with content verification', async ({ page }) => {
  await page.goto('/docs/getting-started')

  // Navigate to Team Quickstart via sidebar
  await page.locator('a', { hasText: 'Team Quickstart' }).first().click()
  await expect(page).toHaveURL('/docs/getting-started/quickstart-team')

  // AC-4: shared KB, adoption files, bridge pattern
  const main = page.locator('main')
  await expect(main).toContainText('pair-cli install')
  await expect(main).toContainText('adoption')
  await expect(main).toContainText('Bridge Pattern')
  await expect(main).toContainText('AGENTS.md')
  await expect(main).toContainText('architecture.md')
  await expect(main).toContainText('tech-stack.md')
  await expect(main).toContainText('way-of-working.md')

  // AC-6 (partial): no cross-audience refs
  const links = await page.locator('article a').evaluateAll(els =>
    els
      .filter(el => !el.classList.toString().includes('bg-fd-card'))
      .map(el => el.getAttribute('href'))
      .filter(Boolean),
  )
  expect(
    links.filter(
      h =>
        h &&
        (h.endsWith('/quickstart') || h.includes('/quickstart#')) &&
        !h.includes('quickstart-'),
    ),
  ).toHaveLength(0)
})

test('org journey: overview → org quickstart with content verification', async ({ page }) => {
  await page.goto('/docs/getting-started')

  // Navigate to Org Quickstart via sidebar
  await page.locator('a', { hasText: 'Organization Quickstart' }).first().click()
  await expect(page).toHaveURL('/docs/getting-started/quickstart-org')

  // AC-5: KB packaging, distribution, compliance
  const main = page.locator('main')
  await expect(main).toContainText('pair-cli package')
  await expect(main).toContainText('pair-cli install --source')
  await expect(main).toContainText('pair-cli update')
  await expect(main).toContainText('Distribute via GitHub Releases')
  await expect(main).toContainText('Compliance')
  await expect(main).toContainText('Asset Registries')

  // AC-6 (partial): no cross-audience refs
  const links = await page.locator('article a').evaluateAll(els =>
    els
      .filter(el => !el.classList.toString().includes('bg-fd-card'))
      .map(el => el.getAttribute('href'))
      .filter(Boolean),
  )
  expect(
    links.filter(
      h => h && (h.includes('/quickstart-team') || (h.endsWith('/quickstart') && !h.includes('-'))),
    ),
  ).toHaveLength(0)
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
  await expect(main.locator('a[href="https://agentskills.io"]')).toBeVisible()
  await expect(main).toContainText('Process Skills')
  await expect(main).toContainText('Capability Skills')
  await expect(main).toContainText('Composition')

  // Navigate to Process Lifecycle via sidebar
  await page.locator('a', { hasText: 'Process Lifecycle' }).first().click()
  await expect(page).toHaveURL('/docs/concepts/process-lifecycle')

  // AC-10: 4 levels and key steps
  await expect(main).toContainText('Induction')
  await expect(main).toContainText('Strategic Planning')
  await expect(main).toContainText('Iteration')
  await expect(main).toContainText('Execution')
  await expect(main).toContainText('Create the PRD')
  await expect(main).toContainText('Bootstrap Checklist')
  await expect(main).toContainText('Implement')
  await expect(main).toContainText('Code Review')
})

test('smoke: all 10 docs pages return 200 with correct titles', async ({ page }) => {
  // AC-7 + AC-11 + frontmatter
  const pages = [
    { url: '/docs/getting-started', title: 'What is pair?' },
    { url: '/docs/getting-started/quickstart', title: 'Solo Developer Quickstart' },
    { url: '/docs/getting-started/quickstart-team', title: 'Team Quickstart' },
    { url: '/docs/getting-started/quickstart-org', title: 'Organization Quickstart' },
    { url: '/docs/concepts/ai-assisted-sdlc', title: 'AI-Assisted SDLC' },
    { url: '/docs/concepts/knowledge-base', title: 'Knowledge Base' },
    { url: '/docs/concepts/skills', title: 'Skills' },
    { url: '/docs/concepts/adoption-files', title: 'Adoption Files' },
    { url: '/docs/concepts/process-lifecycle', title: 'Process Lifecycle' },
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

  // Navigate to FAQ via sidebar
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
    { url: '/docs/reference/skill-management', title: 'Skill Management' },
    { url: '/docs/reference/kb-structure', title: 'KB Structure' },
    { url: '/docs/reference/configuration', title: 'Configuration' },
    { url: '/docs/support', title: 'Support' },
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
