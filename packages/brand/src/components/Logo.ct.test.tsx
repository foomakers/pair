import { test, expect } from '@playwright/experimental-ct-react'
import { PairLogo } from './Logo'

test('favicon variant renders SVG', async ({ mount }) => {
  const component = await mount(<PairLogo variant='favicon' />)
  await expect(component.locator('svg')).toBeVisible()
})

test('navbar variant renders SVG', async ({ mount }) => {
  const component = await mount(<PairLogo variant='navbar' />)
  await expect(component.locator('svg')).toBeVisible()
})

test('full variant renders SVG', async ({ mount }) => {
  const component = await mount(<PairLogo variant='full' />)
  await expect(component.locator('svg')).toBeVisible()
})

test('has pair-logo class', async ({ mount }) => {
  const component = await mount(<PairLogo />)
  await expect(component).toHaveClass(/pair-logo/)
})
