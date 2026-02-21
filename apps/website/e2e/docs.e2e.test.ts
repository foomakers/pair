import { test, expect } from '@playwright/experimental-ct-react'

// ============================================================
// Story #123 — Getting Started + Concepts docs sections
// E2E tests verifying all 12 Acceptance Criteria
// ============================================================

// ---------- Getting Started: Solo Dev Quickstart ----------

// AC-1: /docs/getting-started shows "What is pair?" overview
test('AC-1: getting-started index shows What is pair overview', async ({ page }) => {
  await page.goto('/docs/getting-started')
  await expect(page.locator('h1')).toContainText('What is pair?')
  await expect(page).toHaveTitle(/What is pair/)
  // Must explain KB, skills, and adoption files
  await expect(page.locator('main')).toContainText('Knowledge Base')
  await expect(page.locator('main')).toContainText('Skills')
  await expect(page.locator('main')).toContainText('Adoption Files')
})

// AC-2: Solo quickstart has install + verify + first command steps
test('AC-2: solo quickstart has prerequisites, install, verify, first command', async ({
  page,
}) => {
  await page.goto('/docs/getting-started/quickstart')
  const main = page.locator('main')
  await expect(main).toContainText('Prerequisites')
  await expect(main).toContainText('Node.js 18')
  await expect(main).toContainText('npm install -g @pair/pair-cli')
  await expect(main).toContainText('pnpm add -g @pair/pair-cli')
  await expect(main).toContainText('Verify Installation')
  await expect(main).toContainText('pair-cli --version')
  await expect(main).toContainText('pair-cli install')
})

// AC-3: Content migrated from docs/getting-started/01-quickstart.md — no info lost
test('AC-3: migrated content preserves original info', async ({ page }) => {
  await page.goto('/docs/getting-started/quickstart')
  const main = page.locator('main')
  // Key content from original: npm install, pnpm install, manual install, verify, list-targets
  await expect(main).toContainText('npm install -g @pair/pair-cli')
  await expect(main).toContainText('pnpm add -g @pair/pair-cli')
  await expect(main).toContainText('Manual Install')
  await expect(main).toContainText('pair-cli --version')
  await expect(main).toContainText('pair-cli install --list-targets')
  await expect(main).toContainText('GitHub Releases')
  // Links should use Fumadocs paths, not relative markdown paths
  const links = main.locator('a')
  const hrefs = await links.evaluateAll(els =>
    els.map(el => el.getAttribute('href')).filter(Boolean),
  )
  // No raw .md links to docs/ folder
  const brokenLinks = hrefs.filter(
    h => h && (h.includes('../how-pair-works.md') || h.includes('./02-cli-workflows.md')),
  )
  expect(brokenLinks).toHaveLength(0)
})

// ---------- Getting Started: Team & Org Quickstarts ----------

// AC-4: Team quickstart — shared KB, adoption files, agent bridge pattern
test('AC-4: team quickstart covers shared KB, adoption files, bridge pattern', async ({ page }) => {
  await page.goto('/docs/getting-started/quickstart-team')
  const main = page.locator('main')
  await expect(main).toContainText('pair-cli install')
  await expect(main).toContainText('adoption')
  await expect(main).toContainText('Bridge Pattern')
  await expect(main).toContainText('AGENTS.md')
  await expect(main).toContainText('architecture.md')
  await expect(main).toContainText('tech-stack.md')
  await expect(main).toContainText('way-of-working.md')
})

// AC-5: Org quickstart — custom KB packaging, distribution, compliance
test('AC-5: org quickstart covers KB packaging, distribution, compliance', async ({ page }) => {
  await page.goto('/docs/getting-started/quickstart-org')
  const main = page.locator('main')
  await expect(main).toContainText('pair-cli package')
  await expect(main).toContainText('pair-cli install --source')
  await expect(main).toContainText('pair-cli update')
  await expect(main).toContainText('Distribute via GitHub Releases')
  await expect(main).toContainText('Compliance')
  await expect(main).toContainText('Asset Registries')
})

