import { test, expect } from '@playwright/experimental-ct-react'
import HomePage from '../app/(landing)/page'

test('renders pair heading', async ({ mount }) => {
  const component = await mount(<HomePage />)
  await expect(component.locator('h1')).toContainText('pair')
})

test('renders tagline', async ({ mount }) => {
  const component = await mount(<HomePage />)
  await expect(component).toContainText('Code is the easy part.')
})

test('link to /docs', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const link = component.locator('a[href="/docs"]')
  await expect(link).toBeVisible()
  await expect(link).toContainText('Documentation')
})
