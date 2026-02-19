import { test } from '../../playwright/a11y-fixture'
import { PairLogo } from './Logo'

test('favicon variant a11y', async ({ mount, checkA11y }) => {
  await mount(<PairLogo variant='favicon' />)
  await checkA11y()
})

test('navbar variant a11y', async ({ mount, checkA11y }) => {
  await mount(<PairLogo variant='navbar' />)
  await checkA11y()
})

test('full variant a11y', async ({ mount, checkA11y }) => {
  await mount(<PairLogo variant='full' />)
  await checkA11y()
})
