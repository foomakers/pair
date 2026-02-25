import { test, expect } from '@playwright/test'

// ============================================================
// E2E: Landing page → Docs navigation flows
// Verifies real user journeys from the landing page into docs.
// ============================================================

test('landing page has og:image meta tag (CP109)', async ({ page }) => {
  await page.goto('/')
  const ogImage = await page.getAttribute('meta[property="og:image"]', 'content')
  expect(ogImage).toBeTruthy()
  expect(ogImage).toContain('social-preview.png')
})

test('click "Read the docs" navigates to docs', async ({ page }) => {
  await page.goto('/')
  await page
    .locator('section[aria-label="Call to action"] a')
    .filter({ hasText: 'Read the docs' })
    .click()
  await expect(page).toHaveURL('/docs')
  await expect(page.locator('main')).toContainText('Welcome')
})

test('click "Get started" (Solo Dev) navigates to docs', async ({ page }) => {
  await page.goto('/')
  await page
    .locator('section[aria-label="Audience tracks"] a')
    .filter({ hasText: 'Get started' })
    .click()
  await expect(page).toHaveURL('/docs')
})

test('docs sidebar navigates to Getting Started', async ({ page }) => {
  await page.goto('/')
  await page
    .locator('section[aria-label="Call to action"] a')
    .filter({ hasText: 'Read the docs' })
    .click()
  await page.locator('a', { hasText: 'Getting Started' }).first().click()
  await expect(page).toHaveURL('/docs/getting-started')
  await expect(page.locator('h1')).toContainText('What is pair?')
})

test('docs sidebar navigates to Concepts', async ({ page }) => {
  await page.goto('/')
  await page
    .locator('section[aria-label="Call to action"] a')
    .filter({ hasText: 'Read the docs' })
    .click()
  await page.locator('button', { hasText: 'Concepts' }).click()
  await page.locator('a', { hasText: 'AI-Assisted SDLC' }).click()
  await expect(page).toHaveURL('/docs/concepts/ai-assisted-sdlc')
  await expect(page.locator('h1')).toContainText('AI-Assisted SDLC')
})

test('full flow: landing → quickstart → concept page via Next link', async ({ page }) => {
  await page.goto('/')
  // Go to docs
  await page
    .locator('section[aria-label="Call to action"] a')
    .filter({ hasText: 'Read the docs' })
    .click()
  // Navigate to Getting Started
  await page.locator('a', { hasText: 'Getting Started' }).first().click()
  // Click into Quickstart
  await page
    .locator('a', { hasText: /^Quickstart$/ })
    .first()
    .click()
  await expect(page).toHaveURL('/docs/getting-started/quickstart')
  await expect(page.locator('h1')).toContainText('Quickstart')
  // Use prev/next to go to Solo Setup
  await page.locator('a', { hasText: 'Solo Setup' }).last().click()
  await expect(page).toHaveURL('/docs/getting-started/quickstart-solo')
})
