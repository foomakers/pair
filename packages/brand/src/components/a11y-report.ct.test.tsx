import { test, printSummary } from '../../playwright/a11y-report-fixture'
import { Button } from './Button'
import { Card } from './Card'
import { PairLogo } from './Logo'
import { Callout } from './Callout'

test.afterAll(() => printSummary())

test.describe('@a11y-report Button', () => {
  test('primary', async ({ mount, runA11yReport }) => {
    await mount(<Button>Primary</Button>)
    await runA11yReport('button-primary')
  })

  test('secondary', async ({ mount, runA11yReport }) => {
    await mount(<Button variant='secondary'>Secondary</Button>)
    await runA11yReport('button-secondary')
  })

  test('ghost', async ({ mount, runA11yReport }) => {
    await mount(<Button variant='ghost'>Ghost</Button>)
    await runA11yReport('button-ghost')
  })

  test('outline', async ({ mount, runA11yReport }) => {
    await mount(<Button variant='outline'>Outline</Button>)
    await runA11yReport('button-outline')
  })

  test('as="a"', async ({ mount, runA11yReport }) => {
    await mount(
      <Button as='a' href='https://example.com'>
        Link
      </Button>,
    )
    await runA11yReport('button-as-link')
  })

  test('disabled', async ({ mount, runA11yReport }) => {
    await mount(<Button disabled>Disabled</Button>)
    await runA11yReport('button-disabled')
  })
})

test.describe('@a11y-report Card', () => {
  test('default', async ({ mount, runA11yReport }) => {
    await mount(<Card>Content</Card>)
    await runA11yReport('card-default')
  })

  test('glow', async ({ mount, runA11yReport }) => {
    await mount(<Card variant='glow'>Glow</Card>)
    await runA11yReport('card-glow')
  })

  test('glass', async ({ mount, runA11yReport }) => {
    await mount(<Card glass>Glass</Card>)
    await runA11yReport('card-glass')
  })
})

test.describe('@a11y-report Logo', () => {
  test('favicon', async ({ mount, runA11yReport }) => {
    await mount(<PairLogo variant='favicon' />)
    await runA11yReport('logo-favicon')
  })

  test('navbar', async ({ mount, runA11yReport }) => {
    await mount(<PairLogo variant='navbar' />)
    await runA11yReport('logo-navbar')
  })

  test('full', async ({ mount, runA11yReport }) => {
    await mount(<PairLogo variant='full' />)
    await runA11yReport('logo-full')
  })
})

test.describe('@a11y-report Callout', () => {
  test('info', async ({ mount, runA11yReport }) => {
    await mount(<Callout type='info'>Info message</Callout>)
    await runA11yReport('callout-info')
  })

  test('warning', async ({ mount, runA11yReport }) => {
    await mount(<Callout type='warning'>Warning message</Callout>)
    await runA11yReport('callout-warning')
  })

  test('tip', async ({ mount, runA11yReport }) => {
    await mount(<Callout type='tip'>Tip message</Callout>)
    await runA11yReport('callout-tip')
  })

  test('with title', async ({ mount, runA11yReport }) => {
    await mount(<Callout title='Note'>Content with title</Callout>)
    await runA11yReport('callout-with-title')
  })
})
