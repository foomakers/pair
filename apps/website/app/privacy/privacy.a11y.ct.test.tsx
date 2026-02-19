import { test } from '../../playwright/a11y-fixture'
import PrivacyPage from './page'

test('privacy page a11y', async ({ mount, checkA11y }) => {
  await mount(<PrivacyPage />)
  await checkA11y()
})
