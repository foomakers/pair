import { test, expect } from '@playwright/experimental-ct-react'
import { Card } from './Card'

test('renders children', async ({ mount }) => {
  const component = await mount(<Card>Hello card</Card>)
  await expect(component).toContainText('Hello card')
})

test('base class applied', async ({ mount }) => {
  const component = await mount(<Card>content</Card>)
  await expect(component).toHaveClass(/pair-card/)
})

test('glass variant', async ({ mount }) => {
  const component = await mount(<Card glass>glass</Card>)
  await expect(component).toHaveClass(/glass-effect/)
})

test('custom className', async ({ mount }) => {
  const component = await mount(<Card className='my-custom'>content</Card>)
  await expect(component).toHaveClass(/my-custom/)
})

test('glow variant', async ({ mount }) => {
  const component = await mount(<Card variant='glow'>glow</Card>)
  await expect(component).toHaveClass(/card-glow/)
  await expect(component).toHaveClass(/gradient-border/)
})
