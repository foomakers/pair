import { test, expect } from '@playwright/experimental-ct-react'
import { ThemeToggleLight, ThemeToggleDark } from './ThemeToggle.story'

// ThemeToggle uses `fixed` positioning — scoped `component.locator`
// doesn't match fixed elements. Use `page.locator` instead.

test('renders with light mode aria-label by default', async ({ mount, page }) => {
  await mount(<ThemeToggleLight />)
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible()
})

test('toggles aria-label on click', async ({ mount, page }) => {
  await mount(<ThemeToggleLight />)
  const btn = page.getByRole('button', { name: /Switch to/ })
  await expect(btn).toHaveAttribute('aria-label', 'Switch to dark mode')
  await btn.click()
  await expect(btn).toHaveAttribute('aria-label', 'Switch to light mode')
})

test('toggles back to light mode on second click', async ({ mount, page }) => {
  await mount(<ThemeToggleLight />)
  const btn = page.getByRole('button', { name: /Switch to/ })
  await btn.click()
  await btn.click()
  await expect(btn).toHaveAttribute('aria-label', 'Switch to dark mode')
})

test('renders an SVG icon', async ({ mount, page }) => {
  await mount(<ThemeToggleLight />)
  await expect(page.locator('button svg')).toHaveCount(1)
})

test('renders dark mode aria-label when theme is dark', async ({ mount, page }) => {
  await mount(<ThemeToggleDark />)
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
})
