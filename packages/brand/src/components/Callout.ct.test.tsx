import { test, expect } from '@playwright/experimental-ct-react'
import { Callout } from './Callout'

test('info type', async ({ mount }) => {
  const component = await mount(<Callout type='info'>Info message</Callout>)
  await expect(component).toHaveClass(/info/)
  await expect(component).toContainText('Info message')
})

test('warning type', async ({ mount }) => {
  const component = await mount(<Callout type='warning'>Warning</Callout>)
  await expect(component).toHaveClass(/warning/)
})

test('tip type', async ({ mount }) => {
  const component = await mount(<Callout type='tip'>Tip</Callout>)
  await expect(component).toHaveClass(/tip/)
})

test('with title', async ({ mount }) => {
  const component = await mount(<Callout title='My Title'>Body</Callout>)
  await expect(component).toContainText('My Title')
  await expect(component).toContainText('Body')
})

test('without title', async ({ mount }) => {
  const component = await mount(<Callout>No title here</Callout>)
  await expect(component).toContainText('No title here')
})
