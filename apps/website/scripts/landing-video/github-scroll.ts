/**
 * Playwright script — records a GitHub issue scroll for the demo video.
 *
 * Prerequisites:
 *   npx playwright install chromium
 *
 * Usage:
 *   npx playwright test --config=playwright.e2e.config.ts github-scroll.ts
 *   — or standalone: npx tsx github-scroll.ts
 *
 * Output: github-scroll.webm in this directory (convert to mp4 via postprod.sh)
 */

import { chromium } from 'playwright'

// ── Config ──────────────────────────────────────────────────────────
const ISSUE_URL = 'https://github.com/foomakers/pair/issues/146'
const OUTPUT = new URL('./github-scroll.webm', import.meta.url).pathname
const VIEWPORT = { width: 1280, height: 720 }
const SCROLL_DURATION_MS = 4000
const SCROLL_STEP_PX = 3
const SCROLL_INTERVAL_MS = 16 // ~60fps
// ────────────────────────────────────────────────────────────────────

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: 'dark',
    recordVideo: { dir: '.', size: VIEWPORT },
  })

  const page = await context.newPage()

  // Navigate and wait for issue body to render
  await page.goto(ISSUE_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.markdown-body', { timeout: 10000 })

  // Pause before scrolling
  await page.waitForTimeout(800)

  // Smooth scroll the issue body
  const steps = Math.floor(SCROLL_DURATION_MS / SCROLL_INTERVAL_MS)
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, SCROLL_STEP_PX)
    await page.waitForTimeout(SCROLL_INTERVAL_MS)
  }

  // Pause at bottom
  await page.waitForTimeout(800)

  await context.close()
  await browser.close()

  // Playwright saves video with a generated name — rename to our target
  const fs = await import('node:fs')
  const path = await import('node:path')
  const dir = path.dirname(OUTPUT)
  const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.webm'))
  if (files.length > 0) {
    const latest = files
      .map((f: string) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a: { t: number }, b: { t: number }) => b.t - a.t)[0].f
    fs.renameSync(path.join(dir, latest), OUTPUT)
  }

  console.log(`==> GitHub scroll recorded: ${OUTPUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
