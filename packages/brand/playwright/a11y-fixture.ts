import { test as base, expect } from '@playwright/experimental-ct-react'
import AxeBuilder from '@axe-core/playwright'

export const test = base.extend<{ checkA11y: () => Promise<void> }>({
  checkA11y: async ({ page }, use) => {
    await use(async () => {
      const results = await new AxeBuilder({ page })
        .disableRules(['landmark-one-main', 'page-has-heading-one', 'region'])
        .analyze()
      expect(results.violations).toEqual([])
    })
  },
})
export { expect }
