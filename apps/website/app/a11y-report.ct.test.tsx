import { test, printSummary } from '../playwright/a11y-report-fixture'
import HomePage from './(landing)/page'
import PrivacyPage from './privacy/page'

test.afterAll(() => printSummary())

test.describe('@a11y-report pages', () => {
  test('landing page', async ({ mount, runA11yReport }) => {
    await mount(<HomePage />)
    await runA11yReport('landing-page')
  })

  test('privacy page', async ({ mount, runA11yReport }) => {
    await mount(<PrivacyPage />)
    await runA11yReport('privacy-page')
  })
})
