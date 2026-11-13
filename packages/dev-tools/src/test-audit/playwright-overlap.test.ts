import { describe, it, expect } from 'vitest'

import { analyze } from './playwright-overlap'

const e2e = (body: string) => `import { test, expect } from '@playwright/test'\n${body}\n`

describe('playwright fingerprint overlap', () => {
  it('flags a test whose visits, actions and assertions fit inside another test', () => {
    const rows = analyze({
      'apps/site/e2e/a.e2e.test.ts': e2e(`
test('short', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Home')
})
test('long', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Home')
  await page.locator('a').click()
})
test('other page', async ({ page }) => {
  await page.goto('/docs')
  await expect(page).toHaveTitle('Home')
})`),
    })
    expect(rows.map(r => [r.name, r.class, r.containedIn])).toEqual([
      ['short', 'redundant', 'apps/site/e2e/a.e2e.test.ts::long'],
      ['long', 'effective', undefined],
      ['other page', 'effective', undefined],
    ])
  })

  it('keeps identical tests apart: the later one is the redundant one', () => {
    const t = `test('%', async ({ page }) => { await page.goto('/'); await expect(page).toHaveURL('/') })`
    const rows = analyze({
      'apps/site/e2e/b.e2e.test.ts': e2e(`${t.replace('%', 'first')}\n${t.replace('%', 'second')}`),
    })
    expect(rows.map(r => [r.name, r.class])).toEqual([
      ['first', 'effective'],
      ['second', 'redundant'],
    ])
  })

  it('never compares across apps and reports tests with no signal', () => {
    const t = `test('same', async ({ page }) => { await page.goto('/'); await page.locator('a').click() })`
    const rows = analyze({
      'apps/a/e2e/x.e2e.test.ts': e2e(t),
      'apps/b/e2e/x.e2e.test.ts': e2e(`${t}\ntest('empty', async () => {})`),
    })
    expect(rows.map(r => r.class)).toEqual(['effective', 'effective', 'no-signal'])
  })

  it('does not judge tests that only visit or mount: their checks live in helpers', () => {
    const rows = analyze({
      'apps/a/e2e/y.e2e.test.ts': e2e(
        `test('v', async ({ page }) => { await page.goto('/'); await checkA11y(page) })\ntest('w', async ({ page }) => { await page.goto('/'); await page.locator('a').click() })`,
      ),
    })
    expect(rows.map(r => r.class)).toEqual(['no-signal', 'effective'])
  })

  it('fingerprints mounted components in component tests', () => {
    const rows = analyze({
      'packages/ui/src/B.ct.test.tsx': `import { test, expect } from '@playwright/experimental-ct-react'
test('a', async ({ mount }) => { const c = await mount(<B v='x'>t</B>); await expect(c).toContainText('t') })
test('b', async ({ mount }) => { const c = await mount(<B v='x'>t</B>); await expect(c).toContainText('t'); await c.click() })`,
    })
    expect(rows.map(r => r.class)).toEqual(['redundant', 'effective'])
  })
})
