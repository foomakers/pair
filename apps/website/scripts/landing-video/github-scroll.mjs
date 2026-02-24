/**
 * Records a GitHub-style issue scroll for the demo video.
 *
 * Fetches the rendered issue body via `gh api` (uses CLI auth),
 * serves it as a local HTML page styled like GitHub dark theme,
 * then records Playwright scrolling it.
 *
 * Prerequisites:
 *   gh auth login (already done if you use gh CLI)
 *   npx playwright install chromium
 *
 * Usage:
 *   node github-scroll.mjs
 *
 * Output: github-scroll.webm in this directory
 */

import { chromium } from '@playwright/test'
import { execSync } from 'node:child_process'
import { writeFileSync, readdirSync, statSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Config ──────────────────────────────────────────────────────────
const OWNER = 'foomakers'
const REPO = 'pair'
const ISSUE = 146
const OUTPUT = join(__dirname, 'github-scroll.webm')
const VIEWPORT = { width: 1280, height: 720 }
const SCROLL_DURATION_MS = 4000
const SCROLL_STEP_PX = 3
const SCROLL_INTERVAL_MS = 16 // ~60fps
// ────────────────────────────────────────────────────────────────────

// Fetch issue via gh CLI (uses existing auth)
console.log(`==> Fetching issue #${ISSUE} via gh api...`)
const issueJson = execSync(
  `gh api repos/${OWNER}/${REPO}/issues/${ISSUE} --jq '{title: .title, number: .number, body_html: .body_html, user: .user.login, labels: [.labels[].name], created_at: .created_at}' -H "Accept: application/vnd.github.html+json"`,
  { encoding: 'utf-8' },
)
const issue = JSON.parse(issueJson)

// Build a local HTML page styled like GitHub dark theme
const html = `<!DOCTYPE html>
<html lang="en" data-color-mode="dark" data-dark-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>#${issue.number} ${issue.title}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown-dark.min.css">
  <style>
    body {
      background: #0d1117;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 24px 32px;
    }
    .issue-header {
      border-bottom: 1px solid #30363d;
      padding-bottom: 16px;
      margin-bottom: 16px;
    }
    .issue-title {
      font-size: 28px;
      font-weight: 600;
      color: #e6edf3;
      margin: 0 0 8px 0;
    }
    .issue-title .number {
      color: #7d8590;
      font-weight: 400;
    }
    .issue-meta {
      font-size: 14px;
      color: #7d8590;
    }
    .issue-meta .author { color: #e6edf3; font-weight: 600; }
    .label {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      background: #1f6feb33;
      color: #58a6ff;
      border: 1px solid #1f6feb55;
      margin-left: 8px;
    }
    .markdown-body {
      font-size: 15px;
      line-height: 1.6;
    }
    .markdown-body h2 {
      border-bottom: 1px solid #30363d;
      padding-bottom: 8px;
    }
    .markdown-body table {
      border-collapse: collapse;
    }
    .markdown-body table th,
    .markdown-body table td {
      border: 1px solid #30363d;
      padding: 6px 12px;
    }
    .markdown-body code {
      background: #161b22;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
    }
    .markdown-body pre {
      background: #161b22;
      border-radius: 6px;
      padding: 12px;
    }
    .markdown-body ul li {
      margin: 4px 0;
    }
    .markdown-body input[type="checkbox"] {
      margin-right: 6px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="issue-header">
      <h1 class="issue-title">${issue.title} <span class="number">#${issue.number}</span></h1>
      <div class="issue-meta">
        <span class="author">${issue.user}</span> opened this issue
        ${issue.labels.map(l => `<span class="label">${l}</span>`).join('')}
      </div>
    </div>
    <div class="markdown-body">
      ${issue.body_html}
    </div>
  </div>
</body>
</html>`

const htmlPath = join(__dirname, '_issue-preview.html')
writeFileSync(htmlPath, html)
console.log('==> Local issue preview created.')

// Record with Playwright
console.log('==> Recording scroll...')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: VIEWPORT,
  colorScheme: 'dark',
  recordVideo: { dir: __dirname, size: VIEWPORT },
})

const page = await context.newPage()
await page.goto(`file://${htmlPath}`, { waitUntil: 'load' })
await page.waitForTimeout(800)

// Smooth scroll
const steps = Math.floor(SCROLL_DURATION_MS / SCROLL_INTERVAL_MS)
for (let i = 0; i < steps; i++) {
  await page.mouse.wheel(0, SCROLL_STEP_PX)
  await page.waitForTimeout(SCROLL_INTERVAL_MS)
}

await page.waitForTimeout(800)

await context.close()
await browser.close()

// Cleanup HTML
unlinkSync(htmlPath)

// Rename Playwright's generated video file
const files = readdirSync(__dirname).filter(f => f.endsWith('.webm') && f !== 'github-scroll.webm')
if (files.length > 0) {
  const latest = files
    .map(f => ({ f, t: statSync(join(__dirname, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].f
  renameSync(join(__dirname, latest), OUTPUT)
}

console.log(`==> GitHub scroll recorded: ${OUTPUT}`)
