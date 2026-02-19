import { test } from '../../playwright/a11y-fixture'
import { Card } from './Card'

test('default variant a11y', async ({ mount, checkA11y }) => {
  await mount(<Card>Content</Card>)
  await checkA11y()
})

test('glow variant a11y', async ({ mount, checkA11y }) => {
  await mount(<Card variant='glow'>Glow</Card>)
  await checkA11y()
})

test('glass a11y', async ({ mount, checkA11y }) => {
  await mount(<Card glass>Glass</Card>)
  await checkA11y()
})
