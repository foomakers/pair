/**
 * Records a GitHub issue scroll for the demo video.
 *
 * Prerequisites:
 *   npx playwright install chromium
 *
 * Usage (from this directory):
 *   node github-scroll.mjs
 *
 * Output: github-scroll.webm in this directory
 */

import { chromium } from 'playwright'
import { readdirSync, statSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Config ──────────────────────────────────────────────────────────
const ISSUE_URL = 'https://github.com/foomakers/pair/issues/146'
const OUTPUT = join(__dirname, 'github-scroll.webm')
const VIEWPORT = { width: 1280, height: 720 }
const SCROLL_DURATION_MS = 4000
const SCROLL_STEP_PX = 3
const SCROLL_INTERVAL_MS = 16 // ~60fps
// ────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: VIEWPORT,
  colorScheme: 'dark',
  recordVideo: { dir: __dirname, size: VIEWPORT },
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
const files = readdirSync(__dirname).filter(f => f.endsWith('.webm'))
if (files.length > 0) {
  const latest = files
    .map(f => ({ f, t: statSync(join(__dirname, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].f
  renameSync(join(__dirname, latest), OUTPUT)
}

console.log(`==> GitHub scroll recorded: ${OUTPUT}`)
