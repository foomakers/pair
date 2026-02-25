# CP6 — Website Search & Navigation

**Priority**: P1
**Scope**: Orama search, sidebar navigation, prev/next links, llms.txt endpoints, privacy page
**Preconditions**: Website deployed at `$BASE_URL`

---

## MT-CP601: Search dialog opens

**Priority**: P1
**Preconditions**: None
**Category**: Website

### Steps

1. Navigate to `$BASE_URL/docs`
2. Press Cmd+K (macOS) or Ctrl+K (Linux/Windows)

### Expected Result

- Search dialog/modal opens
- Input field is focused and ready for typing

### Notes

- If using Playwright: `browser_press_key` with `Meta+k` or `Control+k`

---

## MT-CP602: Search returns results

**Priority**: P1
**Preconditions**: MT-CP601 passes
**Category**: Website

### Steps

1. Type "install" in the search dialog
2. Wait for results

### Expected Result

- Results appear (at least 1)
- Results include relevant pages (Quickstart, CLI Commands, Install from URL, or similar)

---

## MT-CP603: Search result navigation

**Priority**: P1
**Preconditions**: MT-CP602 passes
**Category**: Website

### Steps

1. Click the first search result
2. Note destination URL

### Expected Result

- Navigates to a valid docs page
- Page loads with HTTP 200

---

## MT-CP604: Search with no results

**Priority**: P2
**Preconditions**: MT-CP601 passes
**Category**: Website

### Steps

1. Type "xyznonexistent12345" in the search dialog

### Expected Result

- No crash
- Shows "no results" message or empty state

---

## MT-CP605: Search API endpoint

**Priority**: P1
**Preconditions**: None
**Category**: Website

### Steps

1. Fetch `$BASE_URL/api/search`

### Expected Result

- HTTP 200
- Response is valid JSON (Orama search index)

---

## MT-CP606: Sidebar navigation completeness

**Priority**: P1
**Preconditions**: None
**Category**: Website

### Steps

1. Navigate to `$BASE_URL/docs`
2. Inspect the sidebar

### Expected Result

- All major sections visible: Getting Started, Concepts, Developer Journey, Customization, Integrations, PM Tools, Guides, Reference, Support, Tutorials, Contributing
- Sections are collapsible/expandable

---

## MT-CP607: Prev/Next footer links (no circular)

**Priority**: P1
**Preconditions**: None
**Category**: Website

### Steps

1. Navigate to `$BASE_URL/docs/getting-started/quickstart`
2. Check "Previous" and "Next" links at page bottom
3. Click "Next"
4. On new page, check that "Previous" links back (not to the same page)

### Expected Result

- Prev/Next links exist
- No page links to itself via Prev or Next
- Links navigate to valid pages (HTTP 200)

---

## MT-CP608: llms.txt index

**Priority**: P1
**Preconditions**: None
**Category**: Website

### Steps

1. Fetch `$BASE_URL/llms.txt`

### Expected Result

- HTTP 200
- Content-Type: text/plain (or starts with `#`)
- Contains header line (llmstxt.org format)
- Contains URLs to doc sections
- Listed URLs are relative or absolute paths under `$BASE_URL`

---

## MT-CP609: llms-full.txt content

**Priority**: P1
**Preconditions**: None
**Category**: Website

### Steps

1. Fetch `$BASE_URL/llms-full.txt`

### Expected Result

- HTTP 200
- Content-Type: text/plain
- Contains full page content with separators between pages
- Substantially larger than llms.txt (full content vs index)

---

## MT-CP610: llms.txt links resolve

**Priority**: P2
**Preconditions**: MT-CP608 passes
**Category**: Website

### Steps

1. Parse URLs from `$BASE_URL/llms.txt`
2. For each URL, check HTTP status

### Expected Result

- All listed URLs return HTTP 200

### Notes

- Can be batched with curl for efficiency

---

## MT-CP611: Privacy page

**Priority**: P1
**Preconditions**: None
**Category**: Website

### Steps

1. Navigate to `$BASE_URL/privacy`

### Expected Result

- HTTP 200
- Title contains "Privacy"
- Content mentions PostHog, cookieless/analytics approach
