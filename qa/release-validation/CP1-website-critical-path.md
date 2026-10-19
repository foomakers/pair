# CP1 — Website Critical Path

**Priority**: P0
**Scope**: Landing page live, core navigation, responsive layout, meta tags, favicon
**Channels**: final only — pre/rc deploy no website (`release.yml`). Run against a PR preview `$BASE_URL` (Vercel preview) when validating a pre/rc, otherwise mark SKIP (final-only).
**Preconditions**: Website deployed to production at `$BASE_URL`

---

## MT-CP101: Landing page loads

**Priority**: P0
**Preconditions**: None
**Category**: Website

### Steps

1. Navigate to `$BASE_URL`
2. Check HTTP status

### Expected Result

- HTTP 200
- Page title contains "pair"

---

## MT-CP102: Hero section content

**Priority**: P0
**Preconditions**: MT-CP101 passes
**Category**: Website

### Steps

1. On `$BASE_URL`, inspect the hero section

### Expected Result

- Pair logo visible
- Claim text "Code is the easy part." present
- "Get started" CTA button visible and clickable, linking to `$BASE_URL/docs/getting-started/quickstart`
- Inline `npm install -g @foomakers/pair-cli` shown under the CTA
- Optional plugin line shown: `/plugin install pair@pair`

---

## MT-CP103: Works With section

**Priority**: P0
**Preconditions**: MT-CP101 passes
**Category**: Website

### Steps

1. On `$BASE_URL`, scroll to "Works With" section

### Expected Result

- 5 tool names visible: Claude Code, Cursor, VS Code Copilot, Windsurf, Codex

---

## MT-CP104: Audience tracks displayed

**Priority**: P0
**Preconditions**: MT-CP101 passes
**Category**: Website

### Steps

1. On `$BASE_URL`, locate audience tracks section

### Expected Result

- 3 tracks visible: Solo Developer (or similar), Team, Organization

---

## MT-CP105: Audience track CTA navigates to docs

**Priority**: P0
**Preconditions**: MT-CP101 passes
**Category**: Website

### Steps

1. Click the Solo Developer track CTA
2. Note destination URL
3. Navigate back, click Team track CTA
4. Navigate back, click Organization track CTA

### Expected Result

- Each CTA navigates to a distinct docs page:
  - Solo Dev → `$BASE_URL/docs/getting-started/quickstart`
  - Team → `$BASE_URL/docs/getting-started/choose-your-path#team`
  - Organization → `$BASE_URL/docs/guides/external-kb`
- Each destination returns HTTP 200 (Team: the page, the `#team` anchor scrolls to the Team section)

---

## MT-CP106: Main CTA and Releases link

**Priority**: P0
**Preconditions**: MT-CP101 passes
**Category**: Website

### Steps

1. Click the primary "Get started" button in the hero
2. Navigate back, scroll to the Open Source section, click the GitHub Releases link

### Expected Result

- Hero CTA navigates to `$BASE_URL/docs/getting-started/quickstart` (HTTP 200)
- Open Source section link navigates to `https://github.com/foomakers/pair/releases/latest` (HTTP 200, or 302 redirect to latest release)

---

## MT-CP107: Docs entry point loads

**Priority**: P0
**Preconditions**: None
**Category**: Website

### Steps

1. Navigate to `$BASE_URL/docs`

### Expected Result

- HTTP 200
- Sidebar navigation visible with doc sections

---

## MT-CP108: Favicon present

**Priority**: P1
**Preconditions**: MT-CP101 passes
**Category**: Website

### Steps

1. Check `<link rel="icon">` in page source or inspect browser tab icon

### Expected Result

- Favicon loads (not browser default)
- Shows pair brand icon (pills offset logo)

---

## MT-CP109: OG meta tags

**Priority**: P1
**Preconditions**: MT-CP101 passes
**Category**: Website

### Steps

1. Inspect page source for `<meta property="og:*">` tags

### Expected Result

- `og:title` present and non-empty
- `og:description` present and non-empty
- `og:image` present and URL returns 200

---

## MT-CP110: Responsive — mobile viewport

**Priority**: P1
**Preconditions**: MT-CP101 passes
**Category**: Website

### Steps

1. Resize browser to 375×812 (iPhone viewport)
2. Navigate to `$BASE_URL`
3. Scroll through entire page

### Expected Result

- No horizontal scroll
- All sections visible and readable
- Navigation accessible (hamburger menu or equivalent)

---

## MT-CP111: Responsive — tablet viewport

**Priority**: P1
**Preconditions**: MT-CP101 passes
**Category**: Website

### Steps

1. Resize browser to 768×1024 (iPad viewport)
2. Navigate to `$BASE_URL`

### Expected Result

- Layout adapts correctly
- No overlapping elements or broken grid

---

## MT-CP112: 404 page

**Priority**: P1
**Preconditions**: None
**Category**: Website

### Steps

1. Navigate to `$BASE_URL/this-page-does-not-exist-xyz`

### Expected Result

- Returns 404 status (or custom 404 page)
- Does not show a blank page or crash

---

## MT-CP113: GitHub link functional

**Priority**: P1
**Preconditions**: MT-CP101 passes
**Category**: Website

### Steps

1. Find the GitHub link on the landing page (nav bar or open source section)
2. Click it

### Expected Result

- Opens `https://github.com/foomakers/pair`
- GitHub page returns 200

### Notes

- Link may open in new tab

---

## MT-CP114: v0.5.0 landing sections

**Priority**: P1
**Preconditions**: MT-CP101 passes
**Category**: Website

### Steps

1. On `$BASE_URL`, scroll through the page below the hero
2. Click the "What's new" banner link, then navigate back

### Expected Result

- "New in v0.5.0:" banner present, link goes to `$BASE_URL/docs/whats-new` (HTTP 200)
- Process lifecycle section: 4 phases (Induction, Strategic planning, Iteration, Execution), link to `/docs/process-lifecycle`
- Three modes section: Assisted, Supervised, Autonomous, each with a steering wheel icon and an automation-level bar (1, 2, 3 of 3 filled); "Choose your mode" link to `/docs/process-lifecycle/lifecycle-modes`
- Delivery section: Implement, Verify, Fix inside a seal, Resume anywhere; link to `/docs/process-lifecycle/delivery-workflow`
- Risk tiers section present, link to `/docs/process-lifecycle/tag-driven-automation`
- All links return HTTP 200

---

## Changelog

- #543: channel note (final-only / PR preview).
- #543 inc. 2: MT-CP102/105/106 aligned with the v0.5.0 landing (Get started CTA, Solo/Team targets, Releases link in Open Source); new MT-CP114 for the new landing sections.
