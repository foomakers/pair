import { test, expect } from '@playwright/experimental-ct-react'
import HomePage from './page'

const QUICKSTART = '/docs/getting-started/quickstart'

// AC-1: Hero keeps the H1, states the lifecycle and the three modes, routes to Quickstart
test('renders hero with claim, sub-head and Quickstart CTA', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const hero = component.locator('section[aria-label="Hero"]')
  await expect(hero).toBeVisible()
  await expect(hero).toContainText('Code is the easy part.')
  await expect(hero).toContainText('from PRD to merged PR')
  await expect(hero).toContainText('Assisted, supervised or autonomous')
  const cta = hero.locator(`a[href="${QUICKSTART}"]`)
  await expect(cta).toBeVisible()
  await expect(cta).toContainText('Get started')
})

// AC-1: install command inline, Claude Code plugin marked optional
test('hero shows the install command and the optional plugin', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const hero = component.locator('section[aria-label="Hero"]')
  await expect(hero.locator('code', { hasText: 'npm install -g @foomakers/pair-cli' })).toBeVisible()
  await expect(hero).toContainText('/plugin install pair@pair')
  await expect(hero).toContainText('optional')
})

test('renders PairLogo in hero', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const logo = component.locator('[data-logo-container]')
  await expect(logo).toBeVisible()
  await expect(logo.locator('svg[aria-label="pair logo"]')).toBeVisible()
})

// AC-2: What's new banner
test("renders the v0.5.0 banner linking to What's new", async ({ mount }) => {
  const component = await mount(<HomePage />)
  const banner = component.locator('section[aria-label="What is new"]')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('v0.5.0')
  await expect(banner.locator('a[href="/docs/whats-new"]')).toBeVisible()
})

// AC-3: Pain points reworded to the v0.5 answer
test('renders pain points about process, verification, decisions and autonomy', async ({
  mount,
}) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Pain points"]')
  await expect(section).toBeVisible()
  await expect(section).toContainText('Who owns the process when AI writes the code?')
  await expect(section).toContainText("Who checks the AI's work?")
  await expect(section).toContainText('Where do decisions live between sessions?')
  await expect(section).toContainText('How far do you let it run?')
  await expect(section).not.toContainText('Cursor')
})

// AC-4: Works with lists seven tools, pi and opencode as text chips, with the two-tier line
test('renders all 7 tools in "Works with" with the harness line', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Works with"]')
  await expect(section).toBeVisible()
  for (const tool of ['Claude Code', 'Cursor', 'VS Code Copilot', 'Windsurf', 'Codex']) {
    await expect(section.locator(`[aria-label="${tool} logo"]`)).toBeVisible()
  }
  for (const tool of ['pi', 'opencode']) {
    await expect(section.locator('span', { hasText: new RegExp(`^${tool}$`) })).toBeVisible()
  }
  await expect(section).toContainText('Assisted mode on every tool')
  await expect(section).toContainText(
    'Supervised and Autonomous need a harness with subagents or an engine',
  )
})

// AC-5: Process lifecycle replaces How it works
test('renders the process lifecycle with the four phases and the diagram', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Process lifecycle"]')
  await expect(section).toBeVisible()
  await expect(component.locator('section[aria-label="How it works"]')).toHaveCount(0)
  for (const phase of ['Induction', 'Strategic planning', 'Iteration', 'Execution']) {
    await expect(section).toContainText(phase)
  }
  await expect(section).toContainText('Two workflows')
  await expect(section.locator('img[src="/diagrams/lifecycle-overview.svg"]')).toBeVisible()
  await expect(section.locator('a[href="/docs/process-lifecycle"]')).toBeVisible()
})

// AC-6: Three modes
test('renders the three modes with the driving analogy and the safe default', async ({
  mount,
}) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Three modes"]')
  await expect(section).toBeVisible()
  for (const mode of ['Assisted', 'Supervised', 'Autonomous']) {
    await expect(section.locator('h3', { hasText: mode })).toBeVisible()
  }
  await expect(section).toContainText('guides every phase')
  await expect(section).toContainText('one card end to end')
  await expect(section).toContainText('watches the backlog')
  await expect(section).toContainText('like the levels of driving automation')
  await expect(section).not.toContainText(/\bL[234]\b/)
  await expect(section).toContainText('nothing merges unattended')
  await expect(section.locator('a[href="/docs/process-lifecycle/lifecycle-modes"]')).toBeVisible()
})

// AC-7: Delivery workflow
test('renders the delivery workflow with independent review, seals and resumable state', async ({
  mount,
}) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Delivery workflow"]')
  await expect(section).toBeVisible()
  await expect(section.locator('h2')).toContainText('AI should not grade its own work.')
  await expect(section).toContainText('independent reviewer')
  await expect(section).toContainText('sealed')
  await expect(section).toContainText('files')
  await expect(
    section.locator('a[href="/docs/process-lifecycle/delivery-workflow"]'),
  ).toBeVisible()
})

