# CP1 — Website Critical Path

**Priority**: P0
**Scope**: Landing page live, core navigation, responsive layout, meta tags, favicon
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
- "Get pair" CTA button visible and clickable, linking to `https://github.com/foomakers/pair/releases/latest`

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
  - Solo Dev → `$BASE_URL/docs`
  - Team → `$BASE_URL/docs/customization/team`
  - Organization → `$BASE_URL/docs/customization/organization`
- Each destination returns HTTP 200

---

## MT-CP106: Main CTA navigates to releases

**Priority**: P0
**Preconditions**: MT-CP101 passes
**Category**: Website

### Steps

1. Click the primary "Get pair" button in the hero

### Expected Result

- Navigates to `https://github.com/foomakers/pair/releases/latest`
- Destination returns HTTP 200 (or 302 redirect to latest release)

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
