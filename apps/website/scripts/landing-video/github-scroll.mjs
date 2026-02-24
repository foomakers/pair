/**
 * Records a GitHub issue scroll for the demo video.
 *
 * Two-step usage (private repos need auth):
 *
 *   Step 1 — Login (once, saves auth state):
 *     node github-scroll.mjs --login
 *     → opens browser, log into GitHub, then close the browser
 *
 *   Step 2 — Record (headless, uses saved auth):
 *     node github-scroll.mjs
 *     → outputs github-scroll.webm
 *
 * Output: github-scroll.webm in this directory
 */

import { chromium } from '@playwright/test'
import { readdirSync, statSync, renameSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Config ──────────────────────────────────────────────────────────
const ISSUE_URL = 'https://github.com/foomakers/pair/issues/146'
const OUTPUT = join(__dirname, 'github-scroll.webm')
const AUTH_STATE = join(__dirname, '.auth-state.json')
const VIEWPORT = { width: 1280, height: 720 }
const SCROLL_DURATION_MS = 4000
const SCROLL_STEP_PX = 3
const SCROLL_INTERVAL_MS = 16 // ~60fps
// ────────────────────────────────────────────────────────────────────

const isLogin = process.argv.includes('--login')

if (isLogin) {
  // ── Step 1: Interactive login ──
  console.log('==> Opening browser — log into GitHub, then close the browser window.')
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ viewport: VIEWPORT })
  const page = await context.newPage()
  await page.goto('https://github.com/login')

  // Wait for the user to log in and navigate to any GitHub page
  await page.waitForURL('https://github.com/**', { timeout: 120_000 })
  console.log('==> Logged in. Saving auth state...')

  await context.storageState({ path: AUTH_STATE })
  await browser.close()
  console.log(`==> Auth state saved to ${AUTH_STATE}`)
  console.log('==> Now run without --login to record.')
  process.exit(0)
}

// ── Step 2: Record ──
if (!existsSync(AUTH_STATE)) {
  console.error('Error: no auth state found. Run with --login first:')
  console.error('  node github-scroll.mjs --login')
  process.exit(1)
}

console.log('==> Recording GitHub issue scroll (headless)...')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: VIEWPORT,
  colorScheme: 'dark',
  storageState: AUTH_STATE,
  recordVideo: { dir: __dirname, size: VIEWPORT },
})

const page = await context.newPage()

// Navigate and wait for issue body to render
await page.goto(ISSUE_URL, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="issue-body"]', { timeout: 15000 })
  .catch(() => page.waitForSelector('.markdown-body', { timeout: 5000 }))

// Pause before scrolling
await page.waitForTimeout(800)

// Smooth scroll
const steps = Math.floor(SCROLL_DURATION_MS / SCROLL_INTERVAL_MS)
for (let i = 0; i < steps; i++) {
  await page.mouse.wheel(0, SCROLL_STEP_PX)
  await page.waitForTimeout(SCROLL_INTERVAL_MS)
}

// Pause at bottom
await page.waitForTimeout(800)

await context.close()
await browser.close()

// Rename Playwright's generated video file to our target
const files = readdirSync(__dirname).filter(f => f.endsWith('.webm') && f !== 'github-scroll.webm')
if (files.length > 0) {
  const latest = files
    .map(f => ({ f, t: statSync(join(__dirname, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].f
  renameSync(join(__dirname, latest), OUTPUT)
}

console.log(`==> GitHub scroll recorded: ${OUTPUT}`)
