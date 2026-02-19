import { test } from '../../playwright/a11y-fixture'
import { Button } from './Button'

test('primary variant a11y', async ({ mount, checkA11y }) => {
  await mount(<Button>Primary</Button>)
  await checkA11y()
})

test('secondary variant a11y', async ({ mount, checkA11y }) => {
  await mount(<Button variant='secondary'>Secondary</Button>)
  await checkA11y()
})

test('ghost variant a11y', async ({ mount, checkA11y }) => {
  await mount(<Button variant='ghost'>Ghost</Button>)
  await checkA11y()
})

test('outline variant a11y', async ({ mount, checkA11y }) => {
  await mount(<Button variant='outline'>Outline</Button>)
  await checkA11y()
})

test('as="a" a11y', async ({ mount, checkA11y }) => {
  await mount(
    <Button as='a' href='https://example.com'>
      Link
    </Button>,
  )
  await checkA11y()
})

test('disabled a11y', async ({ mount, checkA11y }) => {
  await mount(<Button disabled>Disabled</Button>)
  await checkA11y()
})
