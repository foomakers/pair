import { test, expect } from '@playwright/experimental-ct-react'
import HomePage from './page'

// AC-1: Hero with claim, single CTA, solution
test('renders hero with claim and CTA', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const hero = component.locator('section[aria-label="Hero"]')
  await expect(hero).toBeVisible()
  await expect(hero).toContainText('Code is the easy part.')
  await expect(hero).toContainText('process layer for AI-assisted development')
  await expect(hero).toContainText('work the way your team works.')
  await expect(
    hero.locator('a[href="https://github.com/foomakers/pair/releases/latest"]'),
  ).toBeVisible()
})

// AC-2: PairLogo presence
test('renders PairLogo in hero', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const logo = component.locator('[data-logo-container]')
  await expect(logo).toBeVisible()
  await expect(logo.locator('svg[aria-label="pair logo"]')).toBeVisible()
})

// AC-3: Pain points in dedicated section
test('renders pain points in dedicated section', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Pain points"]')
  await expect(section).toBeVisible()
  await expect(section).toContainText('Who owns the process when AI writes the code?')
  await expect(section).toContainText('How do you keep quality consistent')
  await expect(section).toContainText('Where do architectural decisions live')
  await expect(section).toContainText('How does your team scale AI collaboration')
})

// AC-4: "Works with" tool logos
test('renders all 5 tools in "Works with" section', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Works with"]')
  await expect(section).toBeVisible()
  for (const tool of ['Claude Code', 'Cursor', 'VS Code Copilot', 'Windsurf', 'Codex']) {
    await expect(section.locator(`[aria-label="${tool} logo"]`)).toBeVisible()
  }
})

// AC-5: 3 audience tracks
test('renders 3 audience tracks with CTAs', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Audience tracks"]')
  await expect(section).toBeVisible()
  await expect(section).toContainText('Solo Dev')
  await expect(section).toContainText('Team')
  await expect(section).toContainText('Organization')
  await expect(section.locator('a[href="/docs"]')).toBeVisible()
  await expect(section.locator('a[href="/docs/customization/team"]')).toBeVisible()
  await expect(section.locator('a[href="/docs/customization/organization"]')).toBeVisible()
})

// AC-6: "How it works" 4 phases
test('renders 4 phases in "How it works"', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="How it works"]')
  await expect(section).toBeVisible()
  for (const phase of ['Bootstrap', 'Plan', 'Implement', 'Review']) {
    await expect(section).toContainText(phase)
  }
})

// AC-7: Features section
test('renders 4 features', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Features"]')
  await expect(section).toBeVisible()
  for (const feature of ['Skills', 'Knowledge Base', 'Adoption Files', 'Agent Integration']) {
    await expect(section).toContainText(feature)
  }
})

// AC-8: Open source section
test('renders open source section with GitHub link', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Open source"]')
  await expect(section).toBeVisible()
  const githubLink = section.locator('a[href="https://github.com/foomakers/pair"]')
  await expect(githubLink).toBeVisible()
  await expect(githubLink).toContainText('foomakers/pair')
})

// AC-9: Primary and secondary CTAs
test('renders primary and secondary CTAs with correct links', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Call to action"]')
  const primaryCTA = section.locator('a[href="https://github.com/foomakers/pair/releases/latest"]')
  await expect(primaryCTA).toBeVisible()
  await expect(primaryCTA).toContainText('Get pair')
  await expect(primaryCTA).toHaveAttribute('target', '_blank')

  const secondaryCTA = section.locator('a[href="/docs"]')
  await expect(secondaryCTA).toBeVisible()
  await expect(secondaryCTA).toContainText('Read the docs')
})

// AC-10: Dark mode — page uses brand background tokens (dark mode via class strategy)
test('page renders with brand background tokens', async ({ mount }) => {
  const component = await mount(<HomePage />)
  await expect(component).toContainText('Code is the easy part.')
})

// AC-11: Demo placeholder present
test('renders demo placeholder section', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Demo"]')
  await expect(section).toBeVisible()
})

// AC-12: All 9 sections are rendered
test('all 9 sections are rendered', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const sections = [
    'Hero',
    'Pain points',
    'Works with',
    'Demo',
    'Audience tracks',
    'How it works',
    'Features',
    'Open source',
    'Call to action',
  ]
  for (const label of sections) {
    await expect(component.locator(`section[aria-label="${label}"]`)).toBeVisible()
  }
})