// AC-8: Risk tiers and gates
test('renders the risk tiers section linking to tag-driven automation', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Risk tiers and gates"]')
  await expect(section).toBeVisible()
  await expect(section).toContainText('risk tier')
  await expect(section).toContainText('human')
  await expect(
    section.locator('a[href="/docs/process-lifecycle/tag-driven-automation"]'),
  ).toBeVisible()
})

// AC-9: audience tracks reroute
test('renders 3 audience tracks with the rerouted CTAs', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Audience tracks"]')
  await expect(section).toBeVisible()
  await expect(section).toContainText('Solo Dev')
  await expect(section).toContainText('Team')
  await expect(section).toContainText('Organization')
  await expect(section.locator(`a[href="${QUICKSTART}"]`)).toBeVisible()
  await expect(section.locator('a[href="/docs/getting-started/choose-your-path#team"]')).toBeVisible()
  await expect(section.locator('a[href="/docs/guides/external-kb"]')).toBeVisible()
})

// What you get: Agent Integration replaced by the workflows
test('renders 4 features including the workflows', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Features"]')
  await expect(section).toBeVisible()
  for (const feature of ['Skills', 'Knowledge Base', 'Adoption Files', 'Workflows']) {
    await expect(section).toContainText(feature)
  }
  await expect(section).not.toContainText('Agent Integration')
})

// AC-10: Open source without "community-driven"
test('renders open source section with GitHub link', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Open source"]')
  await expect(section).toBeVisible()
  const githubLink = section.locator('a[href="https://github.com/foomakers/pair"]')
  await expect(githubLink).toBeVisible()
  await expect(githubLink).toContainText('foomakers/pair')
  await expect(section).not.toContainText('community-driven')
})

// Final CTA: primary to Quickstart, secondary to docs
test('renders primary and secondary CTAs with correct links', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Call to action"]')
  await expect(section).not.toContainText('under a minute')
  const primaryCTA = section.locator(`a[href="${QUICKSTART}"]`)
  await expect(primaryCTA).toBeVisible()
  await expect(primaryCTA).toContainText('Get started')

  const secondaryCTA = section.locator('a[href="/docs"]')
  await expect(secondaryCTA).toBeVisible()
  await expect(secondaryCTA).toContainText('Read the docs')
})

// AC-10: no em dashes anywhere in the rendered copy
test('rendered copy contains no em dash', async ({ mount }) => {
  const component = await mount(<HomePage />)
  await expect(component).not.toContainText('—')
  const labels = await component.locator('[aria-label]').evaluateAll(nodes =>
    nodes.map(n => n.getAttribute('aria-label') ?? ''),
  )
  expect(labels.filter(l => l.includes('—'))).toEqual([])
})

// AC-11: demo poster is the re-cut terminal frame
test('demo video and fallback use the demo poster', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Demo"]')
  await expect(section).toBeVisible()
  await expect(section.locator('video')).toHaveAttribute('poster', '/demo-poster.png')
  await expect(section.locator('img')).toHaveAttribute('src', '/demo-poster.png')
})

// ---------- Button styling ----------

test('primary buttons have bg-pair-blue class', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const heroCTA = component
    .locator('section[aria-label="Hero"] a')
    .filter({ hasText: 'Get started' })
  await expect(heroCTA).toHaveClass(/bg-pair-blue/)
  await expect(heroCTA).toHaveClass(/text-white/)

  const ctaCTA = component
    .locator('section[aria-label="Call to action"] a')
    .filter({ hasText: 'Get started' })
  await expect(ctaCTA).toHaveClass(/bg-pair-blue/)
  await expect(ctaCTA).toHaveClass(/text-white/)
})

test('outline buttons have gradient-border class', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const docsCTA = component
    .locator('section[aria-label="Call to action"] a')
    .filter({ hasText: 'Read the docs' })
  await expect(docsCTA).toHaveClass(/gradient-border/)

  const githubCTA = component
    .locator('section[aria-label="Open source"] a')
    .filter({ hasText: 'foomakers/pair' })
  await expect(githubCTA).toHaveClass(/gradient-border/)
})

test('audience track buttons have gradient-border class', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const section = component.locator('section[aria-label="Audience tracks"]')
  for (const label of ['Get started', 'Set up your team', 'Roll out across teams']) {
    await expect(section.locator('a').filter({ hasText: label })).toHaveClass(/gradient-border/)
  }
})

// AC-13: every section is a labelled region with a heading
test('all 13 sections are rendered, each with a heading', async ({ mount }) => {
  const component = await mount(<HomePage />)
  const sections = [
    'Hero',
    'What is new',
    'Pain points',
    'Works with',
    'Process lifecycle',
    'Three modes',
    'Delivery workflow',
    'Demo',
    'Risk tiers and gates',
    'Audience tracks',
    'Features',
    'Open source',
    'Call to action',
  ]
  for (const label of sections) {
    const section = component.locator(`section[aria-label="${label}"]`)
    await expect(section).toBeVisible()
    await expect(section.locator('h1, h2').first()).toHaveCount(1)
  }
})
