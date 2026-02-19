import { test } from '../../playwright/a11y-fixture'
import HomePage from './page'

test('landing page a11y', async ({ mount, checkA11y }) => {
  await mount(<HomePage />)
  await checkA11y()
})
