import { test, expect } from '@playwright/experimental-ct-react'
import PrivacyPage from './page'

test('renders Privacy Policy heading', async ({ mount }) => {
  const component = await mount(<PrivacyPage />)
  await expect(component.locator('h1')).toContainText('Privacy Policy')
})

test('mentions PostHog', async ({ mount }) => {
  const component = await mount(<PrivacyPage />)
  await expect(component).toContainText('PostHog')
})

test('has opt out section', async ({ mount }) => {
  const component = await mount(<PrivacyPage />)
  await expect(component.locator('h2').filter({ hasText: 'Opt out' })).toBeVisible()
})