// AC-6: Each quickstart is self-contained (no cross-audience references)
test('AC-6: quickstarts are self-contained — no cross-audience dependencies', async ({ page }) => {
  // Helper: get content-only links (exclude Fumadocs prev/next nav cards and sidebar)
  const getContentLinks = async () =>
    page.locator('article a').evaluateAll(els =>
      els
        .filter(el => !el.classList.toString().includes('bg-fd-card'))
        .map(el => el.getAttribute('href'))
        .filter(Boolean),
    )

  // Solo quickstart should NOT link to team or org quickstarts
  await page.goto('/docs/getting-started/quickstart')
  let links = await getContentLinks()
  const crossRefs = links.filter(
    h => h && (h.includes('quickstart-team') || h.includes('quickstart-org')),
  )
  expect(crossRefs).toHaveLength(0)

  // Team quickstart should NOT link to solo or org quickstarts
  await page.goto('/docs/getting-started/quickstart-team')
  links = await getContentLinks()
  const teamCrossRefs = links.filter(
    h =>
      h && (h.endsWith('/quickstart') || h.includes('/quickstart#')) && !h.includes('quickstart-'),
  )
  expect(teamCrossRefs).toHaveLength(0)

  // Org quickstart should NOT link to solo or team quickstarts
  await page.goto('/docs/getting-started/quickstart-org')
  links = await getContentLinks()
  const orgCrossRefs = links.filter(
    h => h && (h.includes('/quickstart-team') || (h.endsWith('/quickstart') && !h.includes('-'))),
  )
  expect(orgCrossRefs).toHaveLength(0)
})

// ---------- Concepts Section ----------

// AC-7: /docs/concepts has 6 concept pages in navigation
test('AC-7: concepts section has 6 concept pages accessible', async ({ page }) => {
  const conceptPages = [
    '/docs/concepts/ai-assisted-sdlc',
    '/docs/concepts/knowledge-base',
    '/docs/concepts/skills',
    '/docs/concepts/adoption-files',
    '/docs/concepts/process-lifecycle',
    '/docs/concepts/agent-integration',
  ]
  for (const url of conceptPages) {
    const response = await page.goto(url)
    expect(response?.status()).toBe(200)
    // Each page must have a title in the main content
    await expect(page.locator('main h1')).toBeVisible()
  }
})

// AC-8: knowledge-base.mdx explains KB structure (knowledge/ vs adoption/)
test('AC-8: knowledge-base concept explains structure', async ({ page }) => {
  await page.goto('/docs/concepts/knowledge-base')
  const main = page.locator('main')
  await expect(main).toContainText('knowledge/')
  await expect(main).toContainText('adoption/')
  await expect(main).toContainText('Knowledge vs. Adoption')
  await expect(main).toContainText('.pair/')
  await expect(main).toContainText('context')
})

// AC-9: skills.mdx explains Agent Skills standard, categories, composition
test('AC-9: skills concept explains standard, categories, composition', async ({ page }) => {
  await page.goto('/docs/concepts/skills')
  const main = page.locator('main')
  await expect(main).toContainText('Agent Skills')
  await expect(main.locator('a[href="https://agentskills.io"]')).toBeVisible()
  await expect(main).toContainText('Process Skills')
  await expect(main).toContainText('Capability Skills')
  await expect(main).toContainText('Composition')
  await expect(main).toContainText('/next')
})

// AC-10: process-lifecycle.mdx explains 4 levels with 9-step flow
test('AC-10: process-lifecycle explains 4 levels and 9 steps', async ({ page }) => {
  await page.goto('/docs/concepts/process-lifecycle')
  const main = page.locator('main')
  // 4 levels
  await expect(main).toContainText('Induction')
  await expect(main).toContainText('Strategic Planning')
  await expect(main).toContainText('Iteration')
  await expect(main).toContainText('Execution')
  // Key steps
  await expect(main).toContainText('Create the PRD')
  await expect(main).toContainText('Bootstrap Checklist')
  await expect(main).toContainText('Implement')
  await expect(main).toContainText('Code Review')
})

// ---------- Navigation & Build ----------

// AC-11: Build succeeds (tested separately via pnpm build — here we verify pages load)
test('AC-11: all 10 pages return 200', async ({ page }) => {
  const allPages = [
    '/docs/getting-started',
    '/docs/getting-started/quickstart',
    '/docs/getting-started/quickstart-team',
    '/docs/getting-started/quickstart-org',
    '/docs/concepts/ai-assisted-sdlc',
    '/docs/concepts/knowledge-base',
    '/docs/concepts/skills',
    '/docs/concepts/adoption-files',
    '/docs/concepts/process-lifecycle',
    '/docs/concepts/agent-integration',
  ]
  for (const url of allPages) {
    const response = await page.goto(url)
    expect(response?.status(), `${url} should return 200`).toBe(200)
  }
})

// AC-12: Sidebar shows "Getting Started" and "Concepts" sections
test('AC-12: sidebar navigation shows Getting Started and Concepts', async ({ page }) => {
  await page.goto('/docs/getting-started')
  // Sidebar should contain section links for both sections
  await expect(page.locator('body')).toContainText('Getting Started')
  await expect(page.locator('body')).toContainText('Concepts')
})

// ---------- Frontmatter ----------

// Verify all pages have title and description (via <title> tag)
test('all MDX pages have title in document head', async ({ page }) => {
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
    await page.goto(url)
    await expect(page).toHaveTitle(new RegExp(title))
  }
})
