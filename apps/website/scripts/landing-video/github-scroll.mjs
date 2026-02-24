/**
 * Records a GitHub-style issue scroll for the demo video.
 *
 * Renders a static HTML page styled like GitHub dark theme showing
 * issue #42 "Add user authentication" — matching the terminal demo script.
 * Then records Playwright scrolling it.
 *
 * Prerequisites:
 *   npx playwright install chromium
 *
 * Usage:
 *   node github-scroll.mjs
 *
 * Output: github-scroll.webm in this directory
 */

import { chromium } from '@playwright/test'
import { writeFileSync, readdirSync, statSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Config ──────────────────────────────────────────────────────────
const OUTPUT = join(__dirname, 'github-scroll.webm')
const VIEWPORT = { width: 1280, height: 720 }
const SCROLL_DURATION_MS = 4000
const SCROLL_STEP_PX = 5
const SCROLL_INTERVAL_MS = 16 // ~60fps
// ────────────────────────────────────────────────────────────────────

// Static HTML matching issue #42 from the demo scenario
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>#42 Add user authentication</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown-dark.min.css">
  <style>
    body {
      background: #0d1117;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
    }
    .container { max-width: 900px; margin: 0 auto; padding: 24px 32px; }
    .issue-header { border-bottom: 1px solid #30363d; padding-bottom: 16px; margin-bottom: 16px; }
    .issue-title { font-size: 28px; font-weight: 600; color: #e6edf3; margin: 0 0 8px 0; }
    .issue-title .number { color: #7d8590; font-weight: 400; }
    .issue-meta { font-size: 14px; color: #7d8590; display: flex; align-items: center; gap: 8px; }
    .issue-meta .author { color: #e6edf3; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; }
    .badge-open { background: #238636; color: #fff; }
    .label { background: #1f6feb33; color: #58a6ff; border: 1px solid #1f6feb55; }
    .label-p0 { background: #da363333; color: #f85149; border: 1px solid #da363355; }
    .markdown-body { font-size: 15px; line-height: 1.6; }
    .markdown-body h2 { border-bottom: 1px solid #30363d; padding-bottom: 8px; margin-top: 24px; }
    .markdown-body table { border-collapse: collapse; width: 100%; }
    .markdown-body table th, .markdown-body table td { border: 1px solid #30363d; padding: 6px 12px; }
    .markdown-body table th { background: #161b22; }
    .markdown-body code { background: #161b22; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    .markdown-body pre { background: #161b22; border-radius: 6px; padding: 12px; overflow-x: auto; }
    .markdown-body ul { padding-left: 24px; }
    .markdown-body li { margin: 4px 0; }
    .markdown-body input[type="checkbox"] { margin-right: 6px; }
    .markdown-body strong { color: #e6edf3; }
    .markdown-body blockquote { border-left: 3px solid #30363d; padding-left: 16px; color: #7d8590; }
  </style>
</head>
<body>
  <div class="container">
    <div class="issue-header">
      <h1 class="issue-title">Add user authentication <span class="number">#42</span></h1>
      <div class="issue-meta">
        <span class="badge badge-open">Open</span>
        <span class="author">rucka</span> opened this issue
        <span class="badge label">user story</span>
        <span class="badge label-p0">P0</span>
      </div>
    </div>
    <div class="markdown-body">

<h2>Story Statement</h2>
<p><strong>As a</strong> registered user<br>
<strong>I want</strong> to authenticate with my credentials<br>
<strong>So that</strong> I can securely access protected resources</p>

<p><strong>Parent Epic</strong>: <a href="#">Security &amp; Access Control #12</a><br>
<strong>Status</strong>: Refined<br>
<strong>Priority</strong>: P0 (Must-Have)</p>

<h2>Acceptance Criteria</h2>

<p><strong>Given-When-Then Format:</strong></p>

<ol>
<li><strong>Given</strong> a user submits the login form<br>
<strong>When</strong> credentials are valid<br>
<strong>Then</strong> a session token is returned with 24h expiry</li>

<li><strong>Given</strong> a user submits the login form<br>
<strong>When</strong> credentials are invalid<br>
<strong>Then</strong> a 401 error with message is returned</li>

<li><strong>Given</strong> a session token is included in a request<br>
<strong>When</strong> the token has expired<br>
<strong>Then</strong> a 401 error is returned and the user must re-authenticate</li>
</ol>

<h2>Definition of Done Checklist</h2>

<ul>
<li><input type="checkbox" checked disabled> Auth middleware created with JWT verification</li>
<li><input type="checkbox" checked disabled> Password hashing with bcrypt (12 rounds)</li>
<li><input type="checkbox" checked disabled> Token expiry validation (24h)</li>
<li><input type="checkbox" checked disabled> Unit tests passing (4/4)</li>
<li><input type="checkbox" checked disabled> <code>pnpm quality-gate</code> passes</li>
<li><input type="checkbox" disabled> Code reviewed and merged</li>
</ul>

<h2>Technical Analysis</h2>

<p><strong>Technical Strategy</strong>: JWT-based stateless authentication with bcrypt password hashing. Middleware pattern for route protection.</p>

<p><strong>Key Components</strong>:</p>
<ul>
<li><code>src/middleware/auth.ts</code> — JWT verification middleware</li>
<li><code>src/middleware/auth.test.ts</code> — Unit tests (4 cases)</li>
<li><code>src/services/password.ts</code> — bcrypt hashing service</li>
<li><code>src/routes/login.ts</code> — Login endpoint</li>
</ul>

<h2>Task Breakdown</h2>

<ul>
<li><input type="checkbox" checked disabled> <strong>T-1</strong>: Create auth middleware with JWT verification</li>
<li><input type="checkbox" checked disabled> <strong>T-2</strong>: Implement password hashing service</li>
<li><input type="checkbox" checked disabled> <strong>T-3</strong>: Add login endpoint with token generation</li>
</ul>

<table>
<thead><tr><th>AC</th><th>Brief label</th><th>Tasks</th></tr></thead>
<tbody>
<tr><td>AC-1</td><td>Valid credentials → token</td><td>T-1, T-3</td></tr>
<tr><td>AC-2</td><td>Invalid credentials → 401</td><td>T-1, T-3</td></tr>
<tr><td>AC-3</td><td>Expired token → 401</td><td>T-1</td></tr>
</tbody>
</table>

<h2>Story Sizing</h2>

<p><strong>Final Story Points</strong>: M(3)<br>
<strong>Confidence Level</strong>: High<br>
<strong>Sprint Fit Assessment</strong>: Fits in single sprint</p>

    </div>
  </div>
</body>
</html>`

const htmlPath = join(__dirname, '_issue-preview.html')
writeFileSync(htmlPath, html)
console.log('==> Local issue preview created (issue #42: Add user authentication)')

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
