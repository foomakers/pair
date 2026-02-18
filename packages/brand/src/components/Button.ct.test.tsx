import { test, expect } from '@playwright/experimental-ct-react'
import { Button } from './Button'

test('renders text', async ({ mount }) => {
  const component = await mount(<Button>Click me</Button>)
  await expect(component).toContainText('Click me')
})

test('primary variant', async ({ mount }) => {
  const component = await mount(<Button variant='primary'>Primary</Button>)
  await expect(component).toHaveClass(/primary/)
})

test('secondary variant', async ({ mount }) => {
  const component = await mount(<Button variant='secondary'>Secondary</Button>)
  await expect(component).toHaveClass(/secondary/)
})

test('ghost variant', async ({ mount }) => {
  const component = await mount(<Button variant='ghost'>Ghost</Button>)
  await expect(component).toHaveClass(/ghost/)
})

test('click handler fires', async ({ mount }) => {
  let clicked = false
  const component = await mount(<Button onClick={() => (clicked = true)}>Click</Button>)
  await component.click()
  expect(clicked).toBe(true)
})

test('disabled state', async ({ mount }) => {
  const component = await mount(<Button disabled>Disabled</Button>)
  await expect(component).toBeDisabled()
})
