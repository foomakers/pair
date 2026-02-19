import { test } from '../../playwright/a11y-fixture'
import { Callout } from './Callout'

test('info type a11y', async ({ mount, checkA11y }) => {
  await mount(<Callout type='info'>Info message</Callout>)
  await checkA11y()
})

test('warning type a11y', async ({ mount, checkA11y }) => {
  await mount(<Callout type='warning'>Warning message</Callout>)
  await checkA11y()
})

test('tip type a11y', async ({ mount, checkA11y }) => {
  await mount(<Callout type='tip'>Tip message</Callout>)
  await checkA11y()
})

test('with title a11y', async ({ mount, checkA11y }) => {
  await mount(<Callout title='Note'>Content with title</Callout>)
  await checkA11y()
})
