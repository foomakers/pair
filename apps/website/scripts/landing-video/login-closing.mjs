/**
 * Records the login → closing sequence for the demo video.
 *
 * Renders a dark-themed login page, fills credentials via Playwright,
 * then transitions to the branded closing (claim + pair logo).
 *
 * Prerequisites:
 *   npx playwright install chromium
 *
 * Usage:
 *   node login-closing.mjs
 *
 * Output: login-closing.webm in this directory
 */

import { chromium } from '@playwright/test'
import {
  writeFileSync,
  readdirSync,
  statSync,
  renameSync,
  unlinkSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const OUTPUT = join(__dirname, 'login-closing.webm')
const VIEWPORT = { width: 1280, height: 720 }

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>myapp</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0d14;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans",
                   Helvetica, Arial, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Fake browser chrome */
    .browser-bar {
      background: #1e1e1e;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid #333;
    }
    .dots span { margin-right: 6px; }
    .dot-red { color: #ff5f56; }
    .dot-yellow { color: #ffbd2e; }
    .dot-green { color: #27c93f; }
    .url-bar {
      background: #2d2d2d;
      border-radius: 6px;
      padding: 4px 16px;
      font-size: 13px;
      color: #999;
      flex: 1;
      max-width: 400px;
    }

    .content {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Login form */
    #login-container {
      transition: opacity 0.5s ease;
    }
    .login-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      padding: 48px;
      width: 400px;
    }
    .login-card h1 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #e6edf3;
    }
    .login-card .subtitle {
      font-size: 14px;
      color: #7d8590;
      margin-bottom: 32px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      font-size: 13px;
      color: #7d8590;
      margin-bottom: 6px;
    }
    .form-group input {
      width: 100%;
      padding: 10px 14px;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 8px;
      color: #e6edf3;
      font-size: 15px;
      outline: none;
      transition: border-color 0.2s;
    }
    .form-group input:focus {
      border-color: #0062ff;
    }
    .login-btn {
      width: 100%;
      padding: 12px;
      background: #0062ff;
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      margin-top: 8px;
    }
    .login-btn:hover { background: #0051d4; }
    .login-btn.loading {
      background: #0051d4;
      pointer-events: none;
    }

    /* Closing */
    #closing-container {
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 1s ease;
    }
    .claim {
      font-size: 42px;
      font-weight: 700;
      color: #0062ff;
      margin-bottom: 40px;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      opacity: 0;
      transition: opacity 2.5s ease 1s;
    }
    .logo.visible { opacity: 1; }
    .pill {
      width: 32px;
      height: 32px;
      border-radius: 6px;
    }
    .pill-blue { background: #0062ff; }
    .pill-teal { background: #00d1ff; }
    .logo-text {
      font-size: 36px;
      font-weight: 700;
      color: #fff;
      letter-spacing: -0.5px;
    }
  </style>
</head>
<body>
  <div class="browser-bar">
    <div class="dots">
      <span class="dot-red">\u25CF</span>
      <span class="dot-yellow">\u25CF</span>
      <span class="dot-green">\u25CF</span>
    </div>
    <div class="url-bar">localhost:3000/login</div>
  </div>

  <div class="content">
    <div id="login-container">
      <div class="login-card">
        <h1>Sign in</h1>
        <p class="subtitle">Welcome to myapp</p>
        <form id="login-form">
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="email" placeholder="you@example.com" autocomplete="off">
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="password" placeholder="••••••••" autocomplete="off">
          </div>
          <button type="submit" class="login-btn" id="login-btn">Sign in</button>
        </form>
      </div>
    </div>

    <div id="closing-container">
      <div class="claim">Code is the easy part.</div>
      <div class="logo" id="logo">
        <div class="pill pill-blue"></div>
        <div class="pill pill-teal"></div>
        <span class="logo-text">pair</span>
      </div>
    </div>
  </div>

  <script>
    document.getElementById('login-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = document.getElementById('login-btn');
      btn.textContent = 'Signing in\u2026';
      btn.classList.add('loading');

      setTimeout(function() {
        document.getElementById('login-container').style.opacity = '0';

        setTimeout(function() {
          document.getElementById('login-container').style.display = 'none';
          var closing = document.getElementById('closing-container');
          closing.style.display = 'flex';

          requestAnimationFrame(function() {
            requestAnimationFrame(function() {
              closing.style.opacity = '1';
              document.getElementById('logo').classList.add('visible');
            });
          });
        }, 600);
      }, 800);
    });
  </script>
</body>
</html>`

const htmlPath = join(__dirname, '_login-closing.html')
writeFileSync(htmlPath, html)
console.log('==> Login + closing page created')

console.log('==> Recording login → closing...')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: VIEWPORT,
  colorScheme: 'dark',
  recordVideo: { dir: __dirname, size: VIEWPORT },
})

const page = await context.newPage()
await page.goto(`file://${htmlPath}`, { waitUntil: 'load' })
await page.waitForTimeout(800)

// Fill login form
await page.locator('#email').click()
await page.locator('#email').type('dev@myapp.io', { delay: 40 })
await page.waitForTimeout(300)

await page.locator('#password').click()
await page.locator('#password').type('s3cur3p4ss', { delay: 30 })
await page.waitForTimeout(500)

// Submit — triggers transition to closing
await page.locator('#login-btn').click()

// Wait for closing animations to finish (800ms delay + 600ms fade-out + 1s fade-in + 1s logo delay + 2.5s logo fade)
await page.waitForTimeout(6500)

await context.close()
await browser.close()

// Cleanup HTML
unlinkSync(htmlPath)

// Rename Playwright's generated video
const files = readdirSync(__dirname).filter(
  (f) =>
    f.endsWith('.webm') &&
    f !== 'login-closing.webm' &&
    f !== 'github-scroll.webm'
)
if (files.length > 0) {
  const latest = files
    .map((f) => ({ f, t: statSync(join(__dirname, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].f
  renameSync(join(__dirname, latest), OUTPUT)
}

console.log(`==> Login + closing recorded: ${OUTPUT}`)
