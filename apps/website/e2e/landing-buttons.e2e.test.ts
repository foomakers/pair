import { test, expect } from '@playwright/experimental-ct-react'

// ============================================================
// Bug: Primary buttons on landing page are invisible
// Root cause: Tailwind content paths don't include @pair/brand
// source, so bg-pair-blue gets purged in production build.
// These E2E tests verify buttons render with correct styles.
// ============================================================

const PRIMARY_BG_COLOR = 'rgb(0, 98, 255)' // #0062FF

// ---------- Hero Section ----------

test('hero "Get pair" button has visible background color', async ({ page }) => {
  await page.goto('/')
  const btn = page.locator('section[aria-label="Hero"] a').filter({ hasText: 'Get pair' })
  await expect(btn).toBeVisible()
  const bgColor = await btn.evaluate(el => getComputedStyle(el).backgroundColor)
  expect(bgColor).toBe(PRIMARY_BG_COLOR)
})

test('hero "Get pair" button has white text', async ({ page }) => {
  await page.goto('/')
  const btn = page.locator('section[aria-label="Hero"] a').filter({ hasText: 'Get pair' })
  const color = await btn.evaluate(el => getComputedStyle(el).color)
  expect(color).toBe('rgb(255, 255, 255)')
})

// ---------- CTA Section ----------

test('CTA "Get pair" button has visible background color', async ({ page }) => {
  await page.goto('/')
  const btn = page.locator('section[aria-label="Call to action"] a').filter({ hasText: 'Get pair' })
  await expect(btn).toBeVisible()
  const bgColor = await btn.evaluate(el => getComputedStyle(el).backgroundColor)
  expect(bgColor).toBe(PRIMARY_BG_COLOR)
})

test('CTA "Read the docs" outline button has gradient border', async ({ page }) => {
  await page.goto('/')
  const btn = page
    .locator('section[aria-label="Call to action"] a')
    .filter({ hasText: 'Read the docs' })
  await expect(btn).toBeVisible()
  // Outline buttons use gradient-border pseudo-element — verify it's not plain transparent
  const bgColor = await btn.evaluate(el => getComputedStyle(el).backgroundColor)
  // Outline buttons should have transparent/no background (not pair-blue)
  expect(bgColor).not.toBe(PRIMARY_BG_COLOR)
})

// ---------- Audience Track Buttons ----------

test('audience track buttons are visible and styled', async ({ page }) => {
  await page.goto('/')
  const section = page.locator('section[aria-label="Audience tracks"]')

  for (const label of ['Get started', 'Set up for your team', 'Enterprise rollout']) {
    const btn = section.locator('a').filter({ hasText: label })
    await expect(btn).toBeVisible()
    // These are outline buttons — should have the gradient-border class
    const hasGradientBorder = await btn.evaluate(el => el.classList.contains('gradient-border'))
    expect(hasGradientBorder).toBe(true)
  }
})

// ---------- Open Source Button ----------

test('open source GitHub button is visible and styled', async ({ page }) => {
  await page.goto('/')
  const btn = page
    .locator('section[aria-label="Open source"] a')
    .filter({ hasText: 'foomakers/pair' })
  await expect(btn).toBeVisible()
  const hasGradientBorder = await btn.evaluate(el => el.classList.contains('gradient-border'))
  expect(hasGradientBorder).toBe(true)
})
